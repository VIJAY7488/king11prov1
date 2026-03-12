import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.middleware';
import requireAdmin from '../../middlewares/requireAdmin.middleware';
import validate from '../../middlewares/validate.middleware';
import { createMatchSchema, updateMatchSchema } from './match.validators';
import matchController from './match.controller';

const router = Router();

// ── Public routes ─────────────────────────────────────────────────────────────
router.get('/matches',        matchController.listMatches);
router.get('/matches/live',   matchController.getLiveMatches);
router.get('/matches/:id',    matchController.getMatch);

// ── Admin routes ──────────────────────────────────────────────────────────────
router.use(authenticate);

router.post(  '/matches',     validate(createMatchSchema), requireAdmin, matchController.createMatch);
router.patch( '/matches/:id', validate(updateMatchSchema), requireAdmin, matchController.updateMatch);

export default router;
