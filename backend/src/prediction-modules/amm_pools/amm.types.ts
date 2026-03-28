import { TradeOutcome } from '../trades/trade.types';

export enum AmmTradeAction {
  BUY = 'BUY',
  SELL = 'SELL',
}

export interface AmmTradeRequestDTO {
  marketId: string;
  quantity: number;
}

export interface AmmTradeQuote {
  action: AmmTradeAction;
  outcome: TradeOutcome;
  marketId?: string;
  quantity: number;
  grossAmount: number;
  fee: number;
  netAmount: number;
  priceBefore: number;
  priceAfter: number;
  effectivePrice?: number;
}

export interface AmmTradeResult {
  tradeId: string;
  marketId: string;
  outcome: TradeOutcome;
  action: AmmTradeAction;
  quantity: number;
  grossAmount: number;
  fee: number;
  netAmount: number;
  walletBalanceAfter: number;
  priceYes: number;
  priceNo: number;
  q_yes: number;
  q_no: number;
  poolVersion: number;
  executedAt: Date;
}

export interface LmsrState {
  b: number;
  q_yes: number;
  q_no: number;
}
