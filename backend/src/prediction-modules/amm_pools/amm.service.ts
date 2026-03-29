import mongoose, { ClientSession, Types } from 'mongoose';
import AppError from '../../utils/AppError';
import walletService from '../../mdules/wallet/wallet.service';
import { WalletTxnReason } from '../../mdules/wallet/wallet.types';
import { Market, IMarket } from '../markets/market.model';
import { MarketStatus } from '../markets/market.types';
import { AmmPool, IAmmPool } from './amm.model';
import {
  AmmTradeAction,
  AmmTradeQuote,
  AmmTradeRequestDTO,
  AmmTradeResult,
  LmsrState,
} from './amm.types';
import { Trade } from '../trades/trade.model';
import { TradeOutcome, TradeType } from '../trades/trade.types';
import holdingService from '../holdings/holding.service';
import riskEngine from '../risk_controls/risk.engine';
import { publishMarketEvent } from '../../config/realtimeBus';

const FEE_RATE = 0.01;
const PRICE_MIN = 0.01;
const PRICE_MAX = 0.99;
const MAX_RETRIES = 3;

const round = (value: number): number => Number(value.toFixed(8));

const toObjectId = (id: string, label: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(id)) throw new AppError(`Invalid ${label}.`, 400);
  return new Types.ObjectId(id);
};

class VersionConflictError extends Error {}

const lmsrCost = (state: LmsrState): number => {
  const ay = state.q_yes / state.b;
  const an = state.q_no / state.b;
  const max = Math.max(ay, an);
  return state.b * (max + Math.log(Math.exp(ay - max) + Math.exp(an - max)));
};

const lmsrPrices = (state: LmsrState): { priceYes: number; priceNo: number } => {
  const ay = state.q_yes / state.b;
  const an = state.q_no / state.b;
  const max = Math.max(ay, an);
  const ey = Math.exp(ay - max);
  const en = Math.exp(an - max);
  const denom = ey + en;
  return {
    priceYes: round(ey / denom),
    priceNo: round(en / denom),
  };
};

const ensureTradableMarket = (market: IMarket): void => {
  if (market.status !== MarketStatus.OPEN) throw new AppError('Market is not open for trading.', 409);
  // Backward compatibility: legacy market docs may not have ammEnabled persisted.
  if (market.ammEnabled === false) throw new AppError('AMM trading is disabled for this market.', 409);
  if (market.closeAt && market.closeAt.getTime() <= Date.now()) {
    throw new AppError('Market trading window has closed.', 409);
  }
};

const buildTradeQuote = (
  action: AmmTradeAction,
  outcome: TradeOutcome,
  quantity: number,
  oldState: LmsrState,
  newState: LmsrState,
  contractValue: number,
  extraSpreadBps = 0
): AmmTradeQuote => {
  const oldCost = lmsrCost(oldState);
  const newCost = lmsrCost(newState);
  const grossAmount = (action === AmmTradeAction.BUY ? newCost - oldCost : oldCost - newCost) * contractValue;

  if (grossAmount <= 0) {
    throw new AppError('Trade quote is not valid for requested quantity.', 400);
  }

  const feeRate = FEE_RATE + (extraSpreadBps / 10_000);
  const fee = round(grossAmount * feeRate);
  const netAmount = action === AmmTradeAction.BUY ? round(grossAmount + fee) : round(grossAmount - fee);
  const oldPrices = lmsrPrices(oldState);
  const newPrices = lmsrPrices(newState);

  return {
    action,
    outcome,
    quantity,
    grossAmount: round(grossAmount),
    fee,
    netAmount,
    priceBefore: outcome === TradeOutcome.YES ? oldPrices.priceYes : oldPrices.priceNo,
    priceAfter: outcome === TradeOutcome.YES ? newPrices.priceYes : newPrices.priceNo,
  };
};

class AmmService {
  private getContractValue(market: IMarket): number {
    const raw = Number(market.questionPrice?.amount ?? 1);
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    return round(raw);
  }

