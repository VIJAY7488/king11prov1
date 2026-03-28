import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import orderbookService from './order.service';

class OrderbookController {
  placeOrder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await orderbookService.placeOrder(req.user!.id, req.body);
    res.status(200).json({ status: 'success', data: result });
  });

  cancelOrder = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await orderbookService.cancelOrder(req.user!.id, req.body);
    res.status(200).json({ status: 'success', data: result });
  });

  getOrderbook = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const marketId = req.params.marketId as string;
    const { outcome, depth } = req.query as { outcome: any; depth?: any };
    const data = await orderbookService.getOrderBook(marketId, outcome, depth ? Number(depth) : 20);
    res.status(200).json({ status: 'success', data });
  });

  getMyOrders = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await orderbookService.getUserOrders(req.user!.id, req.query as any);
    res.status(200).json({ status: 'success', data });
  });
}

export default new OrderbookController();
