import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.middleware';
import validate from '../../middlewares/validate.middleware';
import ammController from './amm.controller';
import { tradeActionSchema } from './amm.validators';

const router = Router();

router.use(authenticate);

router.post('/trade/buy-yes', validate(tradeActionSchema), ammController.buyYes);
router.post('/trade/buy-no', validate(tradeActionSchema), ammController.buyNo);
router.post('/trade/sell-yes', validate(tradeActionSchema), ammController.sellYes);
router.post('/trade/sell-no', validate(tradeActionSchema), ammController.sellNo);

export default router;
