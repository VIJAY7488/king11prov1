import Joi from 'joi';
import { OrderOutcome, OrderSide, OrderType } from './order.types';

const objectIdSchema = Joi.string()
  .trim()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .messages({
    'string.pattern.base': 'Value must be a valid 24-character ObjectId',
  });

export const placeOrderSchema = Joi.object({
  marketId: objectIdSchema.required().messages({
    'string.empty': 'marketId is required',
  }),
  outcome: Joi.string().valid(...Object.values(OrderOutcome)).required(),
  side: Joi.string().valid(...Object.values(OrderSide)).required(),
  orderType: Joi.string().valid(...Object.values(OrderType)).default(OrderType.LIMIT),
  price: Joi.number().min(0.01).max(0.99).required().messages({
    'number.min': 'price must be at least 0.01',
    'number.max': 'price must be at most 0.99',
  }),
  quantity: Joi.number().integer().min(1).max(50000).required(),
});

export const cancelOrderSchema = Joi.object({
  orderId: objectIdSchema.required().messages({
    'string.empty': 'orderId is required',
  }),
});

export const orderbookMarketParamSchema = Joi.object({
  marketId: objectIdSchema.required().messages({
    'string.empty': 'marketId is required',
  }),
});

export const orderbookViewQuerySchema = Joi.object({
  outcome: Joi.string().valid(...Object.values(OrderOutcome)).required(),
  depth: Joi.number().integer().min(1).max(100).default(20),
});

export const userOrdersQuerySchema = Joi.object({
  marketId: objectIdSchema.optional(),
  status: Joi.string().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});
