import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import holdingService from './holding.service';

class HoldingController {
  getMyHoldings = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { marketId } = req.query as { marketId?: string };
    const data = await holdingService.getUserHoldings(req.user!.id, marketId);
    res.status(200).json({ status: 'success', data: { holdings: data } });
  });

  getMyHoldingsByMarket = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const marketId = req.params.marketId as string;
    const data = await holdingService.getUserHoldings(req.user!.id, marketId);
    res.status(200).json({ status: 'success', data: { holdings: data } });
  });

  getMyHoldingsSummary = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const summary = await holdingService.getUserHoldingsSummary(req.user!.id);
    res.status(200).json({ status: 'success', data: summary });
  });
}

export default new HoldingController();
