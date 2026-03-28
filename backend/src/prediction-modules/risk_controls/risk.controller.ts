import { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import riskService from './risk.service';

class RiskController {
  getKillSwitch = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await riskService.getKillSwitch();
    res.status(200).json({ status: 'success', data });
  });

  setKillSwitch = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await riskService.setKillSwitch(req.body.enabled);
    res.status(200).json({ status: 'success', data });
  });

  getMarketRisk = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await riskService.getMarketRisk(req.params.marketId as string);
    res.status(200).json({ status: 'success', data });
  });

  getMarketRiskSnapshot = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await riskService.getMarketRiskSnapshot(req.params.marketId as string);
    res.status(200).json({ status: 'success', data });
  });

  recomputeMarketRisk = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await riskService.recomputeMarketRisk(req.params.marketId as string);
    res.status(200).json({ status: 'success', data });
  });

  updateMarketRiskControls = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = await riskService.updateMarketRiskControls(req.params.marketId as string, req.body);
    res.status(200).json({ status: 'success', data });
  });
}

export default new RiskController();
