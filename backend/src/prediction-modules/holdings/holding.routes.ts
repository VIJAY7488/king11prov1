import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.middleware';
import validate from '../../middlewares/validate.middleware';
import holdingController from './holding.controller';
import { holdingMarketParamSchema, holdingQuerySchema } from './holding.validators';

const router = Router();

router.use(authenticate);

router.get('/holdings', validate(holdingQuerySchema, 'query'), holdingController.getMyHoldings);
router.get('/holdings/summary', holdingController.getMyHoldingsSummary);
router.get('/holdings/:marketId', validate(holdingMarketParamSchema, 'params'), holdingController.getMyHoldingsByMarket);

export default router;
