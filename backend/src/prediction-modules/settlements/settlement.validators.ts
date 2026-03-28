import Joi from 'joi';
import { TradeOutcome } from '../trades/trade.types';

const objectIdSchema = Joi.string()
  .trim()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .messages({
    'string.pattern.base': 'Value must be a valid 24-character ObjectId',
  });

export const resolveMarketSchema = Joi.object({
  marketId: objectIdSchema.required().messages({
    'string.empty': 'marketId is required',
  }),
  outcome: Joi.string().valid(...Object.values(TradeOutcome)).required(),
});

export const settlementMarketParamSchema = Joi.object({
  marketId: objectIdSchema.required().messages({
    'string.empty': 'marketId is required',
  }),
});
