import Joi from 'joi';
import { MarketCategoryType, MarketStatus, ResolutionSourceType } from './market.types';

const outcomesSchema = Joi.array()
  .items(Joi.string().valid('YES', 'NO'))
  .length(2)
  .custom((value, helpers) => {
    if (!value.includes('YES') || !value.includes('NO')) {
      return helpers.error('any.invalid');
    }
    return value;
  })
  .messages({
    'array.length': 'Outcomes must contain exactly two items: YES and NO',
    'any.invalid': 'Outcomes must be exactly [YES, NO]',
    'any.only': 'Outcomes must only include YES and NO',
  });

const resolutionSourceSchema = Joi.object({
  type: Joi.string()
    .valid(...Object.values(ResolutionSourceType))
    .default(ResolutionSourceType.ORACLE)
    .messages({
      'any.only': `Resolution source type must be one of: ${Object.values(ResolutionSourceType).join(', ')}`,
    }),
  provider: Joi.string().trim().min(2).max(100).required().messages({
    'string.empty': 'Resolution source provider is required',
  }),
  referenceId: Joi.string().trim().min(2).max(200).required().messages({
    'string.empty': 'Resolution source reference ID is required',
  }),
});

const ammStateSchema = Joi.object({
  q_yes: Joi.number().min(0).default(1000).messages({
    'number.min': 'ammState.q_yes cannot be negative',
  }),
  q_no: Joi.number().min(0).default(1000).messages({
    'number.min': 'ammState.q_no cannot be negative',
  }),
  b: Joi.number().greater(0).default(100).messages({
    'number.greater': 'ammState.b must be greater than 0',
  }),
  totalLiquidity: Joi.number().min(0).default(10000).messages({
    'number.min': 'ammState.totalLiquidity cannot be negative',
  }),
  lastUpdatedAt: Joi.date().iso().optional(),
});

export const createMarketSchema = Joi.object({
  slug: Joi.string().trim().lowercase().min(3).max(140).required().messages({
    'string.empty': 'Slug is required',
    'string.min': 'Slug must be at least 3 characters',
    'string.max': 'Slug cannot exceed 140 characters',
  }),

  question: Joi.string().trim().min(5).max(300).required().messages({
    'string.empty': 'Question is required',
    'string.min': 'Question must be at least 5 characters',
    'string.max': 'Question cannot exceed 300 characters',
  }),

  category: Joi.string()
    .valid(...Object.values(MarketCategoryType))
    .required()
    .messages({
      'any.only': `Category must be one of: ${Object.values(MarketCategoryType).join(', ')}`,
    }),

  status: Joi.string()
    .valid(MarketStatus.OPEN, MarketStatus.CLOSED)
    .default(MarketStatus.OPEN)
    .messages({
      'any.only': 'Status must be OPEN or CLOSED on creation',
    }),

  outcomes: outcomesSchema.default(['YES', 'NO']),

  resolutionSource: resolutionSourceSchema.required(),

  resolvedOutcome: Joi.valid(null).default(null),
  resolvedAt: Joi.valid(null).default(null),

  closeAt: Joi.date().iso().greater('now').required().messages({
    'date.greater': 'closeAt must be in the future',
  }),

  createdBy: Joi.any().forbidden().messages({
    'any.unknown': 'createdBy is managed by server',
  }),

  ammState: ammStateSchema.default({
    q_yes: 1000,
    q_no: 1000,
    b: 100,
    totalLiquidity: 10000,
  }),
  initialPriceYes: Joi.number().min(0.01).max(0.99).optional().messages({
    'number.min': 'initialPriceYes must be at least 0.01',
    'number.max': 'initialPriceYes must be at most 0.99',
  }),

  orderBookEnabled: Joi.boolean().default(true),
  ammEnabled: Joi.boolean().default(true),

  tags: Joi.array().items(Joi.string().trim().min(1).max(40)).default([]),
});

export const updateMarketSchema = Joi.object({
  question: Joi.string().trim().min(5).max(300).optional(),

  category: Joi.string()
    .valid(...Object.values(MarketCategoryType))
    .optional()
    .messages({
      'any.only': `Category must be one of: ${Object.values(MarketCategoryType).join(', ')}`,
    }),

  status: Joi.string()
    .valid(...Object.values(MarketStatus))
    .optional()
    .messages({
      'any.only': `Status must be one of: ${Object.values(MarketStatus).join(', ')}`,
    }),

  closeAt: Joi.date().iso().optional(),

  orderBookEnabled: Joi.boolean().optional(),
  ammEnabled: Joi.boolean().optional(),

  tags: Joi.array().items(Joi.string().trim().min(1).max(40)).optional(),

  resolutionSource: resolutionSourceSchema.optional(),

  ammState: ammStateSchema.optional(),
}).min(1).messages({
  'object.min': 'At least one field must be provided for update',
});

export const resolveMarketSchema = Joi.object({
  status: Joi.string().valid(MarketStatus.RESOLVED).required().messages({
    'any.only': 'Status must be RESOLVED',
  }),
  resolvedOutcome: Joi.string().valid('YES', 'NO').required().messages({
    'any.only': 'resolvedOutcome must be YES or NO',
  }),
  resolvedAt: Joi.date().iso().optional(),
  resolutionSource: resolutionSourceSchema.optional(),
});

export const marketQuerySchema = Joi.object({
  category: Joi.string().valid(...Object.values(MarketCategoryType)).optional(),
  status: Joi.string().valid(...Object.values(MarketStatus)).optional(),
  slug: Joi.string().trim().optional(),
  tags: Joi.alternatives().try(
    Joi.array().items(Joi.string().trim().min(1).max(40)),
    Joi.string().trim()
  ).optional(),
  createdBy: Joi.string().trim().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('createdAt', 'updatedAt', 'closeAt').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export const marketIdParamSchema = Joi.object({
  marketId: Joi.string().trim().pattern(/^[a-fA-F0-9]{24}$/).required().messages({
    'string.empty': 'marketId is required',
    'string.pattern.base': 'marketId must be a valid ObjectId',
  }),
});
