import Joi from 'joi';
import { PlayerRole, CaptainRole } from './team.types';

// ── Reusable: single player slot ──────────────────────────────────────────────

const playerSchema = Joi.object({
    playerId: Joi.string().trim().required()
        .messages({ 'string.empty': 'Player ID is required' }),

    playerName: Joi.string().trim().min(2).max(100).required()
        .messages({ 'string.empty': 'Player name is required' }),

    playerRole: Joi.string()
        .valid(...Object.values(PlayerRole))
        .required()
        .messages({ 'any.only': `Player role must be one of: ${Object.values(PlayerRole).join(', ')}` }),

    captainRole: Joi.string()
        .valid(...Object.values(CaptainRole))
        .default(CaptainRole.NONE),

    teamName: Joi.string().trim().min(2).max(100).required()
        .messages({ 'string.empty': 'Team name is required' }),
});

// ── Create Team ───────────────────────────────────────────────────────────────

export const createTeamSchema = Joi.object({
    contestId: Joi.string().trim().required()
        .messages({ 'string.empty': 'Contest ID is required' }),
  
    teamName: Joi.string().trim().min(2).max(100).required()
        .messages({ 'string.empty': 'Team name is required' }),
  
    players: Joi.array()
        .items(playerSchema)
        .length(11)
        .required()
        .messages({
            'array.length': 'Team must have exactly 11 players',
            'array.base':   'Players must be an array',
        }),
});

// ── Join Contest (with saved team) ────────────────────────────────────────────

export const joinContestSchema = Joi.object({
    teamId: Joi.string().trim().required()
        .messages({ 'string.empty': 'Team ID is required' }),
});

// ── Update Team (user — before contest closes) ────────────────────────────────

export const updateTeamSchema = Joi.object({
    teamName: Joi.string().trim().min(2).max(100).optional(),
  
    players: Joi.array()
        .items(playerSchema)
        .length(11)
        .optional()
        .messages({ 'array.length': 'Team must have exactly 11 players' }),

}).min(1).messages({ 'object.min': 'At least one field must be provided' });

// ── Admin: Override Captain / Vice-Captain ────────────────────────────────────

export const adminUpdateCaptainSchema = Joi.object({
    captain: Joi.string().trim().required()
        .messages({ 'string.empty': 'Captain player ID is required' }),
  
    viceCaptain: Joi.string().trim().required()
        .messages({ 'string.empty': 'Vice-captain player ID is required' }),
});