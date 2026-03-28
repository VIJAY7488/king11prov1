import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.middleware';
import validate from '../../middlewares/validate.middleware';
import smartRouterController from './smartRouter.controller';
import { smartTradeExecuteSchema } from './smartRouter.validators';

const router = Router();

router.use(authenticate);

router.post('/trade/execute', validate(smartTradeExecuteSchema), smartRouterController.executeTrade);

export default router;
