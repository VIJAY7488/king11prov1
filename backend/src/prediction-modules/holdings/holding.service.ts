import mongoose, { ClientSession, Types } from 'mongoose';
import AppError from '../../utils/AppError';
import walletService from '../../mdules/wallet/wallet.service';
import { WalletTxnReason } from '../../mdules/wallet/wallet.types';
import { Holding, IHolding } from './holding.model';
import { HoldingPositionDTO, HoldingSummaryDTO } from './holding.types';
import { TradeOutcome } from '../trades/trade.types';
import { Market } from '../markets/market.model';

const round = (value: number): number => Number(value.toFixed(8));

const toObjectId = (id: string, label: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(id)) throw new AppError(`Invalid ${label}.`, 400);
  return new Types.ObjectId(id);
};

const withTransaction = async <T>(fn: (session: ClientSession) => Promise<T>): Promise<T> => {
  const session = await mongoose.startSession();
  session.startTransaction({
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
  });
  try {
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

class HoldingService {
  calculateAvgPrice(existingQty: number, existingAvg: number, newQty: number, newPrice: number): number {
    const totalQty = existingQty + newQty;
    if (totalQty <= 0) return 0;
    return round(((existingQty * existingAvg) + (newQty * newPrice)) / totalQty);
  }

  calculatePnL(sellPrice: number, avgPrice: number, quantity: number): number {
    return round((sellPrice - avgPrice) * quantity);
  }

  private async getOrCreatePositionDoc(
    userId: string,
    marketId: string,
    outcome: TradeOutcome,
    session: ClientSession
  ): Promise<IHolding> {
    let holding = await Holding.findOne({ userId, marketId, outcome }).session(session);
    if (!holding) {
      [holding] = await Holding.create(
        [
          {
            userId,
            marketId,
            outcome,
            quantity: 0,
            avgPrice: 0,
            investedAmount: 0,
            realizedPnL: 0,
          },
        ],
        { session }
      );
    }
    return holding;
  }

  private toDTO(doc: IHolding): HoldingPositionDTO {
    return {
      userId: doc.userId.toString(),
      marketId: doc.marketId.toString(),
      outcome: doc.outcome,
      quantity: doc.quantity,
      avgPrice: doc.avgPrice,
      investedAmount: doc.investedAmount,
      realizedPnL: doc.realizedPnL,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async getUserHoldings(userId: string, marketId?: string, session?: ClientSession): Promise<HoldingPositionDTO[]> {
    const filter: Record<string, unknown> = { userId: toObjectId(userId, 'userId') };
    if (marketId) filter.marketId = toObjectId(marketId, 'marketId');

    const query = Holding.find(filter).sort({ marketId: 1, outcome: 1 });
    if (session) query.session(session);
    const rows = await query;
    return rows.map((d) => this.toDTO(d));
  }

  async addPosition(
    userId: string,
    marketId: string,
    outcome: TradeOutcome,
    quantity: number,
    price: number,
    session: ClientSession
  ): Promise<IHolding> {
    if (!Number.isFinite(quantity) || quantity <= 0) throw new AppError('quantity must be greater than 0.', 400);
    if (!Number.isFinite(price) || price < 0 || price > 1) throw new AppError('price must be between 0 and 1.', 400);

    const holding = await this.getOrCreatePositionDoc(userId, marketId, outcome, session);
    const newAvg = this.calculateAvgPrice(holding.quantity, holding.avgPrice, quantity, price);
    const newQty = round(holding.quantity + quantity);

    holding.quantity = newQty;
    holding.avgPrice = newAvg;
    holding.investedAmount = round(newQty * newAvg);
    await holding.save({ session });
    return holding;
  }

  async reducePosition(
    userId: string,
    marketId: string,
    outcome: TradeOutcome,
    quantity: number,
    price: number,
    session: ClientSession
  ): Promise<IHolding> {
    if (!Number.isFinite(quantity) || quantity <= 0) throw new AppError('quantity must be greater than 0.', 400);
    if (!Number.isFinite(price) || price < 0 || price > 1) throw new AppError('price must be between 0 and 1.', 400);

    const holding = await this.getOrCreatePositionDoc(userId, marketId, outcome, session);
    if (holding.quantity < quantity) {
      throw new AppError(`Cannot sell ${quantity} ${outcome} shares. Available: ${holding.quantity}.`, 409);
    }

    const pnl = this.calculatePnL(price, holding.avgPrice, quantity);
    const newQty = round(holding.quantity - quantity);

    holding.quantity = newQty;
    holding.realizedPnL = round(holding.realizedPnL + pnl);
    holding.investedAmount = newQty > 0 ? round(newQty * holding.avgPrice) : 0;
    if (newQty === 0) holding.avgPrice = 0;
    await holding.save({ session });
    return holding;
  }

  async applyAmmTrade(args: {
    userId: string;
    marketId: string;
    outcome: TradeOutcome;
    action: 'BUY' | 'SELL';
    quantity: number;
    effectivePrice: number;
    session: ClientSession;
  }): Promise<IHolding> {
    if (args.action === 'BUY') {
      return this.addPosition(args.userId, args.marketId, args.outcome, args.quantity, args.effectivePrice, args.session);
    }
    return this.reducePosition(args.userId, args.marketId, args.outcome, args.quantity, args.effectivePrice, args.session);
  }

  async applyOrderBookExecution(args: {
    buyerId: string;
    sellerId: string;
    marketId: string;
    outcome: TradeOutcome;
    quantity: number;
    buyerPrice: number;
    sellerPrice: number;
    session: ClientSession;
  }): Promise<void> {
    await this.addPosition(args.buyerId, args.marketId, args.outcome, args.quantity, args.buyerPrice, args.session);
    await this.reducePosition(args.sellerId, args.marketId, args.outcome, args.quantity, args.sellerPrice, args.session);
  }

  async getMarketExposure(
    marketId: string,
    session?: ClientSession
  ): Promise<{ yesExposure: number; noExposure: number; currentExposure: number }> {
    const marketObjectId = toObjectId(marketId, 'marketId');
    const query = Holding.aggregate<{ _id: TradeOutcome; qty: number }>([
      { $match: { marketId: marketObjectId } },
      { $group: { _id: '$outcome', qty: { $sum: '$quantity' } } },
    ]);
    if (session) query.session(session);
    const rows = await query;
    let yesExposure = 0;
    let noExposure = 0;
    for (const row of rows) {
      if (row._id === TradeOutcome.YES) yesExposure = round(row.qty);
      if (row._id === TradeOutcome.NO) noExposure = round(row.qty);
    }
    return {
      yesExposure,
      noExposure,
      currentExposure: Math.max(yesExposure, noExposure),
    };
  }

  async getUserHoldingsSummary(userId: string): Promise<HoldingSummaryDTO> {
    const userObjectId = toObjectId(userId, 'userId');
    const [agg] = await Holding.aggregate<{
      totalOpenQuantity: number;
      totalInvestedAmount: number;
      totalRealizedPnL: number;
      holdingsCount: number;
    }>([
      { $match: { userId: userObjectId } },
      {
        $group: {
          _id: null,
          totalOpenQuantity: { $sum: '$quantity' },
          totalInvestedAmount: { $sum: '$investedAmount' },
          totalRealizedPnL: { $sum: '$realizedPnL' },
          holdingsCount: { $sum: 1 },
        },
      },
    ]);

    return {
      totalOpenQuantity: round(agg?.totalOpenQuantity ?? 0),
      totalInvestedAmount: round(agg?.totalInvestedAmount ?? 0),
      totalRealizedPnL: round(agg?.totalRealizedPnL ?? 0),
      holdingsCount: agg?.holdingsCount ?? 0,
    };
  }

  async settleMarketForUser(
    userId: string,
    marketId: string,
    winningOutcome: TradeOutcome
  ): Promise<{ payout: number; settledPositions: number }> {
    const userObjectId = toObjectId(userId, 'userId');
    const marketObjectId = toObjectId(marketId, 'marketId');
    const market = await Market.findById(marketObjectId).select('questionPrice.amount');
    if (!market) throw new AppError('Market not found.', 404);
    const payoutPerShareRaw = Number(market.questionPrice?.amount ?? 1);
    const payoutPerShare = Number.isFinite(payoutPerShareRaw) && payoutPerShareRaw > 0
      ? round(payoutPerShareRaw)
      : 1;

    return withTransaction(async (session) => {
      const holdings = await Holding.find({ userId: userObjectId, marketId: marketObjectId }).session(session);
      if (holdings.length === 0) return { payout: 0, settledPositions: 0 };

      let payout = 0;
      for (const h of holdings) {
        const positionPayout = h.outcome === winningOutcome ? round(h.quantity * payoutPerShare) : 0;
        const realizedDelta = round(positionPayout - h.investedAmount);
        payout = round(payout + positionPayout);

        h.realizedPnL = round(h.realizedPnL + realizedDelta);
        h.quantity = 0;
        h.avgPrice = 0;
        h.investedAmount = 0;
        await h.save({ session });
      }

      if (payout > 0) {
        await walletService.creditSettlement(
          userId,
          payout,
          `SETTLEMENT:${marketId}:${winningOutcome}:${userId}`,
          {
            marketId,
            winningOutcome,
            payoutPerShare,
            source: 'market-resolution',
          },
          session
        );
      }

      return { payout, settledPositions: holdings.length };
    });
  }
}

export default new HoldingService();
