export enum TradeOutcome {
  YES = 'YES',
  NO = 'NO',
}

export enum TradeType {
  ORDER_BOOK = 'ORDER_BOOK',
  AMM = 'AMM',
}

export interface ITradeFees {
  platform: number;
  breakdown: Record<string, unknown>;
}

export interface IAmmSnapshot {
  q_yes_before: number;
  q_no_before: number;
  q_yes_after: number;
  q_no_after: number;
}