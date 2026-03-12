import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.middleware';
import requireAdmin from '../../middlewares/requireAdmin.middleware';
import validate from '../../middlewares/validate.middleware';
import withdrawalController from './withdrawal.controller';
import {
  createWithdrawalSchema,
  reviewWithdrawalSchema,
  withdrawalQuerySchema,
} from './withdrawal.validators';

const router = Router();

router.use(authenticate);

// User routes
router.post('/withdrawal', validate(createWithdrawalSchema), withdrawalController.createWithdrawal);
router.get('/withdrawals/my', validate(withdrawalQuerySchema, 'query'), withdrawalController.listMyWithdrawals);
router.get('/withdrawals/:id', withdrawalController.getWithdrawalById);

// Admin routes
router.get('/withdrawals/admin/all', requireAdmin, validate(withdrawalQuerySchema, 'query'), withdrawalController.listWithdrawals);
router.patch('/withdrawals/admin/:id/review', requireAdmin, validate(reviewWithdrawalSchema), withdrawalController.reviewWithdrawal);

export default router;
