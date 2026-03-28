import Joi from 'joi';

const objectIdSchema = Joi.string()
  .trim()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .messages({
    'string.pattern.base': 'Value must be a valid 24-character ObjectId',
  });

export const riskMarketParamSchema = Joi.object({
  marketId: objectIdSchema.required().messages({
    'string.empty': 'marketId is required',
  }),
});

export const killSwitchSchema = Joi.object({
  enabled: Joi.boolean().required(),
});

export const updateRiskControlSchema = Joi.object({
  maxExposure: Joi.number().min(0).optional(),
  ammEnabled: Joi.boolean().optional(),
  orderBookEnabled: Joi.boolean().optional(),
  marketFrozen: Joi.boolean().optional(),
  circuitBreakerUntil: Joi.date().iso().allow(null).optional(),
  maxOrderSizePerUser: Joi.number().integer().min(1).optional(),
  maxPositionPerUser: Joi.number().integer().min(1).optional(),
  baseB: Joi.number().greater(0).optional(),
  bMultiplier: Joi.number().greater(0).optional(),
  ammSideLimits: Joi.object({
    YES: Joi.object({
      maxSingleTrade: Joi.number().min(0).optional(),
      enabled: Joi.boolean().optional(),
    }).optional(),
    NO: Joi.object({
      maxSingleTrade: Joi.number().min(0).optional(),
      enabled: Joi.boolean().optional(),
    }).optional(),
  }).optional(),
}).min(1).messages({
  'object.min': 'At least one field is required to update risk controls',
});