  private async emitAmmRealtime(result: AmmTradeResult): Promise<void> {
    await Promise.all([
      publishMarketEvent(result.marketId, 'price_update', {
        marketId: result.marketId,
        priceYes: result.priceYes,
        priceNo: result.priceNo,
        q_yes: result.q_yes,
        q_no: result.q_no,
        source: 'AMM',
        updatedAt: result.executedAt,
      }),
      publishMarketEvent(result.marketId, 'trade_executed', {
        marketId: result.marketId,
        tradeId: result.tradeId,
        type: 'AMM',
        outcome: result.outcome,
        side: result.action,
        quantity: result.quantity,
        grossAmount: result.grossAmount,
        fee: result.fee,
        netAmount: result.netAmount,
        executedAt: result.executedAt,
      }),
    ]);
  }

  async getQuote(
    marketId: string,
    outcome: TradeOutcome,
    action: AmmTradeAction,
    quantity: number
  ): Promise<AmmTradeQuote> {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError('quantity must be a positive integer.', 400);
    const marketObjectId = toObjectId(marketId, 'marketId');

    const market = await Market.findById(marketObjectId);
    if (!market) throw new AppError('Market not found.', 404);
    ensureTradableMarket(market);
    const contractValue = this.getContractValue(market);

    const riskCheck = await riskEngine.preTradeCheck({
      marketId,
      userId: 'quote-user',
      route: 'AMM',
      side: action === AmmTradeAction.BUY ? 'BUY' : 'SELL',
      outcome,
      quantity,
      skipUserPositionCheck: true,
    });

    const pool = await AmmPool.findOne({ marketId: marketObjectId });
    const oldState: LmsrState = pool
      ? { b: pool.b, q_yes: pool.q_yes, q_no: pool.q_no }
      : { b: market.ammState.b, q_yes: market.ammState.q_yes, q_no: market.ammState.q_no };

    const newState = this.getNewState(oldState, outcome, action, quantity);
    const quote = buildTradeQuote(
      action,
      outcome,
      quantity,
      oldState,
      newState,
      contractValue,
      riskCheck.controls.spreadBps
    );
    return {
      ...quote,
      marketId,
      effectivePrice: round(quote.netAmount / (quantity * contractValue)),
    };
  }

