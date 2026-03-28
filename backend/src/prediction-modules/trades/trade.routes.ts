import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.middleware';
import validate from '../../middlewares/validate.middleware';
import tradeController from './trade.controller';
import { tradeIdParamSchema, tradeQuerySchema } from './trade.validators';

const router = Router();

router.get('/trades', validate(tradeQuerySchema, 'query'), tradeController.listTrades);
router.get('/trades/me', authenticate, validate(tradeQuerySchema, 'query'), tradeController.getMyTrades);
router.get('/trades/:tradeId', validate(tradeIdParamSchema, 'params'), tradeController.getTradeById);

export default router;
