import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.middleware';
import requireAdmin from '../../middlewares/requireAdmin.middleware';
import validate from '../../middlewares/validate.middleware';
import settlementController from './settlement.controller';
import { resolveMarketSchema, settlementMarketParamSchema } from './settlement.validators';

const router = Router();

router.post('/admin/resolve-market', authenticate, requireAdmin, validate(resolveMarketSchema), settlementController.resolveMarket);
router.post(
  '/admin/settlements/:marketId/retry',
  authenticate,
  requireAdmin,
  validate(settlementMarketParamSchema, 'params'),
  settlementController.retryFailedSettlement
);

export default router;
