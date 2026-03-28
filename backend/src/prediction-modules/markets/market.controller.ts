import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import marketService from './market.service';

class MarketController {
  createMarket = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await marketService.createMarket(req.user!.id, req.body);
    res.status(201).json({ status: 'success', data });
  });

  updateMarket = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await marketService.updateMarket(req.params.marketId as string, req.body);
    res.status(200).json({ status: 'success', data });
  });

  listMarkets = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await marketService.listMarkets(req.query as any);
    res.status(200).json({ status: 'success', data });
  });

  getMarketById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await marketService.getMarketById(req.params.marketId as string);
    res.status(200).json({ status: 'success', data });
  });
}

export default new MarketController();
