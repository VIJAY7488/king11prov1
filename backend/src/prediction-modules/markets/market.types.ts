
// ── Enums ─────────────────────────────────────────────────────────────────────

export enum MarketCategoryType {
    CRICKET = 'CRICKET',
    POLITICS = 'POLITICS',
    ENTERTAINMENT = "ENTERTAINMENT",
    CRYPTO = 'CRYPTO',
    FOOTBALL = 'FOOTBALL',
    GENERAL = 'GENERAL',
}

export enum MarketStatus {
    OPEN = 'OPEN',
    CLOSED = 'CLOSED',
    RESOLVED = 'RESOLVED',
    CANCELLED = 'CANCELLED',
}

export enum ResolutionSourceType {
  ORACLE = 'ORACLE',
  ADMIN = 'ADMIN',
  AUTOMATED = 'AUTOMATED',
}


// ── Interface ─────────────────────────────────────────────────────────────────────

export interface IResolutionSource {
  type: ResolutionSourceType;
  provider: string;
  referenceId: string;
}

export interface IAmmState {
  q_yes: number;
  q_no: number;
  b: number;
  totalLiquidity: number;
  lastUpdatedAt: Date;
}