import Joi from 'joi';
import { TradeOutcome } from '../trades/trade.types';

const objectIdSchema = Joi.string()
  .trim()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .messages({
    'string.pattern.base': 'Value must be a valid 24-character ObjectId',
  });

export const holdingQuerySchema = Joi.object({
  marketId: objectIdSchema.optional(),
  outcome: Joi.string().valid(...Object.values(TradeOutcome)).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const holdingMarketParamSchema = Joi.object({
  marketId: objectIdSchema.required().messages({
    'string.empty': 'marketId is required',
  }),
});
