import { Request, Response } from "express";
import mongoose from "mongoose";
import AppError from "../../utils/AppError";
import asyncHandler from "../../utils/asyncHandler";
import teamService from "./team.service";

// ── Helper ────────────────────────────────────────────────────────────────────

const validateObjectId = (id: string, label = 'ID'): void => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new AppError(`Invalid ${label}: "${id}".`, 400);
    }
};


// ═════════════════════════════════════════════════════════════════════════════
// TEAM CONTROLLER
// ═════════════════════════════════════════════════════════════════════════════

export class TeamController {
    // ══════════════════════════════════════════════════════════════════════════
    // USER ACTIONS
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * POST /api/v1/teams
     * ────────────────────
     * Step 1 of joining a contest: build and save the team.
     * Money is NOT deducted here — this just saves the team composition.
     *
     * Frontend flow:
     *   User browses contest → clicks "Join Contest" → lands on team-builder page
     *   → selects 11 players, assigns captain & vice-captain
     *   → clicks "Save Team" → this endpoint is called
     *   → receives { team.id } → frontend stores teamId
     *   → shows "Join Contest" button which calls POST /teams/join
     *
     * Body: { contestId, teamName, players: [11 players with captainRole] }
     *
     * Validation (schema + model pre-save hook):
     *   • Exactly 11 players
     *   • Exactly 1 CAPTAIN
     *   • Exactly 1 VICE_CAPTAIN
     *   • No duplicate playerIds
     *   • At least 1 WICKET_KEEPER, 1 BOWLER, 1 BATSMAN
     *
     * Returns 201 with saved team including captainId, viceCaptainId.
    */

    createTeam = asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const team = await teamService.createTeam(req.user!.id, req.body);
    
        res.status(201).json({
          status:  'success',
          message: `Team "${team.teamName}" saved. Click "Join Contest" to enter with ₹ entry fee deducted.`,
          data:    { team },
        });
    });

    // GET /api/v1/users/my-teams
    getMyTeams = asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const teams = await teamService.getMyTeams(req.user!.id);
        res.status(200).json({ status: 'success', data: { teams } });
    });

    // PATCH /api/v1/users/team/:id
    updateTeam = asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const teamId = String(req.params.id ?? '');
        validateObjectId(teamId, 'teamId');

        const team = await teamService.updateTeam(req.user!.id, teamId, req.body);
        res.status(200).json({
          status: 'success',
          message: `Team "${team.teamName}" updated successfully.`,
          data: { team },
        });
    });

    // DELETE /api/v1/users/team/:id
    deleteTeam = asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const teamId = String(req.params.id ?? '');
        validateObjectId(teamId, 'teamId');

        const deleted = await teamService.deleteTeam(req.user!.id, teamId);
        res.status(200).json({
          status: 'success',
          message: `Team "${deleted.teamName}" deleted successfully.`,
          data: deleted,
        });
    });
};

export default new TeamController();
