// ── Enums ─────────────────────────────────────────────────────────────────────

export enum ContestStatus {
  DRAFT     = 'DRAFT',     // created but not visible to users yet
  OPEN      = 'OPEN',      // accepting entries
  FULL      = 'FULL',      // all spots taken, no more entries
  CLOSED    = 'CLOSED',    // entry window closed, match in progress
  COMPLETED = 'COMPLETED', // match over, results declared
  CANCELLED = 'CANCELLED', // admin cancelled — all entry fees refunded
}

export enum ContestType {
  HEAD_TO_HEAD = 'HEAD_TO_HEAD', // 2 players
  SMALL_LEAGUE = 'SMALL_LEAGUE', // 3–10 players
  MEGA_LEAGUE  = 'MEGA_LEAGUE',  // 11+ players
  FREE_LEAGUE = 'FREE_LEAGUE'
}


// ── Platform Fee Config ───────────────────────────────────────────────────────
// Exported so service and model share the same constant
export const PLATFORM_FEE_PERCENT = 20; // 20% of gross entry collection is kept by platform

// ── Request DTOs (admin only) ─────────────────────────────────────────────────

export interface CreateContestDTO {
  matchId: string;
  name?: string;
  contestType: ContestType;
  entryFee: number;             // rupees per entry — admin sets this
  prizePool: number;            // net prize pool to distribute — admin sets this
  // totalSpots is NOT in the DTO — it is auto-calculated from prizePool + entryFee
  maxEntriesPerUser?: number;   // default 1
  isGuaranteed?: boolean;       // true = contest runs even if not full
  description?: string;
  status?: ContestStatus.DRAFT | ContestStatus.OPEN;
  closedAt?: Date;              // optional scheduled close time
  completedAt?: Date;           // optional scheduled completion time
}

export interface UpdateContestDTO {
  name?: string;
  description?: string;
  prizePool?: number;           // recalculates totalSpots automatically
  entryFee?: number;            // only allowed before anyone joins
  maxEntriesPerUser?: number;
  isGuaranteed?: boolean;
  status?: ContestStatus;
  closedAt?: Date;
  completedAt?: Date;
  cancelReason?: string;
}

export interface JoinContestDTO {
  contestId: string;
  teamId?: string;
}

export interface ContestQueryParams {
  matchId?: string;
  status?: ContestStatus;
  contestType?: ContestType;
  page?: number;
  limit?: number;
}

// ── Computed fields (returned in responses, not stored) ───────────────────────

export interface ContestFinancials {
  prizePool: number;       // net prize pool (what players win)
  platformFee: number;     // platform's cut = prizePool × PLATFORM_FEE_PERCENT%
  totalCollection: number; // gross = prizePool + platformFee = totalSpots × entryFee
  totalSpots: number;      // auto-calculated: floor(totalCollection / entryFee)
  platformFeePercent: number;
}

// ── Response Shapes ───────────────────────────────────────────────────────────

export interface ContestPublic {
  id: string;
  matchId: string;
  match?: any;
  name: string;
  contestType: ContestType;

  // Financial
  entryFee: number;
  prizePool: number;
  platformFee: number;
  platformFeePercent: number;
  totalCollection: number;
  totalSpots: number;         // auto-calculated — never set manually
  filledSpots: number;
  availableSpots: number;
  fillPercentage: number;

  maxEntriesPerUser: number;
  isGuaranteed: boolean;
  status: ContestStatus;
  description?: string;

  // Lifecycle timestamps
  closedAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  cancelReason?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedContests {
  contests: ContestPublic[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface JoinedContestPublic {
  entryId: string;
  joinedAt: Date;
  livePoints: number;
  liveRank: number;
  finalPoints: number;
  finalRank: number;
  contest: ContestPublic;
  team: any;
  match?: any;
}

export interface PrizeDistributionInput {
  prizePool: number;
  totalPlayers: number;
  winnerPercentage: number;
}

export interface PrizeDistributionRow {
  fromRank: number;
  toRank: number;
  winnersCount: number;
  amountPerRank: number;
  totalAmount: number;
}

export interface PrizeDistributionResult {
  prizePool: number;
  grossCollection?: number;
  platformFeePercent?: number;
  platformFee?: number;
  totalPlayers: number;
  winnerPercentage: number;
  normalizedWinnerPercentage: number;
  totalWinners: number;
  distribution: PrizeDistributionRow[];
  rankPrizes: number[];
}
