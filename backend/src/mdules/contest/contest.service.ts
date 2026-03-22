import mongoose, { ClientSession, Types } from "mongoose";
import { calcFinancials, Contest, ContestEntry, IContest } from "./contest.model";
import { ContestPublic, ContestQueryParams, ContestStatus, ContestType, CreateContestDTO, JoinedContestPublic, PaginatedContests, PLATFORM_FEE_PERCENT, PrizeDistributionInput, PrizeDistributionResult, UpdateContestDTO } from "./contest.types";
import AppError from "../../utils/AppError";
import { MatchStatus } from "../match/match.types";


// ── Shape Mappers ─────────────────────────────────────────────────────────────

type ContestDocLike = Pick<
  IContest,
  | 'matchId'
  | 'name'
  | 'contestType'
  | 'entryFee'
  | 'prizePool'
  | 'platformFee'
  | 'totalCollection'
  | 'totalSpots'
  | 'filledSpots'
  | 'maxEntriesPerUser'
  | 'isGuaranteed'
  | 'status'
  | 'description'
  | 'closedAt'
  | 'completedAt'
  | 'cancelledAt'
  | 'cancelReason'
  | 'createdAt'
  | 'updatedAt'
> & {
  _id: Types.ObjectId | string;
  match?: any;
};

const CONTEST_PUBLIC_PROJECTION =
  'matchId name contestType entryFee prizePool platformFee totalCollection totalSpots filledSpots maxEntriesPerUser isGuaranteed status description closedAt completedAt cancelledAt cancelReason createdAt updatedAt';

const MATCH_LISTING_PROJECTION =
  'team1Name team2Name team1Players team2Players matchDate venue status createdAt updatedAt';

const JOINED_ENTRY_PROJECTION =
  'contestId teamId joinedAt livePoints liveRank finalPoints finalRank';

const JOINED_TEAM_PROJECTION =
  'contestId matchId userId teamName players captainId viceCaptainId isLocked createdAt updatedAt';

