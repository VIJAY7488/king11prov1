import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import withdrawalService from './withdrawal.service';
import { WithdrawalStatus } from './withdrawal.types';

export class WithdrawalController {
  createWithdrawal = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await withdrawalService.createWithdrawal(req.user!.id, req.body);
    res.status(201).json({
      status: 'success',
      message: 'Withdrawal request submitted. Amount is reserved from wallet.',
      data: result,
    });
  });

  getWithdrawalById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const isAdmin = req.user?.role === 'ADMIN';
    const withdrawal = await withdrawalService.getWithdrawalById(req.params.id as string, req.user!.id, isAdmin);
    res.status(200).json({ status: 'success', data: { withdrawal } });
  });

  listMyWithdrawals = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await withdrawalService.listMyWithdrawals(req.user!.id, req.query as any);
    res.status(200).json({ status: 'success', data: result });
  });

  listWithdrawals = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await withdrawalService.listWithdrawals(req.query as any);
    res.status(200).json({ status: 'success', data: result });
  });

  reviewWithdrawal = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { status, adminNote } = req.body;
    const adminId = req.user!.id;
    const withdrawalId = req.params.id as string;

    if (status === WithdrawalStatus.APPROVED) {
      const result = await withdrawalService.approveWithdrawal(withdrawalId, adminId, adminNote);
      res.status(200).json({
        status: 'success',
        message: 'Withdrawal approved successfully.',
        data: result,
      });
      return;
    }

    if (status === WithdrawalStatus.REJECTED) {
      const result = await withdrawalService.rejectWithdrawal(withdrawalId, adminId, adminNote);
      res.status(200).json({
        status: 'success',
        message: 'Withdrawal rejected and amount refunded.',
        data: result,
      });
      return;
    }

    res.status(400).json({ status: 'error', message: 'Invalid status. Use APPROVED or REJECTED.' });
  });
}

export default new WithdrawalController();
