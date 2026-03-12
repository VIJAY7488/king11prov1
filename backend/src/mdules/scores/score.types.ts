// ═════════════════════════════════════════════════════════════════════════════
// ENUMS
// ═════════════════════════════════════════════════════════════════════════════

export enum DismissalType {
  BOWLED       = 'BOWLED',
  CAUGHT       = 'CAUGHT',
  LBW          = 'LBW',
  RUN_OUT      = 'RUN_OUT',
  STUMPED      = 'STUMPED',
  HIT_WICKET   = 'HIT_WICKET',
  RETIRED_HURT = 'RETIRED_HURT',
  NOT_OUT      = 'NOT_OUT',
  DID_NOT_BAT  = 'DID_NOT_BAT',
}

// ═════════════════════════════════════════════════════════════════════════════
// REQUEST DTOs
// ═════════════════════════════════════════════════════════════════════════════

/**
 * BallEventDTO — sent by admin/operator after every single delivery.
 * Drives all incremental stat updates, fantasy-point recalculation,
 * leaderboard re-ranking and WebSocket broadcasts.
 */
export interface BallEventDTO {
  matchId: string;

  // ── Batter ────────────────────────────────────────────────────────────────
  battingPlayerId: string;
  /** Runs scored off the bat on this delivery (0–6). Does NOT include overthrow runs. */
  runs:        number;
  /** True when the delivery is legal AND 0 runs were scored (dot ball). */
  isDotBall:   boolean;
  /**
   * True for a genuine struck boundary.
   * Set to false when the ball reaches the rope via an overthrow — the batter
   * still gets run points but does NOT receive the +4 Boundary Bonus.
   */
  isFour:      boolean;
  isSix:       boolean;
  /** 1 for a legal delivery; 0 for a wide or no-ball (doesn't count toward balls faced). */
  ballsFaced:  number;
  isOut:       boolean;
  /** Required when isOut = true. */
  dismissalType?: DismissalType;

  // ── Bowler ────────────────────────────────────────────────────────────────
  bowlingPlayerId: string;
  /** All runs conceded on this delivery, including extras. */
  runsConceded: number;
  isWide:       boolean;
  isNoBall:     boolean;
  /** True when the over completes with 0 runs — send on ball 6 of the over. */
  isMaiden?:    boolean;

  // ── Fielder (only when a fielding dismissal occurred) ─────────────────────
  fieldingPlayerId?:  string;
  isCatch?:           boolean;
  /** Direct hit — fielder was the only person to touch the ball after delivery. */
  isDirectRunOut?:    boolean;
  /** Non-direct run-out — fielder was one of the last 2 to touch the ball. */
  isIndirectRunOut?:  boolean;
  isStumping?:        boolean;

  // ── Overthrow ─────────────────────────────────────────────────────────────
  /** True when extra runs were scored after the ball deflected off a fielder/stumps. */
  isOverthrow:          boolean;
  /** How many runs came from the overthrow. Required when isOverthrow = true. */
  overthrowRuns?:       number;
  /**
   * True when the overthrow reached the boundary rope.
   * The batter still gets run points for those runs but does NOT receive
   * an extra +4 Boundary Bonus for an overthrow boundary.
   * Required when isOverthrow = true.
   */
  overthrowIsBoundary?: boolean;

  // ── Over meta ─────────────────────────────────────────────────────────────
  /** 0-indexed over number. */
  overNumber: number;
  /** Ball number within the over (1–6). */
  ballNumber: number;
}

/**
 * SetPlayerScoreDTO — admin overrides the full stat-line for one player.
 * Used for corrections or retrospective stat entry.
 * fantasyPoints is always recalculated — never set directly.
 */
export interface SetPlayerScoreDTO {
  matchId:  string;
  playerId: string;

  // Batting
  runs?:          number;
  ballsFaced?:    number;
  fours?:         number;
  sixes?:         number;
  isOut?:         boolean;
  dismissalType?: DismissalType;
  didNotBat?:     boolean;

  // Bowling
  wickets?:        number;
  oversBowled?:    number;
  maidenOvers?:    number;
  runsConceded?:   number;
  dotBalls?:       number;
  lbwBowledCount?: number;

  // Fielding
  catches?:         number;
  directRunOuts?:   number;
  indirectRunOuts?: number;
  stumpings?:       number;

