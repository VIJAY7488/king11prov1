import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import tradeService from './trade.service';

class TradeController {
  listTrades = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await tradeService.listTrades(req.query as any);
    res.status(200).json({ status: 'success', data });
  });

  getTradeById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await tradeService.getTradeById(req.params.tradeId as string);
    res.status(200).json({ status: 'success', data });
  });

  getMyTrades = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await tradeService.getMyTrades(req.user!.id, req.query as any);
    res.status(200).json({ status: 'success', data });
  });
}

export default new TradeController();
