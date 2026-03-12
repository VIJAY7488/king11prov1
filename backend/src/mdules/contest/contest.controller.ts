import { Request, Response } from "express";
import mongoose from "mongoose";
import AppError from "../../utils/AppError";
import { PLATFORM_FEE_PERCENT } from "./contest.types";
import asyncHandler from "../../utils/asyncHandler";
import contestService from "./contest.service";


// ── Helpers ───────────────────────────────────────────────────────────────────

/** Validates that a route :id param is a valid MongoDB ObjectId */
const validateObjectId = (id: string, label = 'ID'): void => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${label}: "${id}".`, 400);
  }
};


// ═════════════════════════════════════════════════════════════════════════════
// CONTEST CONTROLLER
// ═════════════════════════════════════════════════════════════════════════════
// Thin HTTP layer — no business logic lives here.
// All decisions are delegated to contestService.
// Each handler: validates input → calls service → shapes HTTP response.
// ═════════════════════════════════════════════════════════════════════════════

export class ContestController {

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN — Contest Management
  // All routes below require authenticate + requireAdmin middleware.
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/v1/contests/admin
   * ─────────────────────────────
   * Create a new contest. Admin provides entryFee and prizePool;
   * the server auto-calculates:
   *
   *   platformFee     = prizePool × 20%         (e.g. 30,000 × 0.20 = 6,000)
   *   totalCollection = prizePool + platformFee  (e.g. 30,000 + 6,000 = 36,000)
   *   totalSpots      = floor(totalCollection / entryFee)  (e.g. 36,000 / 50 = 720)
   *
   * Default status is DRAFT — contest is invisible to users until admin
   * explicitly sets status to OPEN (either here or via PATCH).
   *
   * Body: { matchId, name, contestType, entryFee, prizePool,
   *         maxEntriesPerUser?, isGuaranteed?, description?,
   *         status?: "DRAFT"|"OPEN", closedAt?, completedAt? }
   *
   * Returns 201 with the created contest including all computed fields.
  */
  adminCreateContest = asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const contest = await contestService.createContest(req.body);
  
      res.status(201).json({
        status:  'success',
        message: `Contest "${contest.name}" created successfully. ` +
                 `totalSpots auto-calculated: ${contest.totalSpots} ` +
                 `(₹${contest.prizePool} pool + ${PLATFORM_FEE_PERCENT}% fee ₹${contest.platformFee} ` +
                 `= ₹${contest.totalCollection} ÷ ₹${contest.entryFee}/entry).`,
        data: { contest },
      });
  });

  /**
   * PATCH /api/v1/contests/admin/:id
   * ─────────────────────────────────
   * Update an existing contest. All fields are optional — send only what changes.
   *
   * Recalculation: If entryFee or prizePool is updated, totalSpots is
   * automatically recalculated by the model's pre-save hook.
   *
   * Guards enforced by service:
   *   • COMPLETED / CANCELLED  → rejected (terminal states)
   *   • entryFee change         → only allowed when filledSpots === 0
   *   • status change           → must follow allowed transitions:
   *       DRAFT → OPEN | CANCELLED
   *       OPEN  → CLOSED | CANCELLED | DRAFT
   *       FULL  → CLOSED | CANCELLED
   *       CLOSED → COMPLETED | CANCELLED
   *   • status → CANCELLED      → triggers atomic batch refund of all entries
   *
   * Body: { name?, description?, entryFee?, prizePool?, maxEntriesPerUser?,
   *         isGuaranteed?, status?, closedAt?, completedAt?, cancelReason? }
   *
   * Returns 200 with the updated contest.
  */

  adminUpdateContest = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    
    const { id } = req.params;

    if (!id || Array.isArray(id)) {
      throw new AppError('Invalid contest ID.', 400);
    }

    validateObjectId(id, 'contest ID');

    const contest = await contestService.updateContest(id, req.body);

    // Build a descriptive message based on what changed
    const statusMsg = req.body.status
      ? ` Status changed to ${contest.status}.`
      : '';
    const spotsMsg  = (req.body.entryFee !== undefined || req.body.prizePool !== undefined)
      ? ` totalSpots recalculated: ${contest.totalSpots}.`
      : '';

    res.status(200).json({
      status:  'success',
      message: `Contest "${contest.name}" updated successfully.${statusMsg}${spotsMsg}`,
      data: { contest },
    });
  });


  // ══════════════════════════════════════════════════════════════════════════
  // USER — Contest Discovery & Participation
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v1/contests
   * ──────────────────────
   * Public contest listing.
   * DRAFT and CANCELLED contests are hidden — only OPEN, FULL, CLOSED,
   * and COMPLETED contests are returned.
   * Sorted by entryFee ascending (cheapest first), then newest.
   *
   * Query: { matchId?, status?, contestType?, page?, limit? }
   *
   * Returns 200 with paginated contest list.
   */
  listContests = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await contestService.listContests(req.query as any);
    res.status(200).json({ status: 'success', data: result });
  });

  previewPrizeTable = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { prizePool, totalPlayers, winnerPercentage, rank } = req.body as {
      prizePool: number;
      totalPlayers: number;
      winnerPercentage: number;
      rank?: number;
    };

    const input = { prizePool, totalPlayers, winnerPercentage };
    const result = contestService.generatePrizeDistribution(input);
    const potentialEarning = Number.isInteger(rank)
      ? contestService.getPotentialEarningByRank(input, Number(rank))
      : undefined;

    res.status(200).json({
      status: 'success',
      data: {
        ...result,
        potentialEarning,
      },
    });
  });

  getContestPrizeTable = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const contestId = req.params['id'] as string;
    validateObjectId(contestId, 'contest ID');

    const winnerPercentage = Number(req.query['winnerPercentage'] ?? 25);
    const rank = req.query['rank'] !== undefined ? Number(req.query['rank']) : undefined;
    const result = await contestService.getContestPrizeDistribution(contestId, winnerPercentage);

    const potentialEarning = Number.isInteger(rank)
      ? (rank! >= 1 && rank! <= result.rankPrizes.length ? result.rankPrizes[rank! - 1] : 0)
      : undefined;

    res.status(200).json({
      status: 'success',
      data: {
        ...result,
        potentialEarning,
      },
    });
  });

  // POST /api/v1/users/join-contest
  joinContest = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { contestId, teamId } = req.body;
    if (!contestId || !teamId) throw new AppError('contestId and teamId are required.', 400);
    const result = await contestService.joinContest(req.user!.id, contestId, teamId);
    res.status(200).json({ status: 'success', data: result });
  });

  // GET /api/v1/users/joined-contests
  getMyJoinedContests = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const contests = await contestService.getMyJoinedContests(req.user!.id);
    res.status(200).json({ status: 'success', data: { contests } });
  });
}

export default new ContestController();
