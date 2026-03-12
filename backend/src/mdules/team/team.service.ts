import mongoose, { ClientSession, Types } from "mongoose";
import { ITeam, Team } from "./team.model";
import { CreateTeamDTO, TeamPublic, UpdateTeamDTO } from "./team.types";
import { Contest } from "../contest/contest.model";
import { ContestStatus } from "../contest/contest.types";
import { MatchStatus } from "../match/match.types";
import AppError from "../../utils/AppError";

// ── Shape Mapper ──────────────────────────────────────────────────────────────

const toTeamPublic = (doc: ITeam): TeamPublic => ({
    id:           (doc._id as Types.ObjectId).toString(),
    contestId:    doc.contestId.toString(),
    matchId:      doc.matchId?.toString() || '',
    userId:       doc.userId.toString(),
    teamName:     doc.teamName,
    players:      doc.players.map(p => ({
        playerId:    p.playerId,
        playerName:  p.playerName,
        playerRole:  p.playerRole,
        captainRole: p.captainRole,
        teamName:    p.teamName,
    })),
    captainId:     doc.captainId     ?? null,
    viceCaptainId: doc.viceCaptainId ?? null,
    isLocked:      doc.isLocked,
    totalPlayers:  doc.players.length,
    createdAt:     doc.createdAt,
    updatedAt:     doc.updatedAt,
});


// ── Transaction Utility ───────────────────────────────────────────────────────

const withTransaction = async <T>(fn: (session: ClientSession) => Promise<T>): Promise<T> => {
    const session = await mongoose.startSession();
    session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
    });
    try {
        const result = await fn(session);
        await session.commitTransaction();
        return result;
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
};


// ═════════════════════════════════════════════════════════════════════════════
// TEAM SERVICE
// ═════════════════════════════════════════════════════════════════════════════


export class TeamService {

    // ── Step 1: Create team (before joining contest) ───────────────────────────
    /**
     * User builds and saves their team for a specific contest.
     * This does NOT deduct any money — it just saves the team.
     *
     * Called when user clicks "Save Team" on the team-building page.
     * The saved team ID is then used in joinContest().
     *
     * Rules enforced by model's pre-save hook:
     *   • Exactly 11 players
     *   • Exactly 1 captain (2× points)
     *   • Exactly 1 vice-captain (1.5× points)
     *   • No duplicate players
     *   • At least 1 wicket-keeper, 1 bowler, 1 batsman
     *   • Multiple teams per user are allowed
    */

    async createTeam(userId: string, dto: CreateTeamDTO): Promise<TeamPublic> {
        // Verify contest exists and is still accepting entries
        const contest = await Contest.findById(dto.contestId);
        if (!contest) throw new AppError('Contest not found.', 404);
        if (
            contest.status !== ContestStatus.OPEN &&
            contest.status !== ContestStatus.FULL
        ) {
          throw new AppError(
            `Cannot create a team for a contest with status: ${contest.status}.`,
            409
          );
        }

        // Team creation is allowed only before match start.
        const { Match } = await import('../match/match.model');
        const match = await Match.findById(contest.matchId);
        if (!match) throw new AppError('Match not found for this contest.', 404);
        if (match.status !== MatchStatus.UPCOMING) {
            throw new AppError('Team can be created only while match is UPCOMING.', 409);
        }

        const team = await Team.create({
            contestId: new Types.ObjectId(dto.contestId),
            matchId:   contest.matchId,
            userId:    new Types.ObjectId(userId),
            teamName:  dto.teamName,
            players:   dto.players,
            // captainId, viceCaptainId, isLocked set by pre-save hook
        });

        return toTeamPublic(team);
    }

    // ── Step 2: Edit team (allowed only before match start) ──────────────────
    async updateTeam(userId: string, teamId: string, dto: UpdateTeamDTO): Promise<TeamPublic> {
        const team = await Team.findById(teamId);
        if (!team) throw new AppError('Team not found.', 404);
        if (team.userId.toString() !== userId) throw new AppError('You can edit only your own team.', 403);
        if (team.isLocked) throw new AppError('Team is locked and cannot be edited.', 409);

        const { Match } = await import('../match/match.model');
        const match = await Match.findById(team.matchId);
        if (!match) throw new AppError('Match not found for this team.', 404);

        // Editing is allowed strictly before match start.
        if (match.status !== MatchStatus.UPCOMING) {
            throw new AppError('Team can be edited only while match is UPCOMING.', 409);
        }

        if (dto.teamName !== undefined) team.teamName = dto.teamName;
        if (dto.players !== undefined) team.players = dto.players;

        await team.save();
        return toTeamPublic(team);
    }

    async deleteTeam(userId: string, teamId: string): Promise<{ teamId: string; teamName: string }> {
        const team = await Team.findById(teamId);
        if (!team) throw new AppError('Team not found.', 404);
        if (team.userId.toString() !== userId) throw new AppError('You can delete only your own team.', 403);

        const { ContestEntry } = await import('../contest/contest.model');
        const entries = await ContestEntry.find({ teamId: team._id }).select('contestId').lean();
        if (entries.length > 0) {
            const contestIds = entries.map((e: any) => e.contestId).filter(Boolean);
            const contests = await Contest.find({ _id: { $in: contestIds } }).select('status').lean();
            const hasActiveContest = contests.some((c: any) =>
                c.status === ContestStatus.DRAFT ||
                c.status === ContestStatus.OPEN ||
                c.status === ContestStatus.FULL ||
                c.status === ContestStatus.CLOSED
            );

            if (hasActiveContest) {
                throw new AppError('This team is already joined in an active contest and cannot be deleted.', 409);
            }
        }

        const deletedTeamId = team._id.toString();
        const deletedTeamName = team.teamName;
        await Team.deleteOne({ _id: team._id });

        return { teamId: deletedTeamId, teamName: deletedTeamName };
    }

    // ── User: Get My Teams ────────────────────────────────────────────────────
    async getMyTeams(userId: string): Promise<TeamPublic[]> {
        const teams = await Team.find({ userId: new Types.ObjectId(userId) })
            .sort({ createdAt: -1 });
        return teams.map(toTeamPublic);
    }
};

export default new TeamService();
