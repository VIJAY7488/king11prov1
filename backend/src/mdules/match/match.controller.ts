import { Request, Response } from 'express';
import mongoose from 'mongoose';
import asyncHandler from '../../utils/asyncHandler';
import AppError from '../../utils/AppError';
import matchService from './match.service';

const validateObjectId = (id: string, label = 'ID'): void => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${label}: "${id}".`, 400);
  }
};

export class MatchController {

  // ── Admin ─────────────────────────────────────────────────────────────────

  createMatch = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const match = await matchService.createMatch(req.body);
    res.status(201).json({ status: 'success', data: { match } });
  });

  updateMatch = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;
    validateObjectId(id, 'match ID');
    const match = await matchService.updateMatch(id, req.body);
    res.status(200).json({ status: 'success', data: { match } });
  });

  // ── Public ────────────────────────────────────────────────────────────────

  listMatches = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await matchService.listMatches(req.query as any);
    res.status(200).json({ status: 'success', data: result });
  });

  getMatch = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = req.params['id'] as string;
    validateObjectId(id, 'match ID');
    const match = await matchService.getMatchById(id);
    res.status(200).json({ status: 'success', data: { match } });
  });

  getLiveMatches = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const matches = await matchService.getLiveMatches();
    res.status(200).json({ status: 'success', data: { matches } });
  });
}

export default new MatchController();
