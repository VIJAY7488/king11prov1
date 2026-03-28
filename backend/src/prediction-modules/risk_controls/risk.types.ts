export enum RiskAlertType {
  HIGH_IMBALANCE = 'HIGH_IMBALANCE',
  HIGH_EXPOSURE = 'HIGH_EXPOSURE',
  SIDE_DISABLED = 'SIDE_DISABLED',
  AMM_DISABLED = 'AMM_DISABLED',
  ORDERBOOK_DISABLED = 'ORDERBOOK_DISABLED',
  CIRCUIT_BREAKER = 'CIRCUIT_BREAKER',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  GLOBAL_KILL_SWITCH = 'GLOBAL_KILL_SWITCH',
}

export interface ISideLimit {
  maxSingleTrade: number;
  enabled: boolean;
}

export interface IAmmSideLimits {
  YES: ISideLimit;
  NO: ISideLimit;
}

export interface IRiskAlert {
  type: RiskAlertType;
  triggeredAt: Date;
  threshold: number;
  value: number;
  resolved: boolean;
}

export interface RiskPreTradeInput {
  marketId: string;
  userId: string;
  route: 'AMM' | 'ORDER_BOOK';
  side: 'BUY' | 'SELL';
  outcome: 'YES' | 'NO';
  quantity: number;
  price?: number;
  skipUserPositionCheck?: boolean;
}

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  controls: {
    spreadBps: number;
    bMultiplier: number;
    maxAllowedQty: number;
  };
}

export interface RiskRealtimeSnapshot {
  marketId: string;
  maxExposure: number;
  currentExposure: number;
  yesExposure: number;
  noExposure: number;
  netExposure: number;
  exposureUtilization: number;
  imbalanceRatio: number;
  ammEnabled: boolean;
  orderBookEnabled: boolean;
  marketFrozen: boolean;
  circuitBreakerUntil: string | null;
  dynamicSpreadBps: number;
  adjustedB: number;
  updatedAt: string;
}