  // Bonus / status
  isPlayerOfMatch?:     boolean;
  /** +4 when admin confirms this player is in the official announced playing XI. */
  isAnnouncedInLineup?: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// RESPONSE SHAPES
// ═════════════════════════════════════════════════════════════════════════════

export interface PlayerScorePublic {
  id:         string;
  matchId:    string;
  playerId:   string;
  playerName: string;
  playerRole: string;
  teamName:   string;
  teamSlot:   'team1' | 'team2';

  // Batting
  runs:          number;
  ballsFaced:    number;
  fours:         number;
  sixes:         number;
  /** Null when ballsFaced < 10 (not meaningful for very short innings). */
  strikeRate:    number | null;
  isOut:         boolean;
  dismissalType: DismissalType;
  didNotBat:     boolean;
  /** Computed: isOut && runs === 0 && not RETIRED_HURT/DID_NOT_BAT. */
  isDuck:        boolean;

  // Bowling
  wickets:        number;
  oversBowled:    number;
  maidenOvers:    number;
  runsConceded:   number;
  dotBalls:       number;
  /** Count of LBW + Bowled wickets — each earns an extra +8 bonus. */
  lbwBowledCount: number;
  /** Null when oversBowled < 2. */
  economy:        number | null;

  // Fielding
  catches:         number;
  directRunOuts:   number;
  indirectRunOuts: number;
  stumpings:       number;

  // Bonus
  isPlayerOfMatch:     boolean;
  isAnnouncedInLineup: boolean;

  // Calculated — always derived, never manually assigned
  fantasyPoints: number;