const toContestPublic = (doc: ContestDocLike): ContestPublic => ({
  id: doc._id.toString(),
  matchId: doc.matchId,
  match: (doc as any).match,
  name: doc.name,
  contestType: doc.contestType,

  // Financial
  entryFee: doc.entryFee,
  prizePool: doc.prizePool,
  platformFee: doc.platformFee,
  platformFeePercent: PLATFORM_FEE_PERCENT,
  totalCollection: doc.totalCollection,
  totalSpots: doc.totalSpots,
  filledSpots: doc.filledSpots,
  availableSpots: Math.max(0, doc.totalSpots - doc.filledSpots),
  fillPercentage: doc.totalSpots > 0
    ? Math.min(100, Math.round((doc.filledSpots / doc.totalSpots) * 100))
    : 0,

  maxEntriesPerUser: doc.maxEntriesPerUser,
  isGuaranteed: doc.isGuaranteed,
  status: doc.status,
  description: doc.description,

  closedAt: doc.closedAt ?? null,
  completedAt: doc.completedAt ?? null,
  cancelledAt: doc.cancelledAt ?? null,
  cancelReason: doc.cancelReason ?? null,

  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
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

// ── Status Transition Table ───────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<ContestStatus, ContestStatus[]> = {
  [ContestStatus.DRAFT]:     [ContestStatus.OPEN, ContestStatus.CANCELLED],
  [ContestStatus.OPEN]:      [ContestStatus.CLOSED, ContestStatus.CANCELLED, ContestStatus.DRAFT],
  [ContestStatus.FULL]:      [ContestStatus.CLOSED, ContestStatus.CANCELLED],
  [ContestStatus.CLOSED]:    [ContestStatus.COMPLETED, ContestStatus.CANCELLED],
  [ContestStatus.COMPLETED]: [],
  [ContestStatus.CANCELLED]: [],
};

const TOP_PRIZE_PERCENTAGES = [0.22, 0.12, 0.08]; // rank 1..3

const round2 = (n: number): number => Math.round(n * 100) / 100;


// ═════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═════════════════════════════════════════════════════════════════════════════

export class ContestService {

  generatePrizeDistribution(input: PrizeDistributionInput): PrizeDistributionResult {
    const { prizePool, totalPlayers, winnerPercentage } = input;

    if (!Number.isFinite(prizePool) || prizePool <= 0) {
      throw new AppError('prizePool must be greater than 0.', 422);
    }
    if (!Number.isInteger(totalPlayers) || totalPlayers < 1) {
      throw new AppError('totalPlayers must be at least 1.', 422);
    }
    if (!Number.isFinite(winnerPercentage) || winnerPercentage <= 0 || winnerPercentage > 100) {
      throw new AppError('winnerPercentage must be between 1 and 100.', 422);
    }

    // Enforce "at least 25% winners" rule from product requirements.
    const normalizedWinnerPercentage = Math.max(25, winnerPercentage);
    const totalWinners = Math.min(totalPlayers, Math.max(1, Math.ceil((totalPlayers * normalizedWinnerPercentage) / 100)));
    const totalCents = Math.round(prizePool * 100);
    const rankPrizesCents: number[] = new Array(totalWinners).fill(0);

    if (totalWinners === 1) {
      rankPrizesCents[0] = totalCents;
    } else {
      const topSlots = Math.min(3, totalWinners);
      let allocatedTop = 0;

      for (let i = 0; i < topSlots; i++) {
        const cents = Math.round(totalCents * TOP_PRIZE_PERCENTAGES[i]);
        rankPrizesCents[i] = cents;
        allocatedTop += cents;
      }

      let remaining = Math.max(0, totalCents - allocatedTop);
      const remainingWinners = totalWinners - topSlots;

      if (remainingWinners > 0) {
        const weights: number[] = [];
        let weightSum = 0;
        for (let i = 1; i <= remainingWinners; i++) {
          const w = 1 / Math.pow(i, 0.65);
          weights.push(w);
          weightSum += w;
        }

        for (let i = 0; i < remainingWinners; i++) {
          const cents = Math.floor((remaining * weights[i]) / weightSum);
          rankPrizesCents[topSlots + i] = cents;
        }

        let distributed = rankPrizesCents.slice(topSlots).reduce((a, b) => a + b, 0);
        let leftover = remaining - distributed;
        let idx = topSlots;

        while (leftover > 0) {
          rankPrizesCents[idx] += 1;
          leftover -= 1;
          idx += 1;
          if (idx >= totalWinners) idx = topSlots;
        }
      }
    }

    const rankPrizes = rankPrizesCents.map((c) => round2(c / 100));

    // Collapse contiguous same-prize ranks into table rows.
    const distribution: PrizeDistributionResult["distribution"] = [];
    let startRank = 1;
    let currentAmount = rankPrizes[0];

    for (let i = 2; i <= rankPrizes.length + 1; i++) {
      const amount = i <= rankPrizes.length ? rankPrizes[i - 1] : Number.NaN;
      if (amount !== currentAmount) {
        const endRank = i - 1;
        const winnersCount = endRank - startRank + 1;
        distribution.push({
          fromRank: startRank,
          toRank: endRank,
          winnersCount,
          amountPerRank: currentAmount,
          totalAmount: round2(currentAmount * winnersCount),
        });
        startRank = i;
        currentAmount = amount;
      }
    }

    return {
      prizePool: round2(prizePool),
      totalPlayers,
      winnerPercentage: round2(winnerPercentage),
      normalizedWinnerPercentage: round2(normalizedWinnerPercentage),
      totalWinners,
      distribution,
      rankPrizes,
    };
  }

  getPotentialEarningByRank(input: PrizeDistributionInput, rank: number): number {
    if (!Number.isInteger(rank) || rank < 1) return 0;
    const result = this.generatePrizeDistribution(input);
    if (rank > result.rankPrizes.length) return 0;
    return result.rankPrizes[rank - 1];
  }

  private netPrizePoolFromCollection(grossCollection: number): {
    grossCollection: number;
    platformFee: number;
    distributablePrizePool: number;
  } {
    const gross = round2(grossCollection);
    const platformFee = round2((gross * PLATFORM_FEE_PERCENT) / 100);
    const distributablePrizePool = round2(Math.max(0, gross - platformFee));
    return { grossCollection: gross, platformFee, distributablePrizePool };
  }

  generateFreeContestDistribution(prizePool: number, totalPlayers: number): PrizeDistributionResult {
    if (!Number.isFinite(prizePool) || prizePool <= 0) {
      throw new AppError('prizePool must be greater than 0.', 422);
    }
    if (!Number.isInteger(totalPlayers) || totalPlayers < 1) {
      throw new AppError('totalPlayers must be at least 1.', 422);
    }

    const rankPrizesCents: number[] = new Array(totalPlayers).fill(0);

    const totalCents = Math.round(prizePool * 100);
    const totalWinners = Math.max(1, Math.ceil(totalPlayers * 0.1));
    // Top 10% winners by rank, with payout capped at ₹100 each.
    const payoutCents = Math.min(10000, Math.floor(totalCents / totalWinners));
    for (let i = 0; i < totalWinners; i++) rankPrizesCents[i] = payoutCents;

    const rankPrizes = rankPrizesCents.map((c) => round2(c / 100));

    const distribution: PrizeDistributionResult["distribution"] = [];
    let startRank = 1;
    let currentAmount = rankPrizes[0];

    for (let i = 2; i <= rankPrizes.length + 1; i++) {
      const amount = i <= rankPrizes.length ? rankPrizes[i - 1] : Number.NaN;
      if (amount !== currentAmount) {
        const endRank = i - 1;
        const winnersCount = endRank - startRank + 1;
        distribution.push({
          fromRank: startRank,
          toRank: endRank,
          winnersCount,
          amountPerRank: currentAmount,
          totalAmount: round2(currentAmount * winnersCount),
        });
        startRank = i;
        currentAmount = amount;
      }
    }

    return {
      prizePool: round2(prizePool),
      totalPlayers,
      winnerPercentage: 10,
      normalizedWinnerPercentage: 10,
      totalWinners,
      distribution,
      rankPrizes,
    };
  }

  // ── ADMIN: Create Contest ──────────────────────────────────────────────────
  /**
   * Admin provides: matchId, name, contestType, entryFee, prizePool.
   *
   * Auto-calculated and stored:
   *   platformFee    = prizePool × 20%
   *   totalCollection = prizePool + platformFee
   *   totalSpots     = floor(totalCollection / entryFee)
   *
   * Example: prizePool=30000, entryFee=50
   *   platformFee = 6000, totalCollection = 36000, totalSpots = 720
   *
   * Default status is DRAFT — admin must explicitly set OPEN to make it visible.
   */
  async createContest(dto: CreateContestDTO): Promise<ContestPublic> {
    if(dto.contestType === ContestType.FREE_LEAGUE && dto.entryFee !== 0) {
      throw new AppError('FREE_LEAGUE contest must have entryFee = 0.', 422);
    }
    if(dto.contestType !== ContestType.FREE_LEAGUE && dto.entryFee <= 0){
      throw new AppError('Paid contests must have entryFee greater than 0.', 422);
    }

    // Pre-validate that the calculated totalSpots would be ≥ 2
    const { totalSpots } =
      calcFinancials(dto.prizePool, dto.entryFee);

    if (dto.contestType !== ContestType.FREE_LEAGUE && totalSpots < 2) {
      throw new AppError(
        `With prizePool ₹${dto.prizePool} and entryFee ₹${dto.entryFee}, ` +
        `totalSpots would be ${totalSpots}. ` +
        `Contest needs at least 2 spots. Increase prizePool or decrease entryFee.`,
        422
      );
    }
    // Fetch match for auto-name and verification
    const { Match } = await import('../match/match.model');
    const match = await Match.findById(dto.matchId);
    if (!match) throw new AppError('Match not found.', 404);

    const contestName = dto.name || `${match.team1Name} vs ${match.team2Name}`;

    const contest = await Contest.create({
      matchId: dto.matchId,
      name: contestName,
      contestType: dto.contestType,
      entryFee: dto.entryFee,
      prizePool: dto.prizePool,
      // platformFee, totalCollection, totalSpots written by pre-save hook
      maxEntriesPerUser: dto.maxEntriesPerUser ?? 1,
      isGuaranteed: dto.isGuaranteed ?? false,
      description: dto.description,
      status: dto.status ?? ContestStatus.DRAFT,
      closedAt: dto.closedAt ?? null,
      completedAt: dto.completedAt ?? null,
    });

    return toContestPublic(contest);
  };


  // ── ADMIN: Update Contest ──────────────────────────────────────────────────
  /**
   * Admin can update any non-terminal contest.
   *
   * If prizePool or entryFee changes, totalSpots is recalculated automatically
   * by the model's pre-save hook.
   *
   * Guards:
   *   • entryFee  — only changeable before anyone has joined (filledSpots === 0)
   *   • status    — must follow ALLOWED_TRANSITIONS table
   *   • CANCELLED — triggers atomic batch refund
  */

  async updateContest(contestId: string, dto: UpdateContestDTO,): Promise<ContestPublic> {
    const contest = await Contest.findById(contestId);
    if (!contest) throw new AppError('Contest not found.', 404);

    if ( contest.status === ContestStatus.COMPLETED || contest.status === ContestStatus.CANCELLED ) {
      throw new AppError(`Contest is ${contest.status.toLowerCase()} and cannot be modified.`,409);
    };

    // Status transition validation
    if (dto.status && dto.status !== contest.status){
      const allowed = ALLOWED_TRANSITIONS[contest.status];
      if (!allowed.includes(dto.status)) {
        throw new AppError(`Cannot move from ${contest.status} → ${dto.status}. ` +`Allowed: ${allowed.join(', ') || 'none'}.`, 422);
      }
    }

    // Completing a contest must finalize scores and trigger winnings payout.
    // This path is idempotent at wallet layer (WIN:<contestId>:<teamId>:<userId>).
    if (dto.status === ContestStatus.COMPLETED) {
      const { default: scoreService } = await import('../scores/score.service');
      await scoreService.confirmMatchScores(String(contest.matchId));

      const refreshed = await Contest.findById(contestId);
      if (!refreshed) throw new AppError('Contest not found after completion.', 404);
      return toContestPublic(refreshed);
    }

    // Cancelling a contest must atomically refund all paid entries.
    if (dto.status === ContestStatus.CANCELLED) {
      const { default: walletService } = await import('../wallet/wallet.service');

      return withTransaction(async (session) => {
        const contestInTxn = await Contest.findOne({
          _id: new Types.ObjectId(contestId),
          status: contest.status,
        }).session(session);

        if (!contestInTxn) {
          throw new AppError('Contest was updated by another admin. Refresh and retry.', 409);
        }

        const entries = await ContestEntry.find({ contestId: new Types.ObjectId(contestId) })
          .select('_id userId teamId entryFee')
          .session(session)
          .lean();

        for (const entry of entries as Array<{ _id: Types.ObjectId; userId: Types.ObjectId; teamId: Types.ObjectId; entryFee: number }>) {
          if (!Number.isFinite(entry.entryFee) || entry.entryFee <= 0) continue;
          await walletService.creditContestCancellationRefund(
            entry.userId.toString(),
            contestId,
            entry._id.toString(),
            entry.teamId.toString(),
            entry.entryFee,
            session
          );
        }

        contestInTxn.status = ContestStatus.CANCELLED;
        contestInTxn.cancelledAt = new Date();
        if (dto.cancelReason !== undefined) {
          contestInTxn.cancelReason = dto.cancelReason || null;
        }

        await contestInTxn.save({ session });
        return toContestPublic(contestInTxn);
      });
    }

    if(dto.entryFee !== undefined) {
      if(contest.contestType === ContestType.FREE_LEAGUE && dto.entryFee !== 0) {
        throw new AppError('FREE_LEAGUE contest must keep entryFee = 0.', 422);
      }
      if (contest.contestType !== ContestType.FREE_LEAGUE && dto.entryFee <= 0) {
        throw new AppError('Paid contests must keep entryFee greater than 0.', 422);
      }
    }

    // Build the update — pre-save hook recalculates financials if needed
    const updateFields: Partial<IContest> = {};
    if (dto.name              !== undefined) updateFields.name              = dto.name;
    if (dto.description       !== undefined) updateFields.description       = dto.description;
    if (dto.entryFee          !== undefined) updateFields.entryFee          = dto.entryFee;
    if (dto.prizePool         !== undefined) updateFields.prizePool         = dto.prizePool;
    if (dto.maxEntriesPerUser !== undefined) updateFields.maxEntriesPerUser = dto.maxEntriesPerUser;
    if (dto.isGuaranteed      !== undefined) updateFields.isGuaranteed      = dto.isGuaranteed;
    if (dto.status            !== undefined) updateFields.status            = dto.status;
    if (dto.closedAt          !== undefined) updateFields.closedAt          = dto.closedAt;
    if (dto.completedAt       !== undefined) updateFields.completedAt       = dto.completedAt;

    // Auto-stamp lifecycle timestamps on status change
    if (dto.status === ContestStatus.CLOSED    && !dto.closedAt)    updateFields.closedAt    = new Date();

    if (Object.keys(updateFields).length === 0) {
      throw new AppError('No valid update fields provided.', 400);
    }

    // Use save() not findByIdAndUpdate so the pre-save hook recalculates financials
    Object.assign(contest, updateFields);
    await contest.save();

    return toContestPublic(contest);
  };


  // ── User: List Contests ────────────────────────────────────────────────────

  async listContests(params: ContestQueryParams): Promise<PaginatedContests> {
    const page  = Math.max(1, params.page  ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      status: { $nin: [ContestStatus.DRAFT, ContestStatus.CANCELLED] },
    };
    if (params.matchId)     filter['matchId']     = params.matchId;
    if (params.status)      filter['status']      = params.status;
    if (params.contestType) filter['contestType'] = params.contestType;

    const [contests, total] = await Promise.all([
      Contest.find(filter)
        .select(CONTEST_PUBLIC_PROJECTION)
        .sort({ entryFee: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Contest.countDocuments(filter),
    ]);

    // Fetch matches for these contests
    const matchIds = [...new Set((contests as ContestDocLike[]).map((c) => c.matchId))];
    const validMatchIds = matchIds.filter((id) => Types.ObjectId.isValid(id));
    
    const { Match } = await import('../match/match.model');
    const matches = await Match.find({ _id: { $in: validMatchIds } })
      .select(MATCH_LISTING_PROJECTION)
      .lean();
    const matchMap = new Map(matches.map((m: any) => [m._id.toString(), m]));

    // Attach match objects
    const populatedContests = (contests as ContestDocLike[]).map((c: any) => {
      const matchDoc = matchMap.get(c.matchId);
      if (matchDoc) {
        c.match = { ...matchDoc, id: matchDoc._id.toString() };
      }
      return c;
    });

    return { contests: populatedContests.map((c) => toContestPublic(c as ContestDocLike)), total, page, limit,
             totalPages: Math.ceil(total / limit) };
  }

  async getContestById(contestId: string): Promise<ContestPublic> {
    const contest = await Contest.findById(contestId).select(CONTEST_PUBLIC_PROJECTION).lean();
    if (!contest) throw new AppError('Contest not found.', 404);
    return toContestPublic(contest as ContestDocLike);
  }

  async getContestPrizeDistribution(contestId: string, winnerPercentage = 25): Promise<PrizeDistributionResult> {
    const contest = await Contest.findById(contestId).select('entryFee contestType prizePool').lean();
    if (!contest) throw new AppError('Contest not found.', 404);

    const totalPlayers = await ContestEntry.countDocuments({ contestId: new Types.ObjectId(contestId) });
    if (totalPlayers < 1) {
      return {
        prizePool: 0,
        grossCollection: 0,
        platformFeePercent: PLATFORM_FEE_PERCENT,
        platformFee: 0,
        totalPlayers: 0,
        winnerPercentage: round2(winnerPercentage),
        normalizedWinnerPercentage: round2(Math.max(25, winnerPercentage)),
        totalWinners: 0,
        distribution: [],
        rankPrizes: [],
      };
    }

    if (contest.contestType === ContestType.FREE_LEAGUE) {
      const result = this.generateFreeContestDistribution(contest.prizePool, totalPlayers);
      return {
        ...result,
        grossCollection: 0,
        platformFeePercent: 0,
        platformFee: 0,
      };
    }

    if (!Number.isFinite(contest.entryFee) || contest.entryFee <= 0) {
      throw new AppError('Invalid contest entryFee for prize distribution.', 500);
    }

    const grossCollection = contest.entryFee * totalPlayers;
    const { distributablePrizePool, platformFee } = this.netPrizePoolFromCollection(grossCollection);
    const result = this.generatePrizeDistribution({
      prizePool: distributablePrizePool,
      totalPlayers,
      winnerPercentage,
    });

    return {
      ...result,
      grossCollection: round2(grossCollection),
      platformFeePercent: PLATFORM_FEE_PERCENT,
      platformFee,
    };
  }

  async getMyJoinedContests(userId: string): Promise<JoinedContestPublic[]> {
    const entries = await ContestEntry.find({ userId: new Types.ObjectId(userId) })
      .select(JOINED_ENTRY_PROJECTION)
      .populate({ path: 'contestId', select: CONTEST_PUBLIC_PROJECTION, options: { lean: true } })
      .populate({ path: 'teamId', select: JOINED_TEAM_PROJECTION, options: { lean: true } })
      .sort({ joinedAt: -1 })
      .lean();

    const rows = (entries as any[]).filter((e) => {
      const contest = e?.contestId;
      const team = e?.teamId;
      return contest && typeof contest === 'object' && team && typeof team === 'object';
    });
    if (!rows.length) return [];

    const matchIds = [...new Set(rows.map((e: any) => String(e.contestId.matchId)))];
    const validMatchIds = matchIds.filter((id: string) => Types.ObjectId.isValid(id));
    const { Match } = await import('../match/match.model');
    const matches = await Match.find({ _id: { $in: validMatchIds } })
      .select(MATCH_LISTING_PROJECTION)
      .lean();
    const matchMap = new Map(matches.map((m: any) => [m._id.toString(), m]));

    return rows.map((entry: any) => {
      const contest = entry.contestId as ContestDocLike;
      const team = entry.teamId as any;
      const match = matchMap.get(contest.matchId);
      const contestPublic = toContestPublic(contest);

      return {
        entryId: entry._id.toString(),
        joinedAt: entry.joinedAt,
        livePoints: entry.livePoints ?? 0,
        liveRank: entry.liveRank ?? 0,
        finalPoints: entry.finalPoints ?? 0,
        finalRank: entry.finalRank ?? 0,
        contest: contestPublic,
        team: {
          id: team._id?.toString() ?? team.id,
          contestId: team.contestId?.toString(),
          matchId: team.matchId?.toString(),
          userId: team.userId?.toString(),
          teamName: team.teamName,
          players: team.players ?? [],
          captainId: team.captainId ?? null,
          viceCaptainId: team.viceCaptainId ?? null,
          isLocked: team.isLocked ?? false,
          createdAt: team.createdAt,
          updatedAt: team.updatedAt,
        },
        match: match ? { ...match, id: match._id.toString() } : undefined,
      };
    });
  }


  // ── User: Join Contest ────────────────────────────────────────────────────
  async joinContest(userId: string, contestId: string, teamId: string) {
    const { Team } = await import('../team/team.model');
    const { ContestEntry } = await import('./contest.model');
    const { default: walletService } = await import('../wallet/wallet.service');

    return withTransaction(async (session) => {
      const contestObjectId = new Types.ObjectId(contestId);
      const userObjectId = new Types.ObjectId(userId);
      const teamObjectId = new Types.ObjectId(teamId);

      const contest = await Contest.findById(contestId).session(session);
      if (!contest) throw new AppError('Contest not found.', 404);
      if (contest.status !== ContestStatus.OPEN)
        throw new AppError('Contest is not open for joining.', 409);
      if (contest.filledSpots >= contest.totalSpots)
        throw new AppError('Contest is full.', 409);

      const { Match } = await import('../match/match.model');
      const match = await Match.findById(contest.matchId).session(session);
      if (!match) throw new AppError('Match not found for this contest.', 404);
      if (match.status !== MatchStatus.UPCOMING) {
        throw new AppError('Contest is locked because match is no longer UPCOMING.', 409);
      }

      const team = await Team.findById(teamId).session(session);
      if (!team) throw new AppError('Team not found.', 404);
      if (team.userId.toString() !== userId)
        throw new AppError('Team does not belong to you.', 403);
      if (team.contestId.toString() !== contestId)
        throw new AppError('This team belongs to a different contest.', 409);


      const [existingTeamEntry, userEntryCount] = await Promise.all([
        ContestEntry.findOne({
          contestId: contestObjectId,
          userId: userObjectId,
          teamId: teamObjectId,
        }).session(session),
        ContestEntry.countDocuments({
          contestId: contestObjectId,
          userId: userObjectId,
        }).session(session),
      ]);

      if (existingTeamEntry) {
        throw new AppError('You already joined this contest with this team.', 409);
      }

      if (userEntryCount >= contest.maxEntriesPerUser) {
        throw new AppError(
          `Entry limit reached. You can join this contest with at most ${contest.maxEntriesPerUser} team(s).`,
          409
        );
      }

      let newBalance: number | undefined = undefined;
      if(contest.contestType !== ContestType.FREE_LEAGUE) {
        // Deduct entry fee using proper Wallet Service to create transaction logs
        const walletResult = await walletService.deductForContest(
          userId,
          contestId,
          teamId,
          contest.entryFee,
          session
        );
        newBalance = walletResult.currentBalance;
      }


      // Increment filledSpots; flip to FULL if all spots taken
      const newFilled = contest.filledSpots + 1;
      const newStatus = newFilled >= contest.totalSpots
        ? ContestStatus.FULL : ContestStatus.OPEN;
      await Contest.findByIdAndUpdate(contestId, {
        $inc: { filledSpots: 1 },
        $set: { status: newStatus },
      }, { session });

      // CREATE ContestEntry to track user participation for leaderboard
      await ContestEntry.create(
        [{
          contestId: contestObjectId,
          userId: userObjectId,
          teamId: teamObjectId,
          entryFee: contest.entryFee,
          livePoints: 0,
          liveRank: 0,
          finalPoints: 0,
          finalRank: 0,
          joinedAt: new Date(),
        }],
        { session }
      );

      return {
        message: contest.contestType === ContestType.FREE_LEAGUE ? 'Successfully joined the free contest!' : 'Successfully joined the contest!',
        entryFee: contest.entryFee,
        newBalance
      };
    });
  }

};

export default new ContestService();
