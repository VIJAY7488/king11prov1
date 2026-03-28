import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import smartRouterService from './smartRouter.service';

class SmartRouterController {
  executeTrade = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await smartRouterService.execute(req.user!.id, req.body);
    res.status(200).json({
      status: 'success',
      data: result,
    });
  });
}

export default new SmartRouterController();
