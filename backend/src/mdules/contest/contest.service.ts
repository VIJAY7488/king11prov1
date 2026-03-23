import mongoose, { ClientSession, Types } from "mongoose";
import { calcFinancials, Contest, ContestEntry, IContest } from "./contest.model";
import { ContestPublic, ContestQueryParams, ContestStatus, ContestType, CreateContestDTO, getEffectivePlatformFeePercent, JoinedContestPublic, PaginatedContests, PrizeDistributionInput, PrizeDistributionResult, UpdateContestDTO } from "./contest.types";
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
  platformFeePercent: getEffectivePlatformFeePercent(doc.contestType, doc.isGuaranteed),
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

  private netPrizePoolFromCollection(
    grossCollection: number,
    contestType: ContestType,
    isGuaranteed = false
  ): {
    grossCollection: number;
    platformFee: number;
    distributablePrizePool: number;
    platformFeePercent: number;
  } {
    const platformFeePercent = getEffectivePlatformFeePercent(contestType, isGuaranteed);
    const gross = round2(grossCollection);
    const platformFee = round2((gross * platformFeePercent) / 100);
    const distributablePrizePool = round2(Math.max(0, gross - platformFee));
    return { grossCollection: gross, platformFee, distributablePrizePool, platformFeePercent };
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

  generateGuaranteedLadderDistribution(prizePool: number, totalPlayers: number): PrizeDistributionResult {
    if (!Number.isFinite(prizePool) || prizePool <= 0) {
      throw new AppError('prizePool must be greater than 0.', 422);
    }
    if (!Number.isInteger(totalPlayers) || totalPlayers < 1) {
      throw new AppError('totalPlayers must be at least 1.', 422);
    }

    const totalCents = Math.round(prizePool * 100);
    const totalWinners = Math.max(1, Math.ceil(totalPlayers * 0.5));
    if (totalCents < totalWinners) {
      throw new AppError('Prize pool is too small to reward top 50% participants with minimum ₹0.01 each.', 422);
    }

    // Final tuned guaranteed ladder split (sum = 100):
    // 1:8%, 2:5.6%, 3:3.5%, 4-6:4.5%, 7-16:14.5%, 17-46:37%, 47-129:24.4%, last tier:2.5%
    const tierShares = [8, 5.6, 3.5, 4.5, 14.5, 37, 24.4, 2.5];
    const tierCounts: number[] = [];

    tierCounts.push(1); // rank 1
    if (totalWinners > 1) tierCounts.push(1); // rank 2
    if (totalWinners > 2) tierCounts.push(1); // rank 3

    let assigned = tierCounts.reduce((a, b) => a + b, 0);
    let remaining = totalWinners - assigned;

    if (remaining > 0) {
      const tier4 = Math.min(remaining, Math.max(1, Math.round(totalWinners * 0.01)));
      tierCounts.push(tier4);
      assigned += tier4;
      remaining = totalWinners - assigned;
    }
    if (remaining > 0) {
      const tier5 = Math.min(remaining, Math.max(1, Math.round(totalWinners * 0.04)));
      tierCounts.push(tier5);
      assigned += tier5;
      remaining = totalWinners - assigned;
    }
    if (remaining > 0) {
      const tier6 = Math.min(remaining, Math.max(1, Math.round(totalWinners * 0.12)));
      tierCounts.push(tier6);
      assigned += tier6;
      remaining = totalWinners - assigned;
    }
    if (remaining > 0) {
      const tier7 = Math.min(remaining, Math.max(1, Math.round(totalWinners * 0.33)));
      tierCounts.push(tier7);
      assigned += tier7;
      remaining = totalWinners - assigned;
    }
    if (remaining > 0) {
      tierCounts.push(remaining); // bottom tier
      assigned += remaining;
    }

    if (assigned !== totalWinners) {
      tierCounts[tierCounts.length - 1] += totalWinners - assigned;
    }

    // Keep only shares for active tiers and normalize to 100.
    const activeShares = tierShares.slice(0, tierCounts.length);
    const activeShareSum = activeShares.reduce((a, b) => a + b, 0);
    const normalizedShares = activeShares.map((s) => (s * 100) / activeShareSum);

    const tierTargetCents = normalizedShares.map((share) => Math.floor((totalCents * share) / 100));
    const tierPerUserCents = tierTargetCents.map((tierCents, idx) => {
      const count = tierCounts[idx] ?? 1;
      return Math.max(1, Math.floor(tierCents / count));
    });

    // Keep tier-wise structure, but ensure rank-order sanity:
    // later tiers cannot pay more per-user than earlier tiers.
    const redistributeExcessToTopTiers = (excessCents: number, uptoTierIndex: number): void => {
      let remaining = excessCents;
      if (remaining <= 0) return;

      // Increase top tiers in 1-paise per-user steps so equality inside each tier is preserved.
      while (remaining > 0) {
        let moved = false;
        for (let t = 0; t <= uptoTierIndex && remaining > 0; t++) {
          const count = tierCounts[t] ?? 1;
          if (count <= remaining) {
            tierPerUserCents[t] = (tierPerUserCents[t] ?? 1) + 1;
            remaining -= count;
            moved = true;
          }
        }
        // Safety: tier 0 always has count=1, but keep a fallback.
        if (!moved) {
          tierPerUserCents[0] = (tierPerUserCents[0] ?? 1) + remaining;
          remaining = 0;
        }
      }
    };

    const enforceMonotonicByTier = (): void => {
      for (let i = 1; i < tierPerUserCents.length; i++) {
        const prevPerUser = tierPerUserCents[i - 1] ?? 1;
        const currPerUser = tierPerUserCents[i] ?? 1;
        if (currPerUser > prevPerUser) {
          const count = tierCounts[i] ?? 1;
          const excess = (currPerUser - prevPerUser) * count;
          tierPerUserCents[i] = prevPerUser;
          redistributeExcessToTopTiers(excess, i - 1);
        }
      }
    };

    enforceMonotonicByTier();

    // Product tweak: reduce rank 1/2/3 by 15% each, move that pool to lower tiers.
    let removedFromTop3 = 0;
    const topTierCount = Math.min(3, tierPerUserCents.length);
    for (let i = 0; i < topTierCount; i++) {
      const current = tierPerUserCents[i] ?? 1;
      const cutPerUser = Math.floor(current * 0.15);
      if (cutPerUser <= 0) continue;
      tierPerUserCents[i] = Math.max(1, current - cutPerUser);
      removedFromTop3 += cutPerUser * (tierCounts[i] ?? 1);
    }

    if (removedFromTop3 > 0) {
      const lowerStart = 3;
      let remaining = removedFromTop3;

      if (tierPerUserCents.length > lowerStart) {
        while (remaining > 0) {
          let moved = false;
          for (let i = lowerStart; i < tierPerUserCents.length && remaining > 0; i++) {
            const count = tierCounts[i] ?? 1;
            if (count > remaining) continue;
            const cap = tierPerUserCents[i - 1] ?? 1; // keep non-increasing order
            const current = tierPerUserCents[i] ?? 1;
            if (current >= cap) continue;
            tierPerUserCents[i] = current + 1;
            remaining -= count;
            moved = true;
          }
          if (!moved) break;
        }
      }

      // Fallback for any tiny leftover that can't be distributed by full tier-step.
      if (remaining > 0) {
        tierPerUserCents[0] = (tierPerUserCents[0] ?? 1) + remaining;
      }
    }

    // Re-check after applying the top-3 discount redistribution.
    enforceMonotonicByTier();

    const tierFinalCents = tierPerUserCents.map((ppu, idx) => ppu * (tierCounts[idx] ?? 1));
    let distributedCents = tierFinalCents.reduce((a, b) => a + b, 0);
    let delta = totalCents - distributedCents;

    // Push any rounding delta to rank 1 (single winner) to keep tiers equal.
    if (delta !== 0 && tierCounts[0] === 1) {
      tierPerUserCents[0] += delta;
      tierFinalCents[0] = tierPerUserCents[0];
      distributedCents = tierFinalCents.reduce((a, b) => a + b, 0);
      delta = totalCents - distributedCents;
    }
    if (delta !== 0) {
      // Final fallback for safety in extremely edge cases.
      tierPerUserCents[0] += delta;
      tierFinalCents[0] = tierPerUserCents[0] * (tierCounts[0] ?? 1);
    }

    const rankPrizesCents: number[] = [];
    const distribution: PrizeDistributionResult["distribution"] = [];
    let currentRank = 1;

    for (let i = 0; i < tierCounts.length; i++) {
      const winnersCount = tierCounts[i] ?? 0;
      if (winnersCount <= 0) continue;

      const perUserCents = tierPerUserCents[i] ?? 1;
      for (let k = 0; k < winnersCount; k++) rankPrizesCents.push(perUserCents);

      const fromRank = currentRank;
      const toRank = currentRank + winnersCount - 1;
      const totalAmount = round2((perUserCents * winnersCount) / 100);
      distribution.push({
        fromRank,
        toRank,
        winnersCount,
        poolPercentage: round2((totalAmount / prizePool) * 100),
        amountPerRank: round2(perUserCents / 100),
        totalAmount,
      });
      currentRank = toRank + 1;
    }

    return {
      prizePool: round2(prizePool),
      totalPlayers,
      winnerPercentage: 50,
      normalizedWinnerPercentage: 50,
      totalWinners,
      distribution,
      rankPrizes: rankPrizesCents.map((c) => round2(c / 100)),
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
      calcFinancials(dto.prizePool, dto.entryFee, dto.contestType, dto.isGuaranteed ?? false);

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

    const enforcedMaxEntriesPerUser = dto.contestType === ContestType.HEAD_TO_HEAD
      ? 1
      : (dto.maxEntriesPerUser ?? 1);

    const contest = await Contest.create({
      matchId: dto.matchId,
      name: contestName,
      contestType: dto.contestType,
      entryFee: dto.entryFee,
      prizePool: dto.prizePool,
      // platformFee, totalCollection, totalSpots written by pre-save hook
      maxEntriesPerUser: enforcedMaxEntriesPerUser,
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

    if (contest.contestType === ContestType.HEAD_TO_HEAD && dto.maxEntriesPerUser !== undefined && dto.maxEntriesPerUser !== 1) {
      throw new AppError('HEAD_TO_HEAD contest maxEntriesPerUser is fixed at 1.', 422);
    }

    // Build the update — pre-save hook recalculates financials if needed
    const updateFields: Partial<IContest> = {};
    if (dto.name              !== undefined) updateFields.name              = dto.name;
    if (dto.description       !== undefined) updateFields.description       = dto.description;
    if (dto.entryFee          !== undefined) updateFields.entryFee          = dto.entryFee;
    if (dto.prizePool         !== undefined) updateFields.prizePool         = dto.prizePool;
    if (contest.contestType !== ContestType.HEAD_TO_HEAD && dto.maxEntriesPerUser !== undefined) {
      updateFields.maxEntriesPerUser = dto.maxEntriesPerUser;
    }
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

  // ── ADMIN: List All Contests (includes DRAFT + CANCELLED) ─────────────────
  async adminListContests(params: ContestQueryParams): Promise<PaginatedContests> {
    const page  = Math.max(1, params.page  ?? 1);
    const limit = Math.min(200, Math.max(1, params.limit ?? 50));
    const skip  = (page - 1) * limit;

    // No status exclusion — admin sees everything
    const filter: Record<string, unknown> = {};
    if (params.matchId)     filter['matchId']     = params.matchId;
    if (params.status)      filter['status']      = params.status;
    if (params.contestType) filter['contestType'] = params.contestType;

    const [contests, total] = await Promise.all([
      Contest.find(filter)
        .select(CONTEST_PUBLIC_PROJECTION)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Contest.countDocuments(filter),
    ]);

    const matchIds = [...new Set((contests as ContestDocLike[]).map((c) => c.matchId))];
    const validMatchIds = matchIds.filter((id) => Types.ObjectId.isValid(id));

    const { Match } = await import('../match/match.model');
    const matches = await Match.find({ _id: { $in: validMatchIds } })
      .select(MATCH_LISTING_PROJECTION)
      .lean();
    const matchMap = new Map(matches.map((m: any) => [m._id.toString(), m]));

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
    const contest = await Contest.findById(contestId).select('entryFee contestType prizePool isGuaranteed totalSpots').lean();
    if (!contest) throw new AppError('Contest not found.', 404);

    const totalPlayers = await ContestEntry.countDocuments({ contestId: new Types.ObjectId(contestId) });
    if (contest.isGuaranteed) {
      const platformFeePercent = 0;
      const assumedPlayers = totalPlayers > 0 ? totalPlayers : Math.max(1, Number(contest.totalSpots ?? 1));
      const fixedPrizePool = round2(Number(contest.prizePool ?? 0));
      const grossCollection = fixedPrizePool;
      const platformFee = 0;

      const result = this.generateGuaranteedLadderDistribution(fixedPrizePool, assumedPlayers);
      return {
        ...result,
        grossCollection,
        platformFeePercent,
        platformFee,
      };
    }

    if (totalPlayers < 1) {
      return {
        prizePool: 0,
        grossCollection: 0,
        platformFeePercent: getEffectivePlatformFeePercent(contest.contestType, false),
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
    const { distributablePrizePool, platformFee, platformFeePercent } = this.netPrizePoolFromCollection(
      grossCollection,
      contest.contestType,
      contest.isGuaranteed
    );
    const result = this.generatePrizeDistribution({
      prizePool: distributablePrizePool,
      totalPlayers,
      winnerPercentage,
    });

    return {
      ...result,
      grossCollection: round2(grossCollection),
      platformFeePercent,
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
