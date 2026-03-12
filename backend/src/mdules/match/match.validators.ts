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

export const createMatchSchema = Joi.object({
  team1Name:    Joi.string().trim().max(100).required(),
  team2Name:    Joi.string().trim().max(100).required(),
  team1Players: squadArray,
  team2Players: squadArray,
  matchDate:    Joi.date().iso().required(),
  venue:        Joi.string().trim().max(200).optional(),
});

export const updateMatchSchema = Joi.object({
  team1Name:    Joi.string().trim().max(100).optional(),
  team2Name:    Joi.string().trim().max(100).optional(),
  team1Players: Joi.array().items(squadPlayerSchema).min(11).max(15).optional(),
  team2Players: Joi.array().items(squadPlayerSchema).min(11).max(15).optional(),
  matchDate:    Joi.date().iso().optional(),
  venue:        Joi.string().trim().max(200).optional().allow(''),
  status:       Joi.string().valid(...Object.values(MatchStatus)).optional(),
}).min(1);
