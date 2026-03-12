import { Router } from "express";
import authenticate from "../../middlewares/authenticate.middleware";
import validate from "../../middlewares/validate.middleware";
import { createContestSchema, prizeTablePreviewSchema, updateContestSchema } from "./contest.validators";
import contestController from "./contest.controller";
import requireAdmin from "../../middlewares/requireAdmin.middleware";



const router = Router();

// Public routes
router.get('/contests', contestController.listContests);
router.get('/contests/:id/prize-table', contestController.getContestPrizeTable);
router.post('/contests/prize-table/preview', validate(prizeTablePreviewSchema), contestController.previewPrizeTable);

// All contest routes require authentication
router.use(authenticate);


router.post('/contest', validate(createContestSchema), requireAdmin, contestController.adminCreateContest);
router.patch('/update-contest/:id', validate(updateContestSchema), requireAdmin, contestController.adminUpdateContest);

// User: join a contest with an existing team
router.post('/join-contest', contestController.joinContest);
router.get('/joined-contests', contestController.getMyJoinedContests);

export default router;
