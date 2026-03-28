import Joi from 'joi';

const objectIdSchema = Joi.string()
  .trim()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .messages({
    'string.pattern.base': 'Value must be a valid 24-character ObjectId',
  });

export const tradeActionSchema = Joi.object({
  marketId: objectIdSchema.required().messages({
    'string.empty': 'marketId is required',
  }),
  quantity: Joi.number().integer().min(1).max(50_000).required().messages({
    'number.base': 'quantity must be a number',
    'number.min': 'quantity must be at least 1',
    'number.max': 'quantity exceeds max allowed per request',
  }),
});

export const ammPoolIdParamSchema = Joi.object({
  ammPoolId: objectIdSchema.required().messages({
    'string.empty': 'ammPoolId is required',
  }),
});

export const ammPoolByMarketParamSchema = Joi.object({
  marketId: objectIdSchema.required().messages({
    'string.empty': 'marketId is required',
  }),
});
