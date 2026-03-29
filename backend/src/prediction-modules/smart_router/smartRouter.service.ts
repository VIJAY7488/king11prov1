import redisClient from '../../config/redis.config';
import AppError from '../../utils/AppError';
import ammService from '../amm_pools/amm.service';
import { AmmTradeAction } from '../amm_pools/amm.types';
import orderbookService from '../orderbook/order.service';
import { OrderOutcome, OrderSide, OrderType } from '../orderbook/order.types';
import riskEngine from '../risk_controls/risk.engine';
import { TradeOutcome } from '../trades/trade.types';
import { SmartRouteExecutionResult, SmartTradeRequestDTO } from './smartRouter.types';

const LOCK_TTL_MS = 5000;
const releaseLockLua = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const round = (value: number): number => Number(value.toFixed(8));

class SmartRouterService {
  private lockKey(marketId: string, outcome: TradeOutcome): string {
    return `lock:smart-router:${marketId}:${outcome}`;
  }

  private async acquireLock(marketId: string, outcome: TradeOutcome): Promise<string> {
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const ok = await redisClient.set(this.lockKey(marketId, outcome), token, 'PX', LOCK_TTL_MS, 'NX');
    if (ok !== 'OK') throw new AppError('Trade router busy for this market. Please retry.', 409);
    return token;
  }

  private async releaseLock(marketId: string, outcome: TradeOutcome, token: string): Promise<void> {
    try {
      await redisClient.eval(releaseLockLua, 1, this.lockKey(marketId, outcome), token);
    } catch {
      // no-op
    }
  }

  private toOrderOutcome(outcome: TradeOutcome): OrderOutcome {
    return outcome === TradeOutcome.YES ? OrderOutcome.YES : OrderOutcome.NO;
  }

  private toAmmAction(side: OrderSide): AmmTradeAction {
    return side === OrderSide.BUY ? AmmTradeAction.BUY : AmmTradeAction.SELL;
  }

  private isBookPriceAcceptableForUser(
    side: OrderSide,
    bestBookPrice: number | null,
    optionalLimitPrice?: number
  ): boolean {
    if (bestBookPrice === null) return false;
    if (typeof optionalLimitPrice !== 'number') return true;
    if (side === OrderSide.BUY) return bestBookPrice <= optionalLimitPrice;
    return bestBookPrice >= optionalLimitPrice;
  }

  private isPriceAcceptableForUser(
    side: OrderSide,
    price: number | null,
    optionalLimitPrice?: number
  ): boolean {
    if (price === null) return false;
    if (typeof optionalLimitPrice !== 'number') return true;
    if (side === OrderSide.BUY) return price <= optionalLimitPrice;
    return price >= optionalLimitPrice;
  }

