import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import settlementService from './settlement.service';

class SettlementController {
  resolveMarket = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await settlementService.resolveMarket(req.user!.id, req.body);
    res.status(200).json({
      status: 'success',
      data,
    });
  });

  retryFailedSettlement = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await settlementService.retryFailedSettlement(req.user!.id, req.params.marketId as string);
    res.status(200).json({
      status: 'success',
      data,
    });
  });
}

export default new SettlementController();
