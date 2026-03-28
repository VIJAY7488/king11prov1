import Joi from 'joi';
import { TradeOutcome, TradeType } from './trade.types';

const objectIdSchema = Joi.string()
  .trim()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .messages({
    'string.pattern.base': 'Value must be a valid 24-character ObjectId',
  });

const feesSchema = Joi.object({
  platform: Joi.number().min(0).required().messages({
    'number.base': 'fees.platform must be a number',
    'number.min': 'fees.platform cannot be negative',
    'any.required': 'fees.platform is required',
  }),
  breakdown: Joi.object().unknown(true).default({}),
}).required();

const ammSnapshotSchema = Joi.object({
  q_yes_before: Joi.number().min(0).required(),
  q_no_before: Joi.number().min(0).required(),
  q_yes_after: Joi.number().min(0).required(),
  q_no_after: Joi.number().min(0).required(),
}).messages({
  'number.min': 'AMM snapshot values cannot be negative',
});

export const createTradeSchema = Joi.object({
  marketId: objectIdSchema.required().messages({
    'string.empty': 'marketId is required',
  }),

  outcome: Joi.string()
    .valid(...Object.values(TradeOutcome))
    .required()
    .messages({
      'any.only': `outcome must be one of: ${Object.values(TradeOutcome).join(', ')}`,
    }),

  tradeType: Joi.string()
    .valid(...Object.values(TradeType))
    .required()
    .messages({
      'any.only': `tradeType must be one of: ${Object.values(TradeType).join(', ')}`,
    }),

  buyOrderId: objectIdSchema.allow(null).optional(),
  sellOrderId: objectIdSchema.allow(null).optional(),

  buyerId: objectIdSchema.required().messages({
    'string.empty': 'buyerId is required',
  }),
  sellerId: objectIdSchema.allow(null).optional(),

  price: Joi.number().min(0).max(1).required().messages({
    'number.base': 'price must be a number',
    'number.min': 'price cannot be below 0',
    'number.max': 'price cannot be above 1',
    'any.required': 'price is required',
  }),

  quantity: Joi.number().integer().min(1).required().messages({
    'number.base': 'quantity must be a number',
    'number.min': 'quantity must be at least 1',
    'any.required': 'quantity is required',
  }),

  totalValue: Joi.number().min(0).required().messages({
    'number.base': 'totalValue must be a number',
    'number.min': 'totalValue cannot be negative',
    'any.required': 'totalValue is required',
  }),

  fees: feesSchema,

  ammSnapshot: ammSnapshotSchema.allow(null).optional(),

  executedAt: Joi.date().iso().optional(),
})
  .custom((value, helpers) => {
    if (value.tradeType === TradeType.ORDER_BOOK) {
      if (!value.buyOrderId || !value.sellOrderId) {
        return helpers.error('any.invalid', {
          message: 'buyOrderId and sellOrderId are required for ORDER_BOOK trades',
        });
      }
      if (!value.sellerId) {
        return helpers.error('any.invalid', {
          message: 'sellerId is required for ORDER_BOOK trades',
        });
      }
      if (value.ammSnapshot) {
        return helpers.error('any.invalid', {
          message: 'ammSnapshot must be null for ORDER_BOOK trades',
        });
      }
    }

    if (value.tradeType === TradeType.AMM) {
      if (value.buyOrderId || value.sellOrderId) {
        return helpers.error('any.invalid', {
          message: 'buyOrderId and sellOrderId must be null for AMM trades',
        });
      }
      if (value.sellerId) {
        return helpers.error('any.invalid', {
          message: 'sellerId must be null for AMM trades',
        });
      }
    }

    const calculatedTotalValue = Number((value.price * value.quantity).toFixed(8));
    const inputTotalValue = Number((value.totalValue ?? 0).toFixed(8));
    if (calculatedTotalValue !== inputTotalValue) {
      return helpers.error('any.invalid', {
        message: `totalValue must equal price * quantity (${calculatedTotalValue})`,
      });
    }

    return value;
  })
  .messages({
    'any.invalid': '{{#message}}',
  });

export const updateTradeSchema = Joi.object({
  price: Joi.number().min(0).max(1).optional(),
  quantity: Joi.number().integer().min(1).optional(),
  totalValue: Joi.number().min(0).optional(),
  fees: feesSchema.optional(),
  executedAt: Joi.date().iso().optional(),
})
  .min(1)
  .messages({
    'object.min': 'At least one field must be provided for update',
  });

export const tradeQuerySchema = Joi.object({
  marketId: objectIdSchema.optional(),
  outcome: Joi.string().valid(...Object.values(TradeOutcome)).optional(),
  tradeType: Joi.string().valid(...Object.values(TradeType)).optional(),
  buyerId: objectIdSchema.optional(),
  sellerId: objectIdSchema.optional(),
  buyOrderId: objectIdSchema.optional(),
  sellOrderId: objectIdSchema.optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('executedAt', 'createdAt', 'price').default('executedAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
})
  .custom((value, helpers) => {
    if (value.from && value.to && new Date(value.from) > new Date(value.to)) {
      return helpers.error('any.invalid', { message: '`from` cannot be after `to`' });
    }
    return value;
  })
  .messages({
    'any.invalid': '{{#message}}',
  });

export const tradeIdParamSchema = Joi.object({
  tradeId: objectIdSchema.required().messages({
    'string.empty': 'tradeId is required',
  }),
});
