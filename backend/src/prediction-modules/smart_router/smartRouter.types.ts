import { OrderSide } from '../orderbook/order.types';
import { TradeOutcome } from '../trades/trade.types';

export interface SmartTradeRequestDTO {
  marketId: string;
  outcome: TradeOutcome;
  type: OrderSide;
  quantity: number;
  optionalLimitPrice?: number;
}

export interface SmartRouteExecutionResult {
  route: 'ORDER_BOOK' | 'AMM' | 'HYBRID';
  totalQuantity: number;
  bookFilledQuantity: number;
  ammFilledQuantity: number;
  bookOrderId?: string;
  ammTradeId?: string;
  estimatedBookPrice?: number | null;
  estimatedAmmPrice: number | null;
}
