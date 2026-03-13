import Joi from 'joi';
import { MatchStatus } from './match.types';
import { PlayerRole } from '../team/team.types';

const squadPlayerSchema = Joi.object({
  _id:  Joi.string().trim().required(),
  name: Joi.string().trim().max(100).required(),
  role: Joi.string().valid(...Object.values(PlayerRole)).required(),
});

const squadArray = Joi.array()
  .items(squadPlayerSchema)
  .min(11)
  .max(15)
  .required();

// Accept:
// 1) timezone-aware ISO datetime: 2026-03-13T14:30:00Z / +05:30
// 2) datetime-local string:       2026-03-13T14:30 (treated as IST in service)
const ISO_WITH_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const ISO_LOCAL_NO_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;

const matchDateSchema = Joi.string()
  .trim()
  .custom((value, helpers) => {
    if (ISO_WITH_TZ.test(value) || ISO_LOCAL_NO_TZ.test(value)) return value;
    return helpers.error('any.invalid');
  }, 'matchDate format')
  .messages({
    'any.invalid': 'matchDate must be an ISO datetime string (e.g. 2026-03-13T14:30:00Z).',
  });

export const createMatchSchema = Joi.object({
  team1Name:    Joi.string().trim().max(100).required(),
  team2Name:    Joi.string().trim().max(100).required(),
  team1Players: squadArray,
  team2Players: squadArray,
  matchDate:    matchDateSchema.required(),
  venue:        Joi.string().trim().max(200).optional(),
});

export const updateMatchSchema = Joi.object({
  team1Name:    Joi.string().trim().max(100).optional(),
  team2Name:    Joi.string().trim().max(100).optional(),
  team1Players: Joi.array().items(squadPlayerSchema).min(11).max(15).optional(),
  team2Players: Joi.array().items(squadPlayerSchema).min(11).max(15).optional(),
  matchDate:    matchDateSchema.optional(),
  venue:        Joi.string().trim().max(200).optional().allow(''),
  status:       Joi.string().valid(...Object.values(MatchStatus)).optional(),
}).min(1);
