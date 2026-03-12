import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.middleware';
import requireAdmin from '../../middlewares/requireAdmin.middleware';
import validate from '../../middlewares/validate.middleware';
import { ballEventSchema, setPlayerScoreSchema } from './score.validators';
import scoreController from './score.controller';

const router = Router();

// ── All score routes require authentication ───────────────────────────────────
router.use(authenticate);

// ── Public (auth) read endpoints ──────────────────────────────────────────────
router.get('/scores/match/:matchId',                scoreController.getMatchScores);
router.get('/scores/leaderboard/:contestId',        scoreController.getLeaderboard);
router.get('/scores/contest/:contestId/live',       scoreController.getContestLiveView);
router.get('/scores/contest/:contestId/team/:teamId', scoreController.getContestTeamBreakdown);
router.get('/scores/player/:matchId/:playerId',     scoreController.getPlayerScore);

// ── Admin-only write endpoints ────────────────────────────────────────────────
router.post('/scores/ball',              validate(ballEventSchema),      requireAdmin, scoreController.processBall);
router.post('/scores/set-player',        validate(setPlayerScoreSchema), requireAdmin, scoreController.setPlayerScore);
router.post('/scores/confirm/:matchId',  requireAdmin,                   scoreController.confirmScores);

export default router;
