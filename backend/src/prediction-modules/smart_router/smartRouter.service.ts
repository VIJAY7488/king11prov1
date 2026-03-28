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

  private isBookBetterThanAmm(
    side: OrderSide,
    bestBookPrice: number | null,
    ammEffectivePrice: number
  ): boolean {
    if (bestBookPrice === null) return false;
    return side === OrderSide.BUY ? bestBookPrice <= ammEffectivePrice : bestBookPrice >= ammEffectivePrice;
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
        ammQuote ? round(ammQuote.effectivePrice ?? ammQuote.netAmount / dto.quantity) : null;

      const bookAcceptable = this.isBookPriceAcceptableForUser(dto.type, bestBookPrice, dto.optionalLimitPrice);
      const bookBetter = ammEffectivePrice === null
        ? bookAcceptable
        : this.isBookBetterThanAmm(dto.type, bestBookPrice, ammEffectivePrice);

      let bookFilledQuantity = 0;
      let ammFilledQuantity = 0;
      let bookOrderId: string | undefined;
      let ammTradeId: string | undefined;

      const targetBookLimit =
        typeof dto.optionalLimitPrice === 'number'
          ? dto.optionalLimitPrice
          : (ammEffectivePrice ?? bestBookPrice ?? undefined);

      if (bookAcceptable && bookBetter && typeof targetBookLimit === 'number') {
        const executableQty = await orderbookService.getExecutableLiquidity(
          dto.marketId,
          orderOutcome,
          dto.type,
          targetBookLimit
        );

        const qtyToBook = Math.min(dto.quantity, executableQty);
        if (qtyToBook > 0) {
          const orderResult = await orderbookService.placeOrderWithOptions(
            userId,
            {
              marketId: dto.marketId,
              outcome: orderOutcome,
              side: dto.type,
              orderType: OrderType.LIMIT,
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

          if (ammQuoteError instanceof Error) {
            throw ammQuoteError;
          }
          throw new AppError('No executable liquidity in orderbook and AMM is unavailable.', 409);
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
