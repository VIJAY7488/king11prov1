import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.middleware';
import validate from '../../middlewares/validate.middleware';
import referralController from './referral.controller';
import { referralHistoryQuerySchema } from './referral.validators';

const router = Router();

router.use(authenticate);

router.get('/me/referral', referralController.getMyReferralSummary);
router.get('/me/referrals/history', validate(referralHistoryQuerySchema, 'query'), referralController.listMyReferrals);

export default router;
