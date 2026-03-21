import Joi from 'joi';
import { DismissalType } from './score.types';

// ── BallEvent validator ───────────────────────────────────────────────────────

export const ballEventSchema = Joi.object({
  eventId:          Joi.string().trim().min(6).max(120).optional(),
  matchId:          Joi.string().required(),

  // Batter
  battingPlayerId:  Joi.string().required(),
  runs:             Joi.number().integer().min(0).max(7).required(),
  isDotBall:        Joi.boolean().required(),
  isFour:           Joi.boolean().required(),
  isSix:            Joi.boolean().required(),
  ballsFaced:       Joi.number().integer().valid(0, 1).required(), // 0 = wide/no-ball
  isOut:            Joi.boolean().required(),
  dismissalType:    Joi.when('isOut', {
    is:   true,
    then: Joi.string().valid(...Object.values(DismissalType)).required(),
    otherwise: Joi.string().valid(...Object.values(DismissalType)).optional(),
  }),

  // Bowler
  bowlingPlayerId:  Joi.string().required(),
  runsConceded:     Joi.number().integer().min(0).required(),
  isWide:           Joi.boolean().required(),
  isNoBall:         Joi.boolean().required(),
  isMaiden:         Joi.boolean().optional(),

  // Fielder (optional — only on fielding dismissals)
  fieldingPlayerId: Joi.string().optional(),
  isCatch:          Joi.boolean().optional(),
  isDirectRunOut:   Joi.boolean().optional(),
  isIndirectRunOut: Joi.boolean().optional(),
  isStumping:       Joi.boolean().optional(),

  // Overthrow
  isOverthrow:          Joi.boolean().required(),
  overthrowRuns:        Joi.when('isOverthrow', {
    is:   true,
    then: Joi.number().integer().min(1).required(),
    otherwise: Joi.number().integer().optional(),
  }),
  overthrowIsBoundary:  Joi.when('isOverthrow', {
    is:   true,
    then: Joi.boolean().required(),
    otherwise: Joi.boolean().optional(),
  }),

  // Over meta
  overNumber:  Joi.number().integer().min(0).required(),
  ballNumber:  Joi.number().integer().min(1).max(6).required(),
}).options({ presence: 'optional' });


// ── SetPlayerScore validator ──────────────────────────────────────────────────

export const setPlayerScoreSchema = Joi.object({
  matchId:  Joi.string().required(),
  playerId: Joi.string().required(),

  // Batting
  runs:          Joi.number().integer().min(0).optional(),
  ballsFaced:    Joi.number().integer().min(0).optional(),
  fours:         Joi.number().integer().min(0).optional(),
  sixes:         Joi.number().integer().min(0).optional(),
  isOut:         Joi.boolean().optional(),
  dismissalType: Joi.string().valid(...Object.values(DismissalType)).optional(),
  didNotBat:     Joi.boolean().optional(),

  // Bowling
  wickets:        Joi.number().integer().min(0).optional(),
  oversBowled:    Joi.number().min(0).optional(),
  maidenOvers:    Joi.number().integer().min(0).optional(),
  runsConceded:   Joi.number().integer().min(0).optional(),
  dotBalls:       Joi.number().integer().min(0).optional(),
  lbwBowledCount: Joi.number().integer().min(0).optional(),

  // Fielding
  catches:         Joi.number().integer().min(0).optional(),
  directRunOuts:   Joi.number().integer().min(0).optional(),
  indirectRunOuts: Joi.number().integer().min(0).optional(),
  stumpings:       Joi.number().integer().min(0).optional(),

  // Bonus
  isPlayerOfMatch:     Joi.boolean().optional(),
  isAnnouncedInLineup: Joi.boolean().optional(),
}).min(3); // matchId + playerId + at least 1 stat field