  // State
  isConfirmed: boolean;
  updatedAt:   Date;
}

export interface ContestLiveEntryPublic {
  rank: number;
  userId: string;
  userName: string;
  teamId: string;
  teamName: string;
  livePoints: number;
  isCurrentUser: boolean;
}

export interface ContestLiveViewPublic {
  contestId: string;
  contestName: string;
  matchId: string;
  matchStatus: string;
  contestStatus: string;
  team1Name: string;
  team2Name: string;
  entries: ContestLiveEntryPublic[];
}

export interface ContestTeamPlayerBreakdown {
  playerId: string;
  playerName: string;
  playerRole: string;
  teamName: string;
  captainRole: string;
  basePoints: number;
  multiplier: number;
  totalPoints: number;
}

export interface ContestTeamBreakdownPublic {
  contestId: string;
  contestName: string;
  teamId: string;
  teamName: string;
  userId: string;
  userName: string;
  liveRank: number;
  livePoints: number;
  players: ContestTeamPlayerBreakdown[];
}

// ═════════════════════════════════════════════════════════════════════════════
// WEBSOCKET PAYLOADS
// ═════════════════════════════════════════════════════════════════════════════

/** Broadcast to all connected clients after every ball is processed. */
export interface WsBallProcessedEvent {
  type:           'BALL_PROCESSED';
  matchId:        string;
  over:           number;
  ball:           number;
  /** Only the 2–3 players affected on this delivery — not all 22. */
  updatedPlayers: PlayerScorePublic[];
  leaderboards:   WsLeaderboardSnapshot[];
  processedAt:    string; // ISO-8601
}

/** Broadcast once when admin confirms all scores are final. */
export interface WsConfirmedEvent {
  type:         'MATCH_CONFIRMED';
  matchId:      string;
  message:      string;
  leaderboards: WsLeaderboardSnapshot[];
}

export interface WsLeaderboardSnapshot {
  contestId:   string;
  contestName: string;
  entries:     WsLeaderboardEntry[];
}

export interface WsLeaderboardEntry {
  rank:        number;
  userId:      string;
  userName:    string;
  teamId:      string;
  livePoints:  number;
  /** Change in livePoints from the previous ball (+/-). */
  pointsDelta: number;
}

// ═════════════════════════════════════════════════════════════════════════════
// SCORING RULES
// Single source of truth for all fantasy-point values.
// Exported so the frontend can render a live points-breakdown to users.
// ═════════════════════════════════════════════════════════════════════════════
//
// BATTING MILESTONES — mutually exclusive, highest tier only:
//   Player scores 112 → gets +16 (century) ONLY. No +4/+8/+12 on top.
//
// OVERTHROW RUNS:
//   Batter gets +1 per run regardless of source.
//   Overthrow boundary → batter gets run points but NO extra +4 Boundary Bonus.
//   Only genuine struck boundaries award +4.
//
// DUCK PENALTY (-2):
//   Applied only to BATSMAN, WICKET_KEEPER, ALL_ROUNDER.
//   BOWLER dismissed for 0 receives no penalty.
//   RETIRED_HURT is not a dismissal — no penalty applies.
//
// BOWLING WICKET (+30):
//   Run-out is a fielding dismissal — bowler gets ZERO wicket credit.
//   Credited dismissals: BOWLED, CAUGHT, LBW, STUMPED, HIT_WICKET.
//
// LBW / BOWLED BONUS (+8):
//   Additional +8 on top of the +30 when dismissal = LBW or BOWLED.
//
// WICKET HAUL BONUS:
//   Only the highest tier awarded. 5 wickets = +12 ONLY (not +4+8+12).
//
// THREE CATCH BONUS (+4):
//   Flat. 3 catches = +4. 6 catches = still only +4. Not cumulative.
//
// ECONOMY RATE (min 2 overs bowled):
//   Dead zone: 7.01–9.99 — no bonus or penalty.
//
// ANNOUNCED LINEUP (+4):
//   Set once per player by admin when the official playing XI is confirmed.

export const SCORING_RULES = {
  // ── Batting ───────────────────────────────────────────────────────────────
  RUN:            1,   // per run (including overthrow runs)
  BOUNDARY_BONUS: 4,   // genuine struck boundary — never an overthrow boundary
  SIX_BONUS:      6,   // per six

  // Milestones — mutually exclusive, highest tier only
  RUN_25_BONUS:   4,
  RUN_50_BONUS:   8,
  RUN_75_BONUS:   12,
  RUN_100_BONUS:  16,  // century: wipes out 25 / 50 / 75 bonuses

  DUCK_PENALTY:  -2,   // BATSMAN, WICKET_KEEPER, ALL_ROUNDER only

  // ── Bowling ───────────────────────────────────────────────────────────────
  WICKET:            30, // per bowling wicket (run-outs NOT included)
  LBW_BOWLED_BONUS:   8, // extra when dismissal = LBW or BOWLED
  DOT_BALL:           1, // per legal delivery on which 0 runs were scored
  MAIDEN_OVER:       12, // per maiden over

  // Wicket haul — highest tier only
  THREE_WICKET_HAUL:  4,
  FOUR_WICKET_HAUL:   8,
  FIVE_WICKET_HAUL:  12,

  // Economy rate (min 2 overs)
  ECO_LTE_5:       6,  // below 5.00
  ECO_5_TO_599:    4,  // 5.00 – 5.99
  ECO_6_TO_7:      2,  // 6.00 – 7.00
  // 7.01 – 9.99 → no change
  ECO_10_TO_11:   -2,  // 10.00 – 11.00
  ECO_1101_TO_12: -4,  // 11.01 – 12.00
  ECO_GT_12:      -6,  // above 12.00

  // ── Fielding ──────────────────────────────────────────────────────────────
  CATCH:              8,
  THREE_CATCH_BONUS:  4,  // flat +4 for 3+ catches — NOT cumulative
  STUMPING:          12,
  DIRECT_RUN_OUT:    12,
  INDIRECT_RUN_OUT:   6,

  // ── Other ─────────────────────────────────────────────────────────────────
  ANNOUNCED_LINEUP:  4,  // in official announced playing XI
  PLAYER_OF_MATCH:  10,

  // ── Multipliers ───────────────────────────────────────────────────────────
  CAPTAIN_MULTIPLIER:       2.0,
  VICE_CAPTAIN_MULTIPLIER:  1.5,
} as const;

// ── Helper sets (used by calculateFantasyPoints + available for unit tests) ──

/** Roles that receive the -2 duck penalty when dismissed for 0. */
export const DUCK_PENALTY_ROLES = new Set<string>([
  'BATSMAN',
  'WICKET_KEEPER',
  'ALL_ROUNDER',
]);

/** Dismissal types for which the BOWLER receives +30 wicket credit. */
export const BOWLING_WICKET_DISMISSALS = new Set<string>([
  'BOWLED',
  'CAUGHT',
  'LBW',
  'STUMPED',
  'HIT_WICKET',
]);

/** Dismissal types that additionally award the bowler the +8 LBW/Bowled bonus. */
export const LBW_BOWLED_DISMISSALS = new Set<string>([
  'LBW',
  'BOWLED',
]);
