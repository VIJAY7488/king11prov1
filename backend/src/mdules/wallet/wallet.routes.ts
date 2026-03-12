import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.middleware';
import walletController from './wallet.controller';


const router = Router();

// All wallet routes require authentication
router.use(authenticate);

// ── Balance & Summary ─────────────────────────────────────────────────────────
router.get('/balance', walletController.getBalance);
router.get('/transactions', walletController.getTransactions);

export default router;
