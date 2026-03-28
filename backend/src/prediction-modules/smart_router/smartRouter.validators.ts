import Joi from 'joi';
import { OrderSide } from '../orderbook/order.types';
import { TradeOutcome } from '../trades/trade.types';

const objectIdSchema = Joi.string()
  .trim()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .messages({
    'string.pattern.base': 'Value must be a valid 24-character ObjectId',
  });

export const smartTradeExecuteSchema = Joi.object({
  marketId: objectIdSchema.required().messages({
    'string.empty': 'marketId is required',
  }),
  outcome: Joi.string().valid(...Object.values(TradeOutcome)).required(),
  type: Joi.string().valid(...Object.values(OrderSide)).required(),
  quantity: Joi.number().integer().min(1).max(50000).required(),
  optionalLimitPrice: Joi.number().min(0.01).max(0.99).optional(),
});
