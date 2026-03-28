export enum OrderOutcome {
  YES = 'YES',
  NO = 'NO',
}

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
}

export enum OrderStatus {
  OPEN = 'OPEN',
  PARTIAL = 'PARTIAL',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export interface PlaceOrderDTO {
  marketId: string;
  outcome: OrderOutcome;
  side: OrderSide;
  orderType?: OrderType;
  price: number;
  quantity: number;
}

export interface CancelOrderDTO {
  orderId: string;
}

export interface MatchExecution {
  tradeId: string;
  quantity: number;
  price: number;
  buyerOrderId: string;
  sellerOrderId: string;
}
