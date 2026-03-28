import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.middleware';
import validate from '../../middlewares/validate.middleware';
import orderController from './order.controller';
import {
  cancelOrderSchema,
  orderbookMarketParamSchema,
  orderbookViewQuerySchema,
  placeOrderSchema,
  userOrdersQuerySchema,
} from './order.validators';

const router = Router();

router.get('/orderbook/:marketId', validate(orderbookMarketParamSchema, 'params'), validate(orderbookViewQuerySchema, 'query'), orderController.getOrderbook);
router.post('/order/place', authenticate, validate(placeOrderSchema), orderController.placeOrder);
router.post('/order/cancel', authenticate, validate(cancelOrderSchema), orderController.cancelOrder);
router.get('/orders/user', authenticate, validate(userOrdersQuerySchema, 'query'), orderController.getMyOrders);

export default router;
