import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import referralService from './referral.service';

export class ReferralController {
  getMyReferralSummary = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const summary = await referralService.getMyReferralSummary(req.user!.id);
    res.status(200).json({
      status: 'success',
      data: { summary },
    });
  });

  listMyReferrals = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await referralService.listMyReferrals(req.user!.id, req.query as any);
    res.status(200).json({
      status: 'success',
      data: result,
    });
  });
}

export default new ReferralController();
