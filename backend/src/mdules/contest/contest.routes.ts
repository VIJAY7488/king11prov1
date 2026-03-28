import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware";
import validate from "../../middlewares/validate.middleware";
import { createContestSchema, prizeTablePreviewSchema, updateContestSchema } from "./contest.validators";
import contestController from "./contest.controller";
import requireAdmin from "../../middlewares/requireAdmin.middleware";

// ── Public + Admin router — mounted at '/' in routes/index.ts ─────────────────
// Handles: GET /contests, GET /contests/:id/prize-table,
//          POST /contests/prize-table/preview, POST /contest (admin), PATCH /update-contest/:id (admin)
const publicContestRouter = Router();

// Public routes (no auth)
publicContestRouter.get('/contests', contestController.listContests);
publicContestRouter.get('/contests/:id/prize-table', contestController.getContestPrizeTable);
publicContestRouter.post('/contests/prize-table/preview', validate(prizeTablePreviewSchema), contestController.previewPrizeTable);

// Admin routes (auth required)
publicContestRouter.get('/admin/contests', authenticate, requireAdmin, contestController.adminListContests);
publicContestRouter.post('/contest', authenticate, validate(createContestSchema), requireAdmin, contestController.adminCreateContest);
publicContestRouter.patch('/contest/:id', authenticate, validate(updateContestSchema), requireAdmin, contestController.adminUpdateContest);
publicContestRouter.patch('/update-contest/:id', authenticate, validate(updateContestSchema), requireAdmin, contestController.adminUpdateContest);

export { publicContestRouter };


// ── User router — mounted at '/users' in routes/index.ts ──────────────────────
// Handles: POST /users/join-contest, GET /users/joined-contests
const userContestRouter = Router();

userContestRouter.use(authenticate);
userContestRouter.post('/join-contest', contestController.joinContest);
userContestRouter.get('/joined-contests', contestController.getMyJoinedContests);

export { userContestRouter };

// Default export kept for backward compatibility (not used after routes/index.ts update)
export default publicContestRouter;
