import { TradeOutcome } from '../trades/trade.types';

export interface HoldingPositionDTO {
  userId: string;
  marketId: string;
  outcome: TradeOutcome;
  quantity: number;
  avgPrice: number;
  investedAmount: number;
  realizedPnL: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface HoldingSummaryDTO {
  totalOpenQuantity: number;
  totalInvestedAmount: number;
  totalRealizedPnL: number;
  holdingsCount: number;
}
