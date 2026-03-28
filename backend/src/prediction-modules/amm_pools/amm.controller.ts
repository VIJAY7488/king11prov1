import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import ammService from './amm.service';

class AmmController {
  buyYes = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await ammService.buyYes(req.user!.id, req.body);
    res.status(200).json({ status: 'success', data: result });
  });

  buyNo = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await ammService.buyNo(req.user!.id, req.body);
    res.status(200).json({ status: 'success', data: result });
  });

  sellYes = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await ammService.sellYes(req.user!.id, req.body);
    res.status(200).json({ status: 'success', data: result });
  });

  sellNo = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await ammService.sellNo(req.user!.id, req.body);
    res.status(200).json({ status: 'success', data: result });
  });
}

export default new AmmController();