  async execute(userId: string, dto: SmartTradeRequestDTO): Promise<SmartRouteExecutionResult> {
    if (!Number.isInteger(dto.quantity) || dto.quantity <= 0) {
      throw new AppError('quantity must be a positive integer.', 400);
    }

    const lockToken = await this.acquireLock(dto.marketId, dto.outcome);
    try {
      const orderOutcome = this.toOrderOutcome(dto.outcome);
      const ammAction = this.toAmmAction(dto.type);

      const bestBookPrice = await orderbookService.getBestPrice(dto.marketId, orderOutcome, dto.type);
      let ammQuote: Awaited<ReturnType<typeof ammService.getQuote>> | null = null;
      let ammQuoteError: unknown = null;
      try {
        ammQuote = await ammService.getQuote(dto.marketId, dto.outcome, ammAction, dto.quantity);
      } catch (error) {
        ammQuoteError = error;
      }

      const ammEffectivePrice =
        ammQuote
          ? round(
              typeof ammQuote.effectivePrice === 'number'
                ? ammQuote.effectivePrice
                : ammQuote.priceAfter
            )
          : null;

      const bookAcceptable = this.isBookPriceAcceptableForUser(dto.type, bestBookPrice, dto.optionalLimitPrice);
      const ammAcceptable = this.isPriceAcceptableForUser(dto.type, ammEffectivePrice, dto.optionalLimitPrice);

      let bookFilledQuantity = 0;
      let ammFilledQuantity = 0;
      let bookOrderId: string | undefined;
      let ammTradeId: string | undefined;

      const targetBookLimit =
        typeof dto.optionalLimitPrice === 'number'
          ? dto.optionalLimitPrice
          : dto.type === OrderSide.BUY
            ? 0.99
            : 0.01;
      const bookOrderType =
        typeof dto.optionalLimitPrice === 'number'
          ? OrderType.LIMIT
          : OrderType.MARKET;

      if (bookAcceptable && typeof targetBookLimit === 'number') {
        const executableQty = await orderbookService.getExecutableLiquidity(
          dto.marketId,
          orderOutcome,
          dto.type,
          bookOrderType === OrderType.LIMIT ? targetBookLimit : undefined
        );

        const qtyToBook = Math.min(dto.quantity, executableQty);
        if (qtyToBook > 0) {
          const orderResult = await orderbookService.placeOrderWithOptions(
            userId,
            {
              marketId: dto.marketId,
              outcome: orderOutcome,
              side: dto.type,
              orderType: bookOrderType,
              price: targetBookLimit,
              quantity: qtyToBook,
            },
            {
              disableAmmFallback: true,
              cancelUnfilledRemainder: true,
            }
          );
          bookFilledQuantity = orderResult.filledQuantity;
          bookOrderId = orderResult.orderId;
        }
      }

      const remainingQty = dto.quantity - bookFilledQuantity;
      if (remainingQty > 0) {
        if (!ammQuote) {
          if (bookFilledQuantity > 0) {
            return {
              route: 'ORDER_BOOK',
              totalQuantity: dto.quantity,
              bookFilledQuantity,
              ammFilledQuantity: 0,
              bookOrderId,
              estimatedBookPrice: bestBookPrice,
              estimatedAmmPrice: null,
            };
          }

          const placePassiveOrder = async (passivePrice: number): Promise<SmartRouteExecutionResult> => {
            const passiveOrder = await orderbookService.placeOrderWithOptions(
              userId,
              {
                marketId: dto.marketId,
                outcome: orderOutcome,
                side: dto.type,
                orderType: OrderType.LIMIT,
                price: passivePrice,
                quantity: remainingQty,
              },
              {
                disableAmmFallback: true,
                cancelUnfilledRemainder: false,
              }
            );

            return {
              route: 'ORDER_BOOK',
              totalQuantity: dto.quantity,
              bookFilledQuantity: passiveOrder.filledQuantity,
              ammFilledQuantity: 0,
              bookOrderId: passiveOrder.orderId,
              estimatedBookPrice: bestBookPrice ?? passivePrice,
              estimatedAmmPrice: null,
            };
          };

          // If AMM is unavailable but user submitted a limit price, place a resting order on book.
          if (typeof dto.optionalLimitPrice === 'number') {
            return placePassiveOrder(dto.optionalLimitPrice);
          }

          // AMM unavailable and market order requested:
          // place a neutral resting order instead of hard-failing.
          if (bestBookPrice === null) {
            return placePassiveOrder(0.5);
          }

          if (ammQuoteError instanceof Error) {
            throw new AppError(
              `Trade could not route to AMM after orderbook evaluation: ${ammQuoteError.message}`,
              409
            );
          }

          throw new AppError('Trade could not execute: orderbook fill unavailable and AMM unavailable.', 409);
        }

        if (!ammAcceptable) {
          if (bookFilledQuantity > 0) {
            return {
              route: 'ORDER_BOOK',
              totalQuantity: dto.quantity,
              bookFilledQuantity,
              ammFilledQuantity: 0,
              bookOrderId,
              estimatedBookPrice: bestBookPrice,
              estimatedAmmPrice: ammEffectivePrice,
            };
          }

          if (typeof dto.optionalLimitPrice === 'number') {
            const passiveOrder = await orderbookService.placeOrderWithOptions(
              userId,
              {
                marketId: dto.marketId,
                outcome: orderOutcome,
                side: dto.type,
                orderType: OrderType.LIMIT,
                price: dto.optionalLimitPrice,
                quantity: remainingQty,
              },
              {
                disableAmmFallback: true,
                cancelUnfilledRemainder: false,
              }
            );

            return {
              route: 'ORDER_BOOK',
              totalQuantity: dto.quantity,
              bookFilledQuantity: bookFilledQuantity + passiveOrder.filledQuantity,
              ammFilledQuantity: 0,
              bookOrderId: passiveOrder.orderId,
              estimatedBookPrice: bestBookPrice ?? dto.optionalLimitPrice,
              estimatedAmmPrice: ammEffectivePrice,
            };
          }

          throw new AppError('Trade could not execute within the requested limit price.', 409);
        }

        await riskEngine.preTradeCheck({
          marketId: dto.marketId,
          userId,
          route: 'AMM',
          side: dto.type,
          outcome: dto.outcome,
          quantity: remainingQty,
          price: dto.optionalLimitPrice,
        });
        const ammTrade =
          dto.type === OrderSide.BUY
            ? dto.outcome === TradeOutcome.YES
              ? await ammService.buyYes(userId, { marketId: dto.marketId, quantity: remainingQty })
              : await ammService.buyNo(userId, { marketId: dto.marketId, quantity: remainingQty })
            : dto.outcome === TradeOutcome.YES
              ? await ammService.sellYes(userId, { marketId: dto.marketId, quantity: remainingQty })
              : await ammService.sellNo(userId, { marketId: dto.marketId, quantity: remainingQty });
        ammFilledQuantity = remainingQty;
        ammTradeId = ammTrade.tradeId;
      }

      const route: SmartRouteExecutionResult['route'] =
        bookFilledQuantity > 0 && ammFilledQuantity > 0
          ? 'HYBRID'
          : bookFilledQuantity > 0
            ? 'ORDER_BOOK'
            : 'AMM';

      return {
        route,
        totalQuantity: dto.quantity,
        bookFilledQuantity,
        ammFilledQuantity,
        bookOrderId,
        ammTradeId,
        estimatedBookPrice: bestBookPrice,
        estimatedAmmPrice: ammEffectivePrice,
      };
    } finally {
      await this.releaseLock(dto.marketId, dto.outcome, lockToken);
    }
  }
}

export default new SmartRouterService();
