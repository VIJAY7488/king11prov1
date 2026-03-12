import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware";
import { createTeamSchema, updateTeamSchema } from "./team.validators";
import teamController from "./team.controller";
import validate from "../../middlewares/validate.middleware";

const router = Router();

// All team routes require a logged-in user
router.use(authenticate);

// ══════════════════════════════════════════════════════════════════════════════
// USER ROUTES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/teams
 * Step 1 — Save team composition (no money deducted yet)
 * Body: { contestId, teamName, players[11] }
 */
router.post('/form-team', validate( createTeamSchema ), teamController.createTeam );
router.get('/my-teams', teamController.getMyTeams);
router.patch('/team/:id', validate(updateTeamSchema), teamController.updateTeam);
router.delete('/team/:id', teamController.deleteTeam);


export default router;
