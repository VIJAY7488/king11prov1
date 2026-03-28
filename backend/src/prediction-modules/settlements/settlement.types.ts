import { TradeOutcome } from '../trades/trade.types';

export enum SettlementStatus {
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface ResolveMarketDTO {
  marketId: string;
  outcome: TradeOutcome;
}

export interface SettlementSummaryDTO {
  marketId: string;
  outcome: TradeOutcome;
  status: SettlementStatus;
  totalParticipants: number;
  totalWinners: number;
  totalLosers: number;
  totalWinningShares: number;
  totalPayout: number;
  startedAt: Date;
  completedAt: Date | null;
}
