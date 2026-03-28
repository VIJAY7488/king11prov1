import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.middleware';
import requireAdmin from '../../middlewares/requireAdmin.middleware';
import validate from '../../middlewares/validate.middleware';
import riskController from './risk.controller';
import { killSwitchSchema, riskMarketParamSchema, updateRiskControlSchema } from './risk.validators';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/admin/risk/kill-switch', riskController.getKillSwitch);
router.post('/admin/risk/kill-switch', validate(killSwitchSchema), riskController.setKillSwitch);

router.get('/admin/risk/markets/:marketId', validate(riskMarketParamSchema, 'params'), riskController.getMarketRisk);
router.get(
  '/admin/risk/markets/:marketId/snapshot',
  validate(riskMarketParamSchema, 'params'),
  riskController.getMarketRiskSnapshot
);
router.post(
  '/admin/risk/markets/:marketId/recompute',
  validate(riskMarketParamSchema, 'params'),
  riskController.recomputeMarketRisk
);
router.patch(
  '/admin/risk/markets/:marketId',
  validate(riskMarketParamSchema, 'params'),
  validate(updateRiskControlSchema),
  riskController.updateMarketRiskControls
);

export default router;
