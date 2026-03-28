import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import walletService from './wallet.service';
import { WalletTxnReason } from './wallet.types';




/**
 * Controllers handle HTTP only: extract inputs, call service, shape response.
 *
 * NOTE: Wallet crediting (DEPOSIT type) is no longer triggered directly here.
 * It is initiated exclusively by deposit.service.approveDeposit() which calls
 * walletService.creditFromDeposit() internally. This ensures every credit
 * is backed by an admin-approved Deposit record.
 */
export class WalletController {

  // ── Balance & Summary ──────────────────────────────────────────────────────

  getBalance = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const summary = await walletService.getBalance(req.user!.id);
    res.status(200).json({
      status: 'success',
      data: {
        balance: summary.totalBalance,
        availableBalance: summary.availableBalance,
        lockedBalance: summary.lockedBalance,
        withdrawableBalance: summary.withdrawableBalance,
        nonWithdrawableBonusBalance: summary.nonWithdrawableBonusBalance,
      },
    });
  });

  getTransactions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await walletService.listTransactions(req.user!.id, req.query as any);
    res.status(200).json({
      status: 'success',
      data: result,
    });
  });

  deposit = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { amount } = req.body as { amount: number };
    const result = await walletService.creditBalance(req.user!.id, {
      amount,
      referenceId: `API:DEPOSIT:${req.user!.id}:${Date.now()}`,
      reason: WalletTxnReason.DEPOSIT,
      metadata: { source: 'wallet-api' },
    });

    res.status(200).json({
      status: 'success',
      data: result,
    });
  });

  withdraw = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { amount } = req.body as { amount: number };
    const result = await walletService.debitBalance(req.user!.id, {
      amount,
      referenceId: `API:WITHDRAW:${req.user!.id}:${Date.now()}`,
      reason: WalletTxnReason.WITHDRAW,
      metadata: { source: 'wallet-api' },
    });

    res.status(200).json({
      status: 'success',
      data: result,
    });
  });

}

export default new WalletController();
