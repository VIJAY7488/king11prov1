import Joi from 'joi';
import { ContestType, ContestStatus, PLATFORM_FEE_PERCENT } from './contest.types';


// ── Admin: Create Contest ─────────────────────────────────────────────────────
// NOTE: totalSpots is NOT in this schema — it is auto-calculated by the model.
// Formula: totalSpots = floor((prizePool + prizePool×20%) / entryFee)
// Example: prizePool=30000, entryFee=50 → totalSpots = floor(36000/50) = 720

export const createContestSchema = Joi.object({

  matchId: Joi.string().trim().required()
    .messages({ 'string.empty': 'Match ID is required' }),

  name: Joi.string().trim().min(3).max(200).optional()
    .messages({
      'string.empty': 'Contest name cannot be empty',
      'string.min':   'Contest name must be at least 3 characters',
      'string.max':   'Contest name cannot exceed 200 characters',
    }),

  contestType: Joi.string()
    .valid(...Object.values(ContestType))
    .required()
    .messages({ 'any.only': `Contest type must be one of: ${Object.values(ContestType).join(', ')}` }),

  // Admin sets these two — everything else is derived
    entryFee: Joi.when('contestType', {
      is: ContestType.FREE_LEAGUE,
      then: Joi.number().valid(0).required().messages({
        'any.only': 'Entry fee must be 0 for FREE_LEAGUE contests',
      }),
       otherwise: Joi.number().min(1).precision(2).required().messages({
        'number.base': 'Entry fee must be a number',
        'number.min':  'Entry fee must be at least ₹1',
      }),
    }),
    

  prizePool: Joi.number().min(1).precision(2).required()
    .messages({
      'number.base': 'Prize pool must be a number',
      'number.min':  'Prize pool must be at least ₹1',
    }),

  // totalSpots is intentionally excluded — auto-calculated by the model:
  //   platformFee    = prizePool × ${PLATFORM_FEE_PERCENT}%
  //   totalCollection = prizePool + platformFee
  //   totalSpots     = floor(totalCollection / entryFee)


  maxEntriesPerUser: Joi.number().integer().min(1).max(10).default(1)
    .messages({ 'number.max': 'Max entries per user cannot exceed 10' }),

  isGuaranteed: Joi.boolean().default(false),

  // Default is DRAFT — admin must explicitly set OPEN to make it visible to users
  status: Joi.string()
    .valid(ContestStatus.DRAFT, ContestStatus.OPEN)
    .default(ContestStatus.DRAFT)
    .messages({ 'any.only': 'Status must be DRAFT or OPEN on creation' }),

  closedAt:    Joi.date().iso().greater('now').optional().allow(null)
    .messages({ 'date.greater': 'closedAt must be in the future' }),

  completedAt: Joi.date().iso().greater('now').optional().allow(null)
    .messages({ 'date.greater': 'completedAt must be in the future' }),

  description: Joi.string().trim().max(1000).optional(),

});

// ── Admin: Update Contest ─────────────────────────────────────────────────────
// All fields optional — only send what needs changing.
// If prizePool or entryFee is updated, totalSpots is recalculated by the model.

export const updateContestSchema = Joi.object({

  name: Joi.string().trim().min(3).max(200).optional(),

  description: Joi.string().trim().max(1000).allow('').optional(),

  entryFee: Joi.number().min(0).precision(2).optional()
    .messages({ 'number.min': 'Entry fee cannot be negative' }),

  prizePool: Joi.number().min(1).precision(2).optional()
    .messages({ 'number.min': 'Prize pool must be at least ₹1' }),


  maxEntriesPerUser: Joi.number().integer().min(1).max(10).optional(),

  isGuaranteed: Joi.boolean().optional(),

  status: Joi.string()
    .valid(...Object.values(ContestStatus))
    .optional()
    .messages({ 'any.only': `Status must be one of: ${Object.values(ContestStatus).join(', ')}` }),

  closedAt:    Joi.date().iso().optional().allow(null),
  completedAt: Joi.date().iso().optional().allow(null),
  cancelReason: Joi.string().trim().max(500).optional(),

}).min(1).messages({ 'object.min': 'At least one field must be provided for update' });

// ── User: Join Contest ────────────────────────────────────────────────────────

export const joinContestSchema = Joi.object({
  contestId: Joi.string().trim().required()
    .messages({ 'string.empty': 'Contest ID is required' }),
  teamId: Joi.string().trim().optional(),
});

// ── Query Params ──────────────────────────────────────────────────────────────

export const contestQuerySchema = Joi.object({
  matchId:     Joi.string().trim().optional(),
  status:      Joi.string().valid(...Object.values(ContestStatus)).optional(),
  contestType: Joi.string().valid(...Object.values(ContestType)).optional(),
  page:        Joi.number().integer().min(1).default(1),
  limit:       Joi.number().integer().min(1).max(100).default(20),
});

export const prizeTablePreviewSchema = Joi.object({
  prizePool: Joi.number().positive().required()
    .messages({
      'number.base': 'prizePool must be a number',
      'number.positive': 'prizePool must be greater than 0',
    }),
  totalPlayers: Joi.number().integer().min(1).required()
    .messages({
      'number.base': 'totalPlayers must be a number',
      'number.min': 'totalPlayers must be at least 1',
    }),
  winnerPercentage: Joi.number().min(1).max(100).required()
    .messages({
      'number.base': 'winnerPercentage must be a number',
      'number.min': 'winnerPercentage must be at least 1',
      'number.max': 'winnerPercentage cannot exceed 100',
    }),
  rank: Joi.number().integer().min(1).optional(),
});
