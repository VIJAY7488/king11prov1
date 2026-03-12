import { NextFunction, Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import depositService from './deposit.service';
import { DepositStatus } from './deposite.types';


/**
 * Thin HTTP layer — no business logic.
 * Splits cleanly into user-facing and admin-facing actions.
 */
export class DepositController {

  // ── User Actions ───────────────────────────────────────────────────────────

  /** POST /deposits — submit a new deposit request */
  createDeposit = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const deposit = await depositService.createDeposit(req.user!.id, req.body);
    res.status(201).json({
      status: 'success',
      message: 'Deposit request submitted. Awaiting admin approval.',
      data: { deposit },
    });
  });

  /** Get /deposits/id - new deposit request by id */
  getDepositById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deposit = await depositService.getDepositById(
        req.params.id as string,
        req.user!.id
      );
      res.status(200).json({ status: 'success', data: { deposit } });
    } catch (err) {
      next(err);
    }
  };


  /**
   * PATCH /api/v1/deposits/admin/:id/review
   *
   * Approve:  { "status": "APPROVED", "adminNote": "Verified" }
   *   → deposit.status = APPROVED
   *   → user.walletBalance += deposit.amount  (atomic, in same DB session)
   *   → wallet ledger entry created
   *   → response includes new walletBalance + walletTransactionId
   *
   * Reject:   { "status": "REJECTED", "adminNote": "Invalid UTR" }
   *   → deposit.status = REJECTED
   *   → wallet unchanged
   */

  reviewDeposit = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { status, adminNote } = req.body;
    const adminId = req.user!.id;
    const depositId = req.params.id as string;

    if (status === DepositStatus.APPROVED) {
      const result = await depositService.approveDeposit(depositId, adminId);
      res.status(200).json({
        status: 'success',
        message: `Deposit approved. ₹${result.deposit.amount} credited to user wallet.`,
        data: {
          deposit: result.deposit,
          walletBalance: result.walletBalance,
          walletTransactionId: result.walletTransactionId,
        },
      });
    } else if (status === DepositStatus.REJECTED) {
      const deposit = await depositService.rejectDeposit(depositId, adminId, adminNote);
      res.status(200).json({
        status: 'success',
        message: 'Deposit rejected. No wallet changes made.',
        data: { deposit },
      });
    } else {
      res.status(400).json({ status: 'error', message: 'Invalid status. Use APPROVED or REJECTED.' });
    }
  })

  /** GET /deposits/admin/all — admin list with populated user info */
  listDeposits = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await depositService.listDeposits(req.query as any);
    res.status(200).json({ status: 'success', data: result });
  });
}

export default new DepositController();