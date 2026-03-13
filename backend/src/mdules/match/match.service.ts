import { Types } from 'mongoose';
import { Match, IMatch } from './match.model';
import {
  CreateMatchDTO,
  UpdateMatchDTO,
  MatchQueryParams,
  MatchPublic,
  PaginatedMatches,
  MatchStatus,
} from './match.types';
import AppError from '../../utils/AppError';
import { Contest } from '../contest/contest.model';
import { ContestStatus } from '../contest/contest.types';
import { Team } from '../team/team.model';

// ── Shape Mapper ──────────────────────────────────────────────────────────────

const toMatchPublic = (doc: IMatch): MatchPublic => ({
  id:           (doc._id as Types.ObjectId).toString(),
  team1Name:    doc.team1Name,
  team2Name:    doc.team2Name,
  team1Players: doc.team1Players,
  team2Players: doc.team2Players,
  matchDate:    doc.matchDate,
  venue:        doc.venue,
  status:       doc.status,
  createdAt:    doc.createdAt,
  updatedAt:    doc.updatedAt,
});

const assertUniqueSquadPlayerIds = (team1Players: IMatch['team1Players'], team2Players: IMatch['team2Players']): void => {
  const allIds = [...team1Players.map((p) => p._id), ...team2Players.map((p) => p._id)];
  if (new Set(allIds).size !== allIds.length) {
    throw new AppError('Duplicate player IDs found across squads.', 422);
  }
};

const hasNonStatusUpdates = (dto: UpdateMatchDTO): boolean =>
  dto.team1Name !== undefined ||
  dto.team2Name !== undefined ||
  dto.team1Players !== undefined ||
  dto.team2Players !== undefined ||
  dto.matchDate !== undefined ||
  dto.venue !== undefined;

// ── Status Transitions ────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  [MatchStatus.UPCOMING]:  [MatchStatus.LIVE, MatchStatus.CANCELLED],
  [MatchStatus.LIVE]:      [MatchStatus.COMPLETED, MatchStatus.CANCELLED],
  [MatchStatus.COMPLETED]: [],
  [MatchStatus.CANCELLED]: [],
};

// ═════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═════════════════════════════════════════════════════════════════════════════

export class MatchService {

  // ── Admin: Create Match ───────────────────────────────────────────────────
  async createMatch(dto: CreateMatchDTO): Promise<MatchPublic> {
    assertUniqueSquadPlayerIds(dto.team1Players, dto.team2Players);

    const match = await Match.create({
      team1Name:    dto.team1Name,
      team2Name:    dto.team2Name,
      team1Players: dto.team1Players,
      team2Players: dto.team2Players,
      matchDate:    dto.matchDate,
      venue:        dto.venue,
      status:       MatchStatus.UPCOMING,
    });

    return toMatchPublic(match);
  }

  // ── Admin: Update Match ──────────────────────────────────────────────────
  async updateMatch(matchId: string, dto: UpdateMatchDTO): Promise<MatchPublic> {
    const match = await Match.findById(matchId);
    if (!match) throw new AppError('Match not found.', 404);
    const previousStatus = match.status;

    if (
      match.status === MatchStatus.COMPLETED ||
      match.status === MatchStatus.CANCELLED
    ) {
      throw new AppError(`Match is ${match.status.toLowerCase()} and cannot be modified.`, 409);
    }

    // Once LIVE, only status transitions are allowed to preserve scoring integrity.
    if (match.status === MatchStatus.LIVE && hasNonStatusUpdates(dto)) {
      throw new AppError('Match details cannot be edited after match is LIVE. Only status update is allowed.', 409);
    }

    const nextTeam1Players = dto.team1Players ?? match.team1Players;
    const nextTeam2Players = dto.team2Players ?? match.team2Players;
    assertUniqueSquadPlayerIds(nextTeam1Players, nextTeam2Players);

    // Status transition guard
    if (dto.status && dto.status !== match.status) {
      const allowed = ALLOWED_TRANSITIONS[match.status];
      if (!allowed.includes(dto.status)) {
        throw new AppError(
          `Cannot move from ${match.status} → ${dto.status}. Allowed: ${allowed.join(', ') || 'none'}.`,
          422
        );
      }
    }

    const fields: (keyof UpdateMatchDTO)[] = [
      'team1Name', 'team2Name', 'team1Players', 'team2Players',
      'matchDate', 'venue', 'status',
    ];
    for (const field of fields) {
      if (dto[field] !== undefined) (match as any)[field] = dto[field];
    }

    await match.save();

    // When match goes LIVE, lock all join windows for this match.
    if (previousStatus !== MatchStatus.LIVE && match.status === MatchStatus.LIVE) {
      await Contest.updateMany(
        {
          matchId: matchId,
          status: { $in: [ContestStatus.OPEN, ContestStatus.FULL] },
        },
        {
          $set: {
            status: ContestStatus.CLOSED,
            closedAt: new Date(),
          },
        }
      );

      // Also lock team editing for this match.
      await Team.updateMany(
        { matchId: new Types.ObjectId(matchId), isLocked: false },
        { $set: { isLocked: true } }
      );
    }

    // When match is marked COMPLETED, auto-finalize scores/contests/payouts.
    if (dto.status === MatchStatus.COMPLETED) {
      const { default: scoreService } = await import('../scores/score.service');
      await scoreService.confirmMatchScores(matchId);
    }

    return toMatchPublic(match);
  }

  // ── Public: List Matches ──────────────────────────────────────────────────
  async listMatches(params: MatchQueryParams): Promise<PaginatedMatches> {
    const page  = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (params.status) filter['status'] = params.status;

    const [matches, total] = await Promise.all([
      Match.find(filter).sort({ matchDate: -1 }).skip(skip).limit(limit),
      Match.countDocuments(filter),
    ]);

    return {
      matches: matches.map(toMatchPublic),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Public: Get Match By ID ───────────────────────────────────────────────
  async getMatchById(matchId: string): Promise<MatchPublic> {
    const match = await Match.findById(matchId);
    if (!match) throw new AppError('Match not found.', 404);
    return toMatchPublic(match);
  }

  // ── Public: Get Live Matches ──────────────────────────────────────────────
  async getLiveMatches(): Promise<MatchPublic[]> {
    const matches = await Match.findLive();
    return matches.map(toMatchPublic);
  }
}

export default new MatchService();
