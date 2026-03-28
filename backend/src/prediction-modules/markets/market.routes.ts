import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.middleware';
import requireAdmin from '../../middlewares/requireAdmin.middleware';
import validate from '../../middlewares/validate.middleware';
import marketController from './market.controller';
import {
  createMarketSchema,
  marketIdParamSchema,
  marketQuerySchema,
  updateMarketSchema,
} from './market.validators';

const router = Router();

router.get('/markets', validate(marketQuerySchema, 'query'), marketController.listMarkets);
router.get('/markets/:marketId', validate(marketIdParamSchema, 'params'), marketController.getMarketById);

router.post('/admin/markets', authenticate, requireAdmin, validate(createMarketSchema), marketController.createMarket);
router.patch(
  '/admin/markets/:marketId',
  authenticate,
  requireAdmin,
  validate(marketIdParamSchema, 'params'),
  validate(updateMarketSchema),
  marketController.updateMarket
);

export default router;
