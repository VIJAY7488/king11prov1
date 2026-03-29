import mongoose, { ClientSession, Types } from 'mongoose';
import AppError from '../../utils/AppError';
import Transaction from '../../mdules/wallet/wallet.model';
import walletService from '../../mdules/wallet/wallet.service';
import { WalletTxnReason } from '../../mdules/wallet/wallet.types';
import { Holding } from '../holdings/holding.model';
import { Market } from '../markets/market.model';
import { MarketStatus } from '../markets/market.types';
import { TradeOutcome } from '../trades/trade.types';
import { ISettlement, Settlement } from './settlement.model';
import { ResolveMarketDTO, SettlementStatus, SettlementSummaryDTO } from './settlement.types';

const BATCH_SIZE = 1000;
const round = (v: number): number => Number(v.toFixed(8));

const withTransaction = async <T>(fn: (session: ClientSession) => Promise<T>): Promise<T> => {
  const session = await mongoose.startSession();
  session.startTransaction({
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
  });
  try {
    const out = await fn(session);
    await session.commitTransaction();
    return out;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

class SettlementService {
  private toObjectId(id: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new AppError(`Invalid ${label}.`, 400);
    return new Types.ObjectId(id);
  }

  private toSummary(settlement: ISettlement): SettlementSummaryDTO {
    return {
      marketId: settlement.marketId.toString(),
      outcome: settlement.outcome,
      status: settlement.status,
      totalParticipants: settlement.totalParticipants,
      totalWinners: settlement.totalWinners,
      totalLosers: settlement.totalLosers,
      totalWinningShares: settlement.totalWinningShares,
      totalPayout: settlement.totalPayout,
      startedAt: settlement.startedAt,
      completedAt: settlement.completedAt,
    };
  }

  private settlementReferenceId(marketId: string, userId: string): string {
    return `SETTLEMENT:${marketId}:${userId}`;
  }

  private getPayoutPerShare(market: { questionPrice?: { amount?: number } } | null): number {
    const raw = Number(market?.questionPrice?.amount ?? 1);
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    return round(raw);
  }

  private async getOrCreateProcessingRecord(
    marketId: Types.ObjectId,
    resolvedBy: Types.ObjectId,
    outcome: TradeOutcome,
    allowFailedResume = false
  ): Promise<ISettlement> {
    return withTransaction(async (session) => {
      const market = await Market.findById(marketId).session(session);
      if (!market) throw new AppError('Market not found.', 404);

      const existing = await Settlement.findOne({ marketId }).session(session);
      if (existing?.status === SettlementStatus.COMPLETED) {
        throw new AppError('Market settlement already completed.', 409);
      }
      if (existing?.status === SettlementStatus.PROCESSING) {
        throw new AppError('Market settlement is already in progress.', 409);
      }
      if (existing?.status === SettlementStatus.FAILED) {
        if (!allowFailedResume) {
          throw new AppError('Settlement is in FAILED state. Use retry endpoint to resume.', 409);
        }
        existing.status = SettlementStatus.PROCESSING;
        existing.completedAt = null;
        existing.failureReason = null;
        existing.outcome = outcome;
        existing.resolvedBy = resolvedBy;

        market.status = MarketStatus.CLOSED;
        market.ammEnabled = false;
        market.orderBookEnabled = false;
        await market.save({ session });
        await existing.save({ session });
        return existing;
      }

      if (market.status === MarketStatus.RESOLVED) {
        throw new AppError('Market already resolved.', 409);
      }
      if (market.status === MarketStatus.CANCELLED) {
        throw new AppError('Cancelled market cannot be resolved.', 409);
      }

      market.status = MarketStatus.CLOSED;
      market.ammEnabled = false;
      market.orderBookEnabled = false;
      await market.save({ session });

      try {
        const [settlement] = await Settlement.create(
          [
            {
              marketId,
              outcome,
              status: SettlementStatus.PROCESSING,
              resolvedBy,
              startedAt: new Date(),
            },
          ],
          { session }
        );
        return settlement;
      } catch (error: any) {
        if (error?.code === 11000) {
          throw new AppError('Market settlement is already in progress.', 409);
        }
        throw error;
      }
    });
  }

  private async computeParticipantStats(
    marketId: Types.ObjectId,
    winningOutcome: TradeOutcome
  ): Promise<{ participants: number; winners: number; losers: number }> {
    const rows = await Holding.aggregate<{
      _id: Types.ObjectId;
      winningQty: number;
    }>([
      { $match: { marketId, quantity: { $gt: 0 } } },
      {
        $group: {
          _id: '$userId',
          winningQty: {
            $sum: {
              $cond: [{ $eq: ['$outcome', winningOutcome] }, '$quantity', 0],
            },
          },
        },
      },
    ]);

    let winners = 0;
    for (const row of rows) {
      if (row.winningQty > 0) winners += 1;
    }

    return {
      participants: rows.length,
      winners,
      losers: Math.max(0, rows.length - winners),
    };
  }

  private async processBatch(
    settlement: ISettlement,
    marketId: Types.ObjectId,
    winningOutcome: TradeOutcome,
    payoutPerShare: number
  ): Promise<{
    processedCount: number;
    winningShares: number;
    payout: number;
    lastHoldingId: Types.ObjectId | null;
  }> {
    return withTransaction(async (session) => {
      const filter: Record<string, unknown> = {
        marketId,
        quantity: { $gt: 0 },
      };
      if (settlement.lastProcessedHoldingId) {
        filter._id = { $gt: settlement.lastProcessedHoldingId };
      }

      const rows = await Holding.find(filter)
        .sort({ _id: 1 })
        .limit(BATCH_SIZE)
        .session(session);

      if (rows.length === 0) {
        return {
          processedCount: 0,
          winningShares: 0,
          payout: 0,
          lastHoldingId: settlement.lastProcessedHoldingId,
        };
      }

      let winningShares = 0;
      let payout = 0;
      const bulkOps: Array<Record<string, unknown>> = [];

      for (const row of rows) {
        const qty = round(row.quantity);
        const didWin = row.outcome === winningOutcome && qty > 0;
        const userId = row.userId.toString();
        const marketIdString = marketId.toString();
        const referenceId = this.settlementReferenceId(marketIdString, userId);
        const sharePayout = didWin ? round(qty * payoutPerShare) : 0;
        const pnl = round(sharePayout - row.investedAmount);

        if (didWin) {
          winningShares = round(winningShares + qty);
          payout = round(payout + sharePayout);

          const existingCredit = await Transaction.findOne({
            referenceId,
            reason: WalletTxnReason.SETTLEMENT,
          }).session(session);

          if (!existingCredit) {
            await walletService.creditSettlement(
              userId,
              sharePayout,
              referenceId,
              {
                marketId: marketIdString,
                winningOutcome,
                quantity: qty,
                payoutPerShare,
              },
              session
            );
          }
        }

        bulkOps.push({
          updateOne: {
            filter: { _id: row._id },
            update: {
              $set: {
                quantity: 0,
                avgPrice: 0,
                investedAmount: 0,
              },
              $inc: {
                realizedPnL: pnl,
              },
            },
          },
        });
      }

      if (bulkOps.length > 0) {
        await Holding.bulkWrite(bulkOps as any, { session });
      }

      const lastHoldingId = rows[rows.length - 1]?._id ?? settlement.lastProcessedHoldingId;
      settlement.lastProcessedHoldingId = lastHoldingId;
      settlement.totalWinningShares = round(settlement.totalWinningShares + winningShares);
      settlement.totalPayout = round(settlement.totalPayout + payout);
      await settlement.save({ session });

      return {
        processedCount: rows.length,
        winningShares,
        payout,
        lastHoldingId,
      };
    });
  }

  async resolveMarket(adminUserId: string, dto: ResolveMarketDTO): Promise<SettlementSummaryDTO> {
    const marketId = this.toObjectId(dto.marketId, 'marketId');
    const adminId = this.toObjectId(adminUserId, 'adminUserId');
    const winningOutcome = dto.outcome;

    const completed = await Settlement.findOne({ marketId, status: SettlementStatus.COMPLETED });
    if (completed) return this.toSummary(completed);

    const settlement = await this.getOrCreateProcessingRecord(marketId, adminId, winningOutcome, false);
    const marketForPayout = await Market.findById(marketId).select('questionPrice.amount').lean();
    const payoutPerShare = this.getPayoutPerShare(marketForPayout);

    try {
      const stats = await this.computeParticipantStats(marketId, winningOutcome);
      await Settlement.updateOne(
        { _id: settlement._id },
        {
          $set: {
            totalParticipants: stats.participants,
            totalWinners: stats.winners,
            totalLosers: stats.losers,
          },
        }
      );

      // Batch scan holdings until drained.
      // This keeps memory bounded and supports high participant counts.
      while (true) {
        const batch = await this.processBatch(settlement, marketId, winningOutcome, payoutPerShare);
        if (batch.processedCount === 0) break;
      }

      const finalized = await withTransaction(async (session) => {
        const s = await Settlement.findById(settlement._id).session(session);
        if (!s) throw new AppError('Settlement record not found while finalizing.', 500);

        const market = await Market.findById(marketId).session(session);
        if (!market) throw new AppError('Market not found while finalizing settlement.', 500);

        s.status = SettlementStatus.COMPLETED;
        s.completedAt = new Date();
        s.failureReason = null;
        await s.save({ session });

        market.status = MarketStatus.RESOLVED;
        market.resolvedOutcome = winningOutcome;
        market.resolvedAt = s.completedAt;
        market.ammEnabled = false;
        market.orderBookEnabled = false;
        await market.save({ session });

        return s;
      });

      return this.toSummary(finalized);
    } catch (error) {
      await Settlement.updateOne(
        { _id: settlement._id, status: SettlementStatus.PROCESSING },
        {
          $set: {
            status: SettlementStatus.FAILED,
            completedAt: new Date(),
            failureReason: error instanceof Error ? error.message.slice(0, 500) : 'Unknown settlement error',
          },
        }
      );
      throw error;
    }
  }

  async retryFailedSettlement(adminUserId: string, marketIdRaw: string): Promise<SettlementSummaryDTO> {
    const marketId = this.toObjectId(marketIdRaw, 'marketId');
    this.toObjectId(adminUserId, 'adminUserId');

    const failed = await Settlement.findOne({ marketId, status: SettlementStatus.FAILED });
    if (!failed) {
      throw new AppError('No FAILED settlement found for this market.', 404);
    }

    return this.resolveMarket(adminUserId, {
      marketId: marketId.toString(),
      outcome: failed.outcome,
    });
  }
}

export default new SettlementService();
