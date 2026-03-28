import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.middleware';
import walletController from './wallet.controller';
import validate from '../../middlewares/validate.middleware';
import { walletAmountSchema } from './wallet.validators';


const router = Router();

// All wallet routes require authentication
router.use(authenticate);

// ── Balance & Summary ─────────────────────────────────────────────────────────
router.get('/balance', walletController.getBalance);
router.get('/transactions', walletController.getTransactions);
router.post('/deposit', validate(walletAmountSchema), walletController.deposit);
router.post('/withdraw', validate(walletAmountSchema), walletController.withdraw);

export default router;