  private async withRetryTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
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
        lastError = error;
        await session.abortTransaction();
        if (!(error instanceof VersionConflictError) || attempt === MAX_RETRIES) throw error;
      } finally {
        session.endSession();
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Trade failed.');
  }

  private async getMarketAndPool(
    marketId: Types.ObjectId,
    session: ClientSession
  ): Promise<{ market: IMarket; pool: IAmmPool }> {
    const market = await Market.findById(marketId).session(session);
    if (!market) throw new AppError('Market not found.', 404);
    ensureTradableMarket(market);

    let pool = await AmmPool.findOne({ marketId }).session(session);
    if (!pool) {
      [pool] = await AmmPool.create(
        [
          {
            marketId,
            b: market.ammState.b ?? 100,
            q_yes: market.ammState.q_yes ?? 1000,
            q_no: market.ammState.q_no ?? 1000,
            totalExposure: market.ammState.totalLiquidity ?? 0,
          },
        ],
        { session }
      );
    }

    return { market, pool };
  }

  private getNewState(oldState: LmsrState, outcome: TradeOutcome, action: AmmTradeAction, quantity: number): LmsrState {
    const next: LmsrState = { ...oldState };
    if (outcome === TradeOutcome.YES) next.q_yes += action === AmmTradeAction.BUY ? quantity : -quantity;
    if (outcome === TradeOutcome.NO) next.q_no += action === AmmTradeAction.BUY ? quantity : -quantity;
    if (next.q_yes < 0 || next.q_no < 0) throw new AppError('Insufficient AMM inventory for requested sell quantity.', 400);
    return next;
  }

  private ensurePriceBounds(state: LmsrState): { priceYes: number; priceNo: number } {
    const prices = lmsrPrices(state);
    if (prices.priceYes < PRICE_MIN || prices.priceYes > PRICE_MAX) {
      throw new AppError(`Trade rejected: YES price must remain within ${PRICE_MIN} and ${PRICE_MAX}.`, 409);
    }
    if (prices.priceNo < PRICE_MIN || prices.priceNo > PRICE_MAX) {
      throw new AppError(`Trade rejected: NO price must remain within ${PRICE_MIN} and ${PRICE_MAX}.`, 409);
    }
    return prices;
  }

  private async applyWalletImpact(
    userId: Types.ObjectId,
    action: AmmTradeAction,
    amount: number,
    referenceId: string,
    metadata: Record<string, unknown>,
    session: ClientSession
  ): Promise<number> {
    if (action === AmmTradeAction.BUY) {
      const debit = await walletService.debitBalance(
        userId.toString(),
        {
          amount,
          referenceId,
          reason: WalletTxnReason.TRADE,
          metadata: { ...metadata, channel: 'amm', action: 'BUY' },
        },
        session
      );
      return debit.currentBalance;
    }

    const credit = await walletService.creditBalance(
      userId.toString(),
      {
        amount,
        referenceId,
        reason: WalletTxnReason.TRADE,
        metadata: { ...metadata, channel: 'amm', action: 'SELL' },
      },
      session
    );
    return credit.currentBalance;
  }

  async executeTrade(
    userId: string,
    marketId: string,
    outcome: TradeOutcome,
    action: AmmTradeAction,
    quantity: number
  ): Promise<AmmTradeResult> {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError('quantity must be a positive integer.', 400);

    const userObjectId = toObjectId(userId, 'userId');
    const marketObjectId = toObjectId(marketId, 'marketId');

    return this.withRetryTransaction(async (session) => {
      const riskCheck = await riskEngine.preTradeCheck(
        {
          marketId,
          userId,
          route: 'AMM',
          side: action === AmmTradeAction.BUY ? 'BUY' : 'SELL',
          outcome,
          quantity,
        },
        session
      );

      const { market, pool } = await this.getMarketAndPool(marketObjectId, session);
      const contractValue = this.getContractValue(market);

      if (action === AmmTradeAction.SELL) {
        const positions = await holdingService.getUserHoldings(userId, marketId, session);
        const position = positions.find((p) => p.outcome === outcome);
        if (!position || position.quantity < quantity) {
          throw new AppError(`Insufficient ${outcome} holdings to sell ${quantity} shares.`, 409);
        }
      }

      const oldState: LmsrState = { b: pool.b, q_yes: pool.q_yes, q_no: pool.q_no };
      const newState = this.getNewState(oldState, outcome, action, quantity);
      const prices = this.ensurePriceBounds(newState);
      const quote = buildTradeQuote(
        action,
        outcome,
        quantity,
        oldState,
        newState,
        contractValue,
        riskCheck.controls.spreadBps
      );
      if (quote.netAmount <= 0) throw new AppError('Trade amount must be positive after fees.', 400);

      const expectedVersion = pool.version;
      const updated = await AmmPool.updateOne(
        { _id: pool._id, version: expectedVersion },
        {
          $set: {
            q_yes: newState.q_yes,
            q_no: newState.q_no,
            cost: round(lmsrCost(newState)),
            priceYes: prices.priceYes,
            priceNo: prices.priceNo,
          },
          $inc: {
            totalVolume: quote.grossAmount,
            totalTrades: 1,
            version: 1,
          },
        },
        { session }
      );
      if (updated.modifiedCount !== 1) throw new VersionConflictError('AMM pool changed concurrently.');

      await Market.updateOne(
        { _id: market._id },
        {
          $set: {
            'ammState.q_yes': newState.q_yes,
            'ammState.q_no': newState.q_no,
            'ammState.b': newState.b,
            'ammState.lastUpdatedAt': new Date(),
          },
        },
        { session }
      );

      const walletRef = `AMM:${action}:${marketId}:${outcome}:${Date.now()}:${userId}`;
      const walletBalanceAfter = await this.applyWalletImpact(
        userObjectId,
        action,
        quote.netAmount,
        walletRef,
        {
          marketId,
          outcome,
          quantity,
          grossAmount: quote.grossAmount,
          fee: quote.fee,
          priceBefore: quote.priceBefore,
          priceAfter: quote.priceAfter,
        },
        session
      );

      // Holdings track canonical odds (0..1), not currency amounts.
      const effectivePrice = quote.quantity > 0
        ? round(quote.grossAmount / (quote.quantity * contractValue))
        : 0;
      await holdingService.applyAmmTrade({
        userId,
        marketId,
        outcome,
        action,
        quantity,
        effectivePrice,
        session,
      });

      await riskEngine.postTradeUpdate(marketId, session);

      const [trade] = await Trade.create(
        [
          {
            marketId: market._id,
            outcome,
            tradeType: TradeType.AMM,
            buyOrderId: null,
            sellOrderId: null,
            buyerId: userObjectId,
            sellerId: null,
            price: outcome === TradeOutcome.YES ? prices.priceYes : prices.priceNo,
            quantity,
            totalValue: quote.grossAmount,
            fees: {
              platform: quote.fee,
              breakdown: { feeRate: FEE_RATE, action, dynamicSpreadBps: riskCheck.controls.spreadBps },
            },
            ammSnapshot: {
              q_yes_before: oldState.q_yes,
              q_no_before: oldState.q_no,
              q_yes_after: newState.q_yes,
              q_no_after: newState.q_no,
            },
            executedAt: new Date(),
          },
        ],
        { session }
      );

      return {
        tradeId: trade._id.toString(),
        marketId,
        outcome,
        action,
        quantity,
        grossAmount: quote.grossAmount,
        fee: quote.fee,
        netAmount: quote.netAmount,
        walletBalanceAfter,
        priceYes: prices.priceYes,
        priceNo: prices.priceNo,
        q_yes: newState.q_yes,
        q_no: newState.q_no,
        poolVersion: expectedVersion + 1,
        executedAt: trade.executedAt,
      };
    });
  }

  buyYes(userId: string, dto: AmmTradeRequestDTO): Promise<AmmTradeResult> {
    return this.executeTrade(userId, dto.marketId, TradeOutcome.YES, AmmTradeAction.BUY, dto.quantity)
      .then(async (result) => {
        await riskEngine.syncRiskSnapshotToRedis(result.marketId);
        await this.emitAmmRealtime(result);
        return result;
      });
  }

  buyNo(userId: string, dto: AmmTradeRequestDTO): Promise<AmmTradeResult> {
    return this.executeTrade(userId, dto.marketId, TradeOutcome.NO, AmmTradeAction.BUY, dto.quantity)
      .then(async (result) => {
        await riskEngine.syncRiskSnapshotToRedis(result.marketId);
        await this.emitAmmRealtime(result);
        return result;
      });
  }

  sellYes(userId: string, dto: AmmTradeRequestDTO): Promise<AmmTradeResult> {
    return this.executeTrade(userId, dto.marketId, TradeOutcome.YES, AmmTradeAction.SELL, dto.quantity)
      .then(async (result) => {
        await riskEngine.syncRiskSnapshotToRedis(result.marketId);
        await this.emitAmmRealtime(result);
        return result;
      });
  }

  sellNo(userId: string, dto: AmmTradeRequestDTO): Promise<AmmTradeResult> {
    return this.executeTrade(userId, dto.marketId, TradeOutcome.NO, AmmTradeAction.SELL, dto.quantity)
      .then(async (result) => {
        await riskEngine.syncRiskSnapshotToRedis(result.marketId);
        await this.emitAmmRealtime(result);
        return result;
      });
  }
}

export default new AmmService();
