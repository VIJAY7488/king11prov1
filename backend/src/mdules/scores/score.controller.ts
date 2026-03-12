import { Request, Response } from 'express';
import mongoose from 'mongoose';
import asyncHandler from '../../utils/asyncHandler';
import AppError from '../../utils/AppError';
import scoreService from './score.service';

const validateObjectId = (id: string, label = 'ID'): void => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${label}: "${id}".`, 400);
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// SCORE CONTROLLER
// ═════════════════════════════════════════════════════════════════════════════

export class ScoreController {

  // ── Admin: Process a ball event ──────────────────────────────────────────
  /**
   * POST /api/v1/scores/ball
   * Admin calls this after every single delivery.
   * Updates player stats, recalculates fantasy points + leaderboards,
   * and publishes a WebSocket broadcast.
   */
  processBall = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const event = await scoreService.processBallEvent(req.body);
    res.status(200).json({
      status:  'success',
      message: `Ball ${event.over}.${event.ball} processed. ${event.updatedPlayers.length} player(s) updated.`,
      data:    event,
    });
  });

  // ── Admin: Override / correct a player's full stat-line ──────────────────
  /**
   * POST /api/v1/scores/set-player
   * Admin sets the complete stat-line for a player.
   * fantasyPoints is always recalculated — never set manually.
   * Blocked once isConfirmed = true.
   */
  setPlayerScore = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const score = await scoreService.setPlayerScore(req.body);
    res.status(200).json({
      status:  'success',
      message: `Score updated for player ${score.playerName}. Fantasy points: ${score.fantasyPoints}.`,
      data:    { score },
    });
  });

  // ── Admin: Confirm / lock all scores for a match ─────────────────────────
  /**
   * POST /api/v1/scores/confirm/:matchId
   * Locks all PlayerScore docs, copies live → final on ContestEntry,
   * completes all CLOSED contests, and broadcasts MATCH_CONFIRMED WS event.
   */
  confirmScores = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const matchId = req.params['matchId'] as string;
    validateObjectId(matchId, 'match ID');
    const event = await scoreService.confirmMatchScores(matchId);
    res.status(200).json({
      status:  'success',
      message: 'Match scores confirmed. All results are final.',
      data:    event,
    });
  });

  // ── Auth: Get all scores for a match ─────────────────────────────────────
  getMatchScores = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const matchId = req.params['matchId'] as string;
    validateObjectId(matchId, 'match ID');
    const scores = await scoreService.getMatchScores(matchId);
    res.status(200).json({ status: 'success', data: scores });
  });

  // ── Auth: Live leaderboard for a contest ─────────────────────────────────
  getLeaderboard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const contestId = req.params['contestId'] as string;
    validateObjectId(contestId, 'contest ID');
    const leaderboard = await scoreService.getLiveLeaderboard(contestId);
    res.status(200).json({ status: 'success', data: leaderboard });
  });

  getContestLiveView = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const contestId = req.params['contestId'] as string;
    validateObjectId(contestId, 'contest ID');
    const data = await scoreService.getContestLiveView(contestId, req.user!.id);
    res.status(200).json({ status: 'success', data });
  });

  getContestTeamBreakdown = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const contestId = req.params['contestId'] as string;
    const teamId = req.params['teamId'] as string;
    validateObjectId(contestId, 'contest ID');
    validateObjectId(teamId, 'team ID');
    const data = await scoreService.getContestTeamBreakdown(contestId, teamId);
    res.status(200).json({ status: 'success', data });
  });

  // ── Auth: Single player score card ────────────────────────────────────────
  getPlayerScore = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const matchId  = req.params['matchId']  as string;
    const playerId = req.params['playerId'] as string;
    validateObjectId(matchId, 'match ID');
    const score = await scoreService.getPlayerScore(matchId, playerId);
    res.status(200).json({ status: 'success', data: { score } });
  });
}

export default new ScoreController();
