import { createHash } from 'crypto';
import { Types } from 'mongoose';
import redisClient                       from '../../config/redis.config';
import { matchChannel }                  from '../../config/websocket';
import { PlayerScore, IPlayerScore }     from './score.model';
import { ContestEntry, Contest }         from '../contest/contest.model';
import { Team }                          from '../team/team.model';
import { Match }                         from '../match/match.model';
import { ContestStatus, ContestType, PLATFORM_FEE_PERCENT } from '../contest/contest.types';
import contestService                    from '../contest/contest.service';
import walletService                     from '../wallet/wallet.service';
import { MatchStatus }                   from '../match/match.types';
import {
  BallEventDTO,
  SetPlayerScoreDTO,
  PlayerScorePublic,
  ContestLiveViewPublic,
  ContestTeamBreakdownPublic,
  WsBallProcessedEvent,
  WsLeaderboardSnapshot,
  WsLeaderboardEntry,
  WsConfirmedEvent,
  SCORING_RULES,
  DUCK_PENALTY_ROLES,
  BOWLING_WICKET_DISMISSALS,
  LBW_BOWLED_DISMISSALS,
  DismissalType,
} from './score.types';
import AppError from '../../utils/AppError';

const overNotationToBalls = (overs: number): number => {
  const wholeOvers = Math.floor(overs);
  const ballsPart = Math.round((overs - wholeOvers) * 10);
  return (wholeOvers * 6) + ballsPart;
};

const ballsToOverNotation = (balls: number): number => {
  const wholeOvers = Math.floor(balls / 6);
  const remainingBalls = balls % 6;
  return Number((wholeOvers + (remainingBalls / 10)).toFixed(1));
};

const addLegalBallsToOvers = (currentOvers: number, addBalls: number): number => {
  const totalBalls = overNotationToBalls(currentOvers) + addBalls;
  return ballsToOverNotation(totalBalls);
};

const buildTieAwareRanks = <T>(items: T[], getPoints: (item: T) => number): number[] => {
  const ranks: number[] = [];
  let prevPoints: number | null = null;
  let prevRank = 1;
  for (let i = 0; i < items.length; i++) {
    const points = getPoints(items[i]) ?? 0;
    if (i === 0) {
      ranks.push(1);
      prevPoints = points;
      prevRank = 1;
      continue;
    }
    if (points === prevPoints) {
      ranks.push(prevRank);
    } else {
      const rank = i + 1;
      ranks.push(rank);
      prevRank = rank;
      prevPoints = points;
    }
  }
  return ranks;
};

const BALL_EVENT_PROCESSED_TTL_SECONDS = 7 * 24 * 60 * 60;
const BALL_EVENT_LOCK_TTL_SECONDS = 60;

const asBit = (value?: boolean): string => (value ? '1' : '0');

const buildBallEventId = (dto: BallEventDTO): string => {
  if (dto.eventId?.trim()) return dto.eventId.trim();

  const raw = [
    dto.matchId,
    dto.battingPlayerId,
    dto.bowlingPlayerId,
    dto.fieldingPlayerId ?? '',
    String(dto.overNumber),
    String(dto.ballNumber),
    String(dto.runs),
    String(dto.runsConceded),
    String(dto.ballsFaced),
    asBit(dto.isDotBall),
    asBit(dto.isFour),
    asBit(dto.isSix),
    asBit(dto.isOut),
    dto.dismissalType ?? '',
    asBit(dto.isWide),
    asBit(dto.isNoBall),
    asBit(dto.isMaiden),
    asBit(dto.isCatch),
    asBit(dto.isDirectRunOut),
    asBit(dto.isIndirectRunOut),
    asBit(dto.isStumping),
    asBit(dto.isOverthrow),
    String(dto.overthrowRuns ?? 0),
    asBit(dto.overthrowIsBoundary),
  ].join('|');

  return createHash('sha1').update(raw).digest('hex');
};

// ═════════════════════════════════════════════════════════════════════════════
// FANTASY POINTS CALCULATOR
// Pure function — identical inputs always produce identical outputs.
// All constants come from SCORING_RULES so values are testable and visible.
// ═════════════════════════════════════════════════════════════════════════════

export function calculateFantasyPoints(s: IPlayerScore): number {
  let pts = 0;
  const R = SCORING_RULES;

  // ── Batting ───────────────────────────────────────────────────────────────
  if (!s.didNotBat) {

    pts += s.runs  * R.RUN;           // +1 per run (includes overthrow runs)
    pts += s.fours * R.BOUNDARY_BONUS;// +4 per genuine boundary (never overthrow)
    pts += s.sixes * R.SIX_BONUS;     // +6 per six

    // Milestones — mutually exclusive, only the highest tier is awarded.
    // 112 runs → +16 only. The +4 / +8 / +12 are NOT added on top.
    if      (s.runs >= 100) pts += R.RUN_100_BONUS;
    else if (s.runs >= 75)  pts += R.RUN_75_BONUS;
    else if (s.runs >= 50)  pts += R.RUN_50_BONUS;
    else if (s.runs >= 25)  pts += R.RUN_25_BONUS;

    // Duck penalty — BATSMAN, WICKET_KEEPER, ALL_ROUNDER only — never BOWLER.
    // RETIRED_HURT / DID_NOT_BAT are not dismissals — no penalty.
    if (
      s.isOut                                        &&
      s.runs === 0                                   &&
      s.dismissalType !== DismissalType.RETIRED_HURT &&
      s.dismissalType !== DismissalType.DID_NOT_BAT  &&
      DUCK_PENALTY_ROLES.has(s.playerRole)
    ) {
      pts += R.DUCK_PENALTY; // -2
    }
  }

  // ── Bowling ───────────────────────────────────────────────────────────────

  // +30 per bowling wicket. Run-outs are fielding — bowler gets 0 credit.
  pts += s.wickets * R.WICKET;

  // +8 extra for each LBW or Bowled wicket (on top of the +30).
  pts += s.lbwBowledCount * R.LBW_BOWLED_BONUS;

  // +1 per dot ball (legal delivery, 0 runs scored).
  pts += s.dotBalls * R.DOT_BALL;

  // +12 per maiden over.
  pts += s.maidenOvers * R.MAIDEN_OVER;

  // Wicket haul bonus — only the highest tier.
  // 5 wickets = +12 only, NOT +4 + +8 + +12.
  if      (s.wickets >= 5) pts += R.FIVE_WICKET_HAUL;   // +12
  else if (s.wickets >= 4) pts += R.FOUR_WICKET_HAUL;   // +8
  else if (s.wickets >= 3) pts += R.THREE_WICKET_HAUL;  // +4

  // Economy rate — minimum 2 overs must be bowled.
  // Dead zone: 7.01–9.99 (no bonus or penalty).
  const legalBallsBowled = overNotationToBalls(s.oversBowled);
  if (legalBallsBowled >= 12) {
    const oversAsFloat = legalBallsBowled / 6;
    const eco = s.runsConceded / oversAsFloat;
    if      (eco <   5.00) pts += R.ECO_LTE_5;       //  +6  below 5.00
    else if (eco <   6.00) pts += R.ECO_5_TO_599;    //  +4  5.00–5.99
    else if (eco <=  7.00) pts += R.ECO_6_TO_7;      //  +2  6.00–7.00
    else if (eco <  10.00) pts += 0;                 //   0  7.01–9.99
    else if (eco <= 11.00) pts += R.ECO_10_TO_11;    //  -2  10.00–11.00
    else if (eco <= 12.00) pts += R.ECO_1101_TO_12;  //  -4  11.01–12.00
    else                   pts += R.ECO_GT_12;        //  -6  above 12.00
  }

  // ── Fielding ──────────────────────────────────────────────────────────────

  pts += s.catches         * R.CATCH;            // +8 per catch
  pts += s.stumpings       * R.STUMPING;         // +12 per stumping
  pts += s.directRunOuts   * R.DIRECT_RUN_OUT;   // +12 direct hit
  pts += s.indirectRunOuts * R.INDIRECT_RUN_OUT; // +6 non-direct

  // Three catch bonus — flat +4 for 3 OR MORE catches. NOT cumulative.
  // 3 catches = +4. 6 catches = still only +4.
  if (s.catches >= 3) pts += R.THREE_CATCH_BONUS;

  // ── Other ─────────────────────────────────────────────────────────────────

  if (s.isAnnouncedInLineup) pts += R.ANNOUNCED_LINEUP; // +4
  if (s.isPlayerOfMatch)     pts += R.PLAYER_OF_MATCH;  // +10

  return Math.round(pts * 10) / 10; // 1 decimal place
}

// ═════════════════════════════════════════════════════════════════════════════
// SHAPE MAPPER  IPlayerScore → PlayerScorePublic
// ═════════════════════════════════════════════════════════════════════════════

const toPublic = (s: IPlayerScore): PlayerScorePublic => {
  const legalBallsBowled = overNotationToBalls(s.oversBowled);
  const normalizedOvers = ballsToOverNotation(legalBallsBowled);

  const strikeRate =
    s.ballsFaced >= 10
      ? Math.round((s.runs / s.ballsFaced) * 1000) / 10
      : null;

  const economy =
    legalBallsBowled >= 12
      ? Math.round((s.runsConceded / (legalBallsBowled / 6)) * 100) / 100
      : null;

  return {
    id:         (s._id as Types.ObjectId).toString(),
    matchId:    s.matchId.toString(),
    playerId:   s.playerId,
    playerName: s.playerName,
    playerRole: s.playerRole,
    teamName:   s.teamName,
    teamSlot:   s.teamSlot,

    // Batting
    runs:          s.runs,
    ballsFaced:    s.ballsFaced,
    fours:         s.fours,
    sixes:         s.sixes,
    strikeRate,
    isOut:         s.isOut,
    dismissalType: s.dismissalType,
    didNotBat:     s.didNotBat,
    isDuck:
      s.isOut &&
      s.runs === 0 &&
      s.dismissalType !== DismissalType.RETIRED_HURT &&
      s.dismissalType !== DismissalType.DID_NOT_BAT,

    // Bowling
    wickets:        s.wickets,
    oversBowled:    normalizedOvers,
    maidenOvers:    s.maidenOvers,
    runsConceded:   s.runsConceded,
    dotBalls:       s.dotBalls,
    lbwBowledCount: s.lbwBowledCount,
    economy,

    // Fielding
    catches:         s.catches,
    directRunOuts:   s.directRunOuts,
    indirectRunOuts: s.indirectRunOuts,
    stumpings:       s.stumpings,

    // Bonus
    isPlayerOfMatch:     s.isPlayerOfMatch,
    isAnnouncedInLineup: s.isAnnouncedInLineup,

    // Calculated
    fantasyPoints: s.fantasyPoints,

    // State
    isConfirmed: s.isConfirmed,
    updatedAt:   s.updatedAt,
  };
};

// ═════════════════════════════════════════════════════════════════════════════
// LEADERBOARD RECALCULATION
// Only recalculates teams that contain at least one of the affected players.
// Avoids recalculating all 720 teams on every delivery.
// ═════════════════════════════════════════════════════════════════════════════

async function recalculateLeaderboards(
  matchId: string,
  affectedPlayerIds: string[]
): Promise<WsLeaderboardSnapshot[]> {
  // 1. Active contests for this match
  const contests = await Contest.find({
    matchId,
    status: { $in: [ContestStatus.OPEN, ContestStatus.FULL, ContestStatus.CLOSED] },
  })
    .select('_id name')
    .lean();

  if (!contests.length) return [];

  const contestIds = contests.map((c: any) => c._id);

  // 2. Only teams that contain one of the affected players
  const affectedTeams = await Team.find({
    contestId:          { $in: contestIds },
    'players.playerId': { $in: affectedPlayerIds },
  })
    .select('_id contestId captainId viceCaptainId players')
    .lean();

  if (!affectedTeams.length) return [];

  const affectedContestIds = new Set(affectedTeams.map((team: any) => team.contestId.toString()));
  const affectedContests = (contests as any[]).filter((contest) =>
    affectedContestIds.has(contest._id.toString())
  );
  if (!affectedContests.length) return [];

  // 3. Load all current fantasyPoints for this match in one read
  const allScores = await PlayerScore
    .find({ matchId: new Types.ObjectId(matchId) })
    .select('playerId fantasyPoints')
    .lean();

  const scoreMap = new Map<string, number>();
  for (const s of allScores as any[]) scoreMap.set(s.playerId, s.fantasyPoints);

  // 4. Recalculate livePoints for each affected team
  const R = SCORING_RULES;
  const teamPointsMap = new Map<string, number>();

  for (const team of affectedTeams as any[]) {
    const captainId =
      team.captainId ??
      team.players.find((p: any) => p.captainRole === 'CAPTAIN')?.playerId ??
      null;
    const viceCaptainId =
      team.viceCaptainId ??
      team.players.find((p: any) => p.captainRole === 'VICE_CAPTAIN')?.playerId ??
      null;

    let total = 0;
    for (const player of team.players) {
      const base = scoreMap.get(player.playerId) ?? 0;
      if      (player.playerId === captainId)     total += base * R.CAPTAIN_MULTIPLIER;
      else if (player.playerId === viceCaptainId) total += base * R.VICE_CAPTAIN_MULTIPLIER;
      else                                              total += base;
    }
    teamPointsMap.set(team._id.toString(), Math.round(total * 10) / 10);
  }

  // 5. Bulk-write livePoints to ContestEntry
  const livePointsOps = Array.from(teamPointsMap.entries()).map(
    ([teamId, livePoints]) => ({
      updateOne: {
        filter: { teamId: new Types.ObjectId(teamId) },
        update: { $set: { livePoints } },
      },
    })
  );
  if (livePointsOps.length) await ContestEntry.bulkWrite(livePointsOps);

  // 6. Re-sort and re-rank within every affected contest
  const snapshots: WsLeaderboardSnapshot[] = [];
  const rankOpsAll: any[] = [];

  for (const contest of affectedContests) {
    const entries = await ContestEntry
      .find({ contestId: contest._id })
      .populate({ path: 'userId', select: 'name', options: { lean: true } })
      .sort({ livePoints: -1, joinedAt: 1 })
      .select('userId teamId livePoints joinedAt')
      .lean();

    const rows = entries as any[];
    const ranks = buildTieAwareRanks(rows, (e) => e.livePoints ?? 0);
    const leaderboardEntries: WsLeaderboardEntry[]  = [];

    for (let i = 0; i < rows.length; i++) {
      const entry    = rows[i];
      const liveRank = ranks[i] ?? (i + 1);

      rankOpsAll.push({
        updateOne: {
          filter: { _id: entry._id },
          update: { $set: { liveRank } },
        },
      });

      const user = entry.userId as any;
      leaderboardEntries.push({
        rank:        liveRank,
        userId:      user._id?.toString() ?? entry.userId.toString(),
        userName:    user.name ?? 'Unknown',
        teamId:      entry.teamId.toString(),
        livePoints:  entry.livePoints,
        pointsDelta: 0,
      });
    }

    snapshots.push({
      contestId:   contest._id.toString(),
      contestName: contest.name,
      entries:     leaderboardEntries.slice(0, 50), // top 50 per WS payload
    });
  }

  if (rankOpsAll.length) await ContestEntry.bulkWrite(rankOpsAll);

  return snapshots;
}

async function resetContestEntriesIfNoScores(matchId: string, contestId: string): Promise<void> {
  const hasAnyScores = await PlayerScore.exists({ matchId: new Types.ObjectId(matchId) });
  if (hasAnyScores) return;

  const entries = await ContestEntry
    .find({ contestId: new Types.ObjectId(contestId) })
    .sort({ joinedAt: 1 })
    .select('_id')
    .lean();

  if (!entries.length) return;

  await ContestEntry.bulkWrite(
    (entries as any[]).map((entry) => ({
      updateOne: {
        filter: { _id: entry._id },
        update: { $set: { livePoints: 0, liveRank: 1 } },
      },
    }))
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═════════════════════════════════════════════════════════════════════════════

export class ScoreService {

  /**
   * processBallEvent
   * ─────────────────
   * Core real-time method. Admin calls this after every single delivery.
   *
   * Flow:
   *  1. Upsert PlayerScore for batter  — $inc stats
   *  2. Upsert PlayerScore for bowler  — $inc stats
   *  3. Upsert PlayerScore for fielder — $inc stats  (when applicable)
   *  4. Recalculate fantasyPoints for all affected players
   *  5. Recalculate livePoints + liveRank for all contest entries
   *     containing any affected player
   *  6. Publish WsBallProcessedEvent → Redis → WebSocket → clients
   */
  async processBallEvent(dto: BallEventDTO): Promise<WsBallProcessedEvent> {
    const matchId    = dto.matchId;
    const matchObjId = new Types.ObjectId(matchId);
    const affectedIds: string[] = [];

    const match = await Match.findById(matchId);
    if (!match) throw new AppError('Match not found.', 404);
    if (match.status !== MatchStatus.LIVE) {
      throw new AppError(`Cannot process ball events unless match is LIVE. Current status: ${match.status}.`, 409);
    }

    const eventId = buildBallEventId(dto);
    const processedKey = `scores:ball:processed:${matchId}:${eventId}`;
    const lockKey = `scores:ball:lock:${matchId}:${eventId}`;

    const alreadyProcessed = await redisClient.exists(processedKey);
    if (alreadyProcessed) {
      throw new AppError('This ball event has already been processed.', 409);
    }

    const lockAcquired = await redisClient.set(
      lockKey,
      '1',
      'EX',
      BALL_EVENT_LOCK_TTL_SECONDS,
      'NX'
    );
    if (lockAcquired !== 'OK') {
      throw new AppError('This ball event is already being processed. Please retry shortly.', 409);
    }

    try {
      // ── Helper: resolve player in match squads, then upsert score document ──
      const upsertScore = async (
        playerId: string,
        inc: Record<string, number>,
        set?: Record<string, unknown>
      ): Promise<IPlayerScore> => {
        const t1 = match.team1Players.find(p => p._id.toString() === playerId);
        const t2 = match.team2Players.find(p => p._id.toString() === playerId);
        const mp = t1 ?? t2;
        if (!mp) throw new AppError(`Player "${playerId}" not found in this match.`, 404);

        return PlayerScore.findOneAndUpdate(
          { matchId: matchObjId, playerId },
          {
            $setOnInsert: {
              matchId:    matchObjId,
              playerId,
              playerName: mp.name,
              playerRole: mp.role,
              teamName:   t1 ? match.team1Name : match.team2Name,
              teamSlot:   t1 ? 'team1' : 'team2',
            },
            $inc: inc,
            ...(set ? { $set: set } : {}),
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ) as Promise<IPlayerScore>;
      };

    // ── 1. Batter ─────────────────────────────────────────────────────────
    // Runs: include overthrow runs (batter earns +1 per run regardless of source).
    // Fours: only genuine struck boundaries — overthrow boundaries do NOT count.
    const batterInc: Record<string, number> = {
      runs:       dto.runs + (dto.isOverthrow ? (dto.overthrowRuns ?? 0) : 0),
      ballsFaced: dto.ballsFaced,
    };
    // Genuine boundary = isFour is true AND NOT (overthrow that reached the rope)
    if (dto.isFour && !(dto.isOverthrow && dto.overthrowIsBoundary)) {
      batterInc['fours'] = 1;
    }
    if (dto.isSix) batterInc['sixes'] = 1;

    const batterSet: Record<string, unknown> = {};
    if (dto.isOut) {
      batterSet['isOut']         = true;
      batterSet['dismissalType'] = dto.dismissalType ?? DismissalType.NOT_OUT;
    }

      const updatedBatter = await upsertScore(dto.battingPlayerId, batterInc, batterSet);
      affectedIds.push(dto.battingPlayerId);

    // ── 2. Bowler ─────────────────────────────────────────────────────────
    const bowlerInc: Record<string, number> = { runsConceded: dto.runsConceded };
    const isLegalDelivery = !dto.isWide && !dto.isNoBall;

    if (isLegalDelivery) {
      if (dto.isDotBall) bowlerInc['dotBalls'] = 1;
    }

    // Bowling wicket credit — run-outs give the bowler ZERO points
    if (dto.isOut && dto.dismissalType &&
        BOWLING_WICKET_DISMISSALS.has(dto.dismissalType)) {
      bowlerInc['wickets'] = 1;
      // LBW or Bowled → additional +8 tracked via lbwBowledCount counter
      if (LBW_BOWLED_DISMISSALS.has(dto.dismissalType)) {
        bowlerInc['lbwBowledCount'] = 1;
      }
    }

    if (dto.isMaiden) bowlerInc['maidenOvers'] = 1;

      const updatedBowler = await upsertScore(dto.bowlingPlayerId, bowlerInc);
      if (isLegalDelivery) {
        updatedBowler.oversBowled = addLegalBallsToOvers(updatedBowler.oversBowled, 1);
      }
      affectedIds.push(dto.bowlingPlayerId);

    // ── 3. Fielder ────────────────────────────────────────────────────────
      let updatedFielder: IPlayerScore | null = null;
      if (dto.fieldingPlayerId && dto.isOut) {
        const fielderInc: Record<string, number> = {};
        if (dto.isCatch)          fielderInc['catches']         = 1;
        if (dto.isDirectRunOut)   fielderInc['directRunOuts']   = 1;
        if (dto.isIndirectRunOut) fielderInc['indirectRunOuts'] = 1;
        if (dto.isStumping)       fielderInc['stumpings']       = 1;

        if (Object.keys(fielderInc).length) {
          updatedFielder = await upsertScore(dto.fieldingPlayerId, fielderInc);
          affectedIds.push(dto.fieldingPlayerId);
        }
      }

    // ── 4. Recalculate fantasyPoints ──────────────────────────────────────
      const toRecalc = ([updatedBatter, updatedBowler, updatedFielder]
        .filter(Boolean)) as IPlayerScore[];

      const updatedScores: IPlayerScore[] = [];
      for (const score of toRecalc) {
        score.fantasyPoints = calculateFantasyPoints(score);
        await score.save();
        updatedScores.push(score);
      }

    // ── 5. Recalculate leaderboards ───────────────────────────────────────
      const leaderboards = await recalculateLeaderboards(matchId, affectedIds);

    // ── 6. Build event and publish to Redis (WS fans out to clients) ──────
      const event: WsBallProcessedEvent = {
        type:           'BALL_PROCESSED',
        matchId,
        over:           dto.overNumber,
        ball:           dto.ballNumber,
        updatedPlayers: updatedScores.map(toPublic),
        leaderboards,
        processedAt:    new Date().toISOString(),
      };

      await redisClient.publish(matchChannel(matchId), JSON.stringify(event));
      await redisClient.set(
        processedKey,
        new Date().toISOString(),
        'EX',
        BALL_EVENT_PROCESSED_TTL_SECONDS
      );

      return event;
    } finally {
      await redisClient.del(lockKey);
    }
  }

  /**
   * setPlayerScore
   * ───────────────
   * Admin overrides the full stat-line for one player.
   * Used to correct mistakes or do bulk stat entry after the match.
   * fantasyPoints is always recalculated — never set directly.
   * Blocked once isConfirmed = true.
   */
  async setPlayerScore(dto: SetPlayerScoreDTO): Promise<PlayerScorePublic> {
    const matchObjId = new Types.ObjectId(dto.matchId);

    const match = await Match.findById(dto.matchId);
    if (!match) throw new AppError('Match not found.', 404);

    const t1 = match.team1Players.find(p => p._id.toString() === dto.playerId);
    const t2 = match.team2Players.find(p => p._id.toString() === dto.playerId);
    const mp = t1 ?? t2;
    if (!mp) throw new AppError('Player not found in this match.', 404);

    let score = await PlayerScore.findOne({ matchId: matchObjId, playerId: dto.playerId });
    if (!score) {
      score = new PlayerScore({
        matchId:    matchObjId,
        playerId:   dto.playerId,
        playerName: mp.name,
        playerRole: mp.role,
        teamName:   t1 ? match.team1Name : match.team2Name,
        teamSlot:   t1 ? 'team1' : 'team2',
      });
    }

    if (score.isConfirmed) {
      throw new AppError('Score is already confirmed and cannot be modified.', 409);
    }

    const fields: (keyof SetPlayerScoreDTO)[] = [
      'runs', 'ballsFaced', 'fours', 'sixes', 'isOut', 'dismissalType', 'didNotBat',
      'wickets', 'oversBowled', 'maidenOvers', 'runsConceded', 'dotBalls', 'lbwBowledCount',
      'catches', 'directRunOuts', 'indirectRunOuts', 'stumpings',
      'isPlayerOfMatch', 'isAnnouncedInLineup',
    ];
    for (const field of fields) {
      if (dto[field] !== undefined) (score as any)[field] = dto[field];
    }
    if (dto.oversBowled !== undefined) {
      score.oversBowled = ballsToOverNotation(overNotationToBalls(dto.oversBowled));
    }

    score.fantasyPoints = calculateFantasyPoints(score);
    await score.save();

    const leaderboards = await recalculateLeaderboards(dto.matchId, [dto.playerId]);

    await redisClient.publish(
      matchChannel(dto.matchId),
      JSON.stringify({
        type:           'SCORE_CORRECTED',
        matchId:        dto.matchId,
        updatedPlayers: [toPublic(score)],
        leaderboards,
        processedAt:    new Date().toISOString(),
      })
    );

    return toPublic(score);
  }

  /**
   * confirmMatchScores
   * ───────────────────
   * Called once by admin when all scores are verified and the match is over.
   *
   * 1. Locks all PlayerScore documents (isConfirmed = true — no further edits)
   * 2. Copies livePoints → finalPoints and liveRank → finalRank on every ContestEntry
   * 3. Sets CLOSED contests → COMPLETED, stamps completedAt
   * 4. Publishes MATCH_CONFIRMED WS event with final leaderboards
   */
  async confirmMatchScores(matchId: string): Promise<WsConfirmedEvent> {
    const matchObjId = new Types.ObjectId(matchId);

    const match = await Match.findById(matchId);
    if (!match) throw new AppError('Match not found.', 404);
    if (match.status === MatchStatus.UPCOMING) {
      throw new AppError('Cannot confirm scores while match is UPCOMING.', 409);
    }
    if (match.status === MatchStatus.CANCELLED) {
      throw new AppError('Cannot confirm scores for a CANCELLED match.', 409);
    }

    // 1. Lock all PlayerScore docs for this match
    await PlayerScore.updateMany(
      { matchId: matchObjId },
      { $set: { isConfirmed: true } }
    );

    // 2. Copy live → final on ContestEntry.
    // Aggregation-pipeline updates ([{ $set: ... }]) are not supported in this
    // Mongoose version without `updatePipeline` flag — use bulkWrite instead.
    const contestIds = await Contest.find({ matchId }).distinct('_id');
    const entries = await ContestEntry.find(
      { contestId: { $in: contestIds } },
      { _id: 1, livePoints: 1, liveRank: 1 }
    ).lean();

    if (entries.length > 0) {
      await ContestEntry.bulkWrite(
        entries.map((e) => ({
          updateOne: {
            filter: { _id: e._id },
            update: { $set: { finalPoints: e.livePoints, finalRank: e.liveRank, rank: e.liveRank } },
          },
        }))
      );
    }

    // 3. Complete all active contests for this match
    await Contest.updateMany(
      { matchId, status: { $in: [ContestStatus.OPEN, ContestStatus.FULL, ContestStatus.CLOSED] } },
      { $set: { status: ContestStatus.COMPLETED, completedAt: new Date() } }
    );

    // 4. Build final leaderboard snapshots
    const contests = await Contest.find({ matchId }).select('_id name entryFee prizePool contestType').lean();
    const leaderboards: WsLeaderboardSnapshot[] = [];

    for (const contest of contests as any[]) {
      const entries = await ContestEntry
        .find({ contestId: contest._id })
        .populate({ path: 'userId', select: 'name', options: { lean: true } })
        .sort({ finalPoints: -1, joinedAt: 1 })
        .select('userId teamId finalPoints')
        .lean();

      const rows = entries as any[];
      if (rows.length === 0) {
        leaderboards.push({
          contestId: contest._id.toString(),
          contestName: contest.name,
          entries: [],
        });
        continue;
      }

      // Credit winnings by final rank based on contest prize distribution.
      // Idempotent at wallet transaction level via referenceId.
      const prizeDist = (contest as any).contestType === ContestType.FREE_LEAGUE 
        ? contestService.generateFreeContestDistribution((contest as any).prizePool ?? 0, Math.max(1, entries.length))
        : (() => {
          const entryFee = Number((contest as any).entryFee ?? 0);
          if (!Number.isFinite(entryFee) || entryFee <= 0) {
            throw new AppError(`Invalid entryFee for contest ${contest._id.toString()} during payout settlement.`, 500);
          }

          const grossCollection = entryFee * entries.length;
          const netPrizePool = Math.max(0, grossCollection * (1 - PLATFORM_FEE_PERCENT / 100));

          return contestService.generatePrizeDistribution({
            prizePool: Math.round(netPrizePool * 100) / 100,
            totalPlayers: Math.max(1, entries.length),
            winnerPercentage: 25,
          })
        })();

      const leaderboardEntries: WsLeaderboardEntry[] = [];
      for (let i = 0; i < rows.length; i++) {
        const e = rows[i];
        const user = e.userId as any;
        const rank = i + 1;
        const prizeAmount = prizeDist.rankPrizes[i] ?? 0;
        if (prizeAmount > 0) {
          await walletService.creditContestWinnings(
            user._id?.toString() ?? e.userId.toString(),
            contest._id.toString(),
            e.teamId.toString(),
            prizeAmount,
            rank
          );
        }

        leaderboardEntries.push({
          rank,
          userId: user._id?.toString() ?? e.userId.toString(),
          userName: user.name ?? 'Unknown',
          teamId: e.teamId.toString(),
          livePoints: (e as any).finalPoints,
          pointsDelta: 0,
        });
      }

      leaderboards.push({
        contestId: contest._id.toString(),
        contestName: contest.name,
        entries: leaderboardEntries,
      });
    }

    const event: WsConfirmedEvent = {
      type:         'MATCH_CONFIRMED',
      matchId,
      message:      'Match confirmed. Final scores locked. Results are official.',
      leaderboards,
    };

    await redisClient.publish(matchChannel(matchId), JSON.stringify(event));

    return event;
  }

  /**
   * getMatchScores
   * ───────────────
   * All player scores for a match, split by team, sorted by fantasyPoints DESC.
   */
  async getMatchScores(matchId: string): Promise<{
    team1: PlayerScorePublic[];
    team2: PlayerScorePublic[];
  }> {
    const scores = await PlayerScore
      .find({ matchId: new Types.ObjectId(matchId) })
      .sort({ fantasyPoints: -1 });

    return {
      team1: scores.filter(s => s.teamSlot === 'team1').map(toPublic),
      team2: scores.filter(s => s.teamSlot === 'team2').map(toPublic),
    };
  }

  /**
   * getLiveLeaderboard
   * ───────────────────
   * Live leaderboard snapshot for a single contest.
   * REST fallback for initial page load — WS keeps it live after that.
   */
  async getLiveLeaderboard(contestId: string): Promise<WsLeaderboardSnapshot> {
    const contest = await Contest.findById(contestId).select('name matchId').lean();
    if (!contest) throw new AppError('Contest not found.', 404);
    await resetContestEntriesIfNoScores(String(contest.matchId), contestId);

    const entries = await ContestEntry
      .find({ contestId: new Types.ObjectId(contestId) })
      .populate({ path: 'userId', select: 'name', options: { lean: true } })
      .sort({ livePoints: -1, joinedAt: 1 })
      .select('userId teamId livePoints liveRank joinedAt')
      .lean();
    const rows = entries as any[];
    const ranks = buildTieAwareRanks(rows, (e) => e.livePoints ?? 0);

    return {
      contestId,
      contestName: contest.name,
      entries: rows.map((e, i) => {
        const user = e.userId as any;
        return {
          rank:        ranks[i] ?? (i + 1),
          userId:      user._id?.toString() ?? e.userId.toString(),
          userName:    user.name ?? 'Unknown',
          teamId:      e.teamId.toString(),
          livePoints:  e.livePoints,
          pointsDelta: 0,
        };
      }),
    };
  }

  async getContestLiveView(contestId: string, currentUserId: string): Promise<ContestLiveViewPublic> {
    const contest = await Contest.findById(contestId).select('_id name matchId status').lean();
    if (!contest) throw new AppError('Contest not found.', 404);
    await resetContestEntriesIfNoScores(String(contest.matchId), contestId);

    const match = await Match.findById(contest.matchId).select('status team1Name team2Name').lean();
    if (!match) throw new AppError('Match not found for this contest.', 404);

    const scoreDocs = await PlayerScore
      .find({ matchId: new Types.ObjectId(contest.matchId) })
      .select('playerId fantasyPoints')
      .lean();
    const scoreMap = new Map<string, number>();
    for (const doc of scoreDocs) scoreMap.set(doc.playerId, doc.fantasyPoints ?? 0);

    const entries = await ContestEntry
      .find({ contestId: new Types.ObjectId(contestId) })
      .populate({ path: 'userId', select: 'name', options: { lean: true } })
      .populate({ path: 'teamId', select: 'teamName players captainId viceCaptainId', options: { lean: true } })
      .select('userId teamId joinedAt')
      .lean();

    const calculated = (entries as any[]).map((entry) => {
      const team = entry.teamId as any;
      const captainId =
        team?.captainId ??
        team?.players?.find((p: any) => p.captainRole === 'CAPTAIN')?.playerId ??
        null;
      const viceCaptainId =
        team?.viceCaptainId ??
        team?.players?.find((p: any) => p.captainRole === 'VICE_CAPTAIN')?.playerId ??
        null;

      let livePoints = 0;
      for (const p of team?.players ?? []) {
        const base = scoreMap.get(p.playerId) ?? 0;
        if      (p.playerId === captainId)     livePoints += base * SCORING_RULES.CAPTAIN_MULTIPLIER;
        else if (p.playerId === viceCaptainId) livePoints += base * SCORING_RULES.VICE_CAPTAIN_MULTIPLIER;
        else                                   livePoints += base;
      }

      return {
        entry,
        livePoints: Math.round(livePoints * 10) / 10,
      };
    });

    calculated.sort((a, b) => {
      if (b.livePoints !== a.livePoints) return b.livePoints - a.livePoints;
      return new Date(a.entry.joinedAt).getTime() - new Date(b.entry.joinedAt).getTime();
    });

    const ranks = buildTieAwareRanks(calculated, (e) => e.livePoints ?? 0);

    return {
      contestId: contest._id.toString(),
      contestName: contest.name,
      matchId: String(contest.matchId),
      matchStatus: match.status,
      contestStatus: contest.status,
      team1Name: match.team1Name,
      team2Name: match.team2Name,
      entries: calculated.map((row, idx) => {
        const entry = row.entry;
        const user = entry.userId as any;
        const team = entry.teamId as any;
        const userId = user._id?.toString() ?? entry.userId.toString();
        return {
          rank: ranks[idx] ?? (idx + 1),
          userId,
          userName: user.name ?? 'Unknown',
          teamId: team?._id?.toString?.() ?? entry.teamId.toString(),
          teamName: team?.teamName ?? 'Team',
          livePoints: row.livePoints ?? 0,
          isCurrentUser: userId === currentUserId,
        };
      }),
    };
  }

  async getContestTeamBreakdown(contestId: string, teamId: string): Promise<ContestTeamBreakdownPublic> {
    const contestObjectId = new Types.ObjectId(contestId);
    const teamObjectId = new Types.ObjectId(teamId);

    const contest = await Contest.findById(contestObjectId).lean();
    if (!contest) throw new AppError('Contest not found.', 404);
    await resetContestEntriesIfNoScores(String(contest.matchId), contestId);

    const allEntries = await ContestEntry
      .find({ contestId: contestObjectId })
      .sort({ livePoints: -1, joinedAt: 1 })
      .select('_id livePoints')
      .lean();

    const rows = allEntries as any[];
    const tieRanks = buildTieAwareRanks(rows, (e) => e.livePoints ?? 0);
    const liveRankMap = new Map<string, number>();
    for (let i = 0; i < rows.length; i++) {
      const id = rows[i]?._id?.toString();
      if (!id) continue;
      liveRankMap.set(id, tieRanks[i] ?? (i + 1));
    }

    const entry = await ContestEntry
      .findOne({ contestId: contestObjectId, teamId: teamObjectId })
      .populate({ path: 'userId', select: 'name', options: { lean: true } })
      .populate({ path: 'teamId', select: 'teamName players captainId viceCaptainId userId', options: { lean: true } })
      .select('userId teamId livePoints liveRank')
      .lean();

    if (!entry) throw new AppError('Team entry not found for this contest.', 404);

    const team = entry.teamId as any;
    const user = entry.userId as any;

    const scoreDocs = await PlayerScore
      .find({ matchId: new Types.ObjectId(contest.matchId) })
      .select('playerId fantasyPoints')
      .lean();

    const scoreMap = new Map<string, number>();
    for (const doc of scoreDocs) scoreMap.set(doc.playerId, doc.fantasyPoints ?? 0);

    const players = (team.players ?? []).map((p: any) => {
      const base = scoreMap.get(p.playerId) ?? 0;
      let multiplier = 1;
      if (p.playerId === team.captainId || p.captainRole === 'CAPTAIN') multiplier = SCORING_RULES.CAPTAIN_MULTIPLIER;
      else if (p.playerId === team.viceCaptainId || p.captainRole === 'VICE_CAPTAIN') multiplier = SCORING_RULES.VICE_CAPTAIN_MULTIPLIER;
      return {
        playerId: p.playerId,
        playerName: p.playerName,
        playerRole: p.playerRole,
        teamName: p.teamName,
        captainRole: p.captainRole,
        basePoints: Math.round(base * 10) / 10,
        multiplier,
        totalPoints: Math.round(base * multiplier * 10) / 10,
      };
    });

    return {
      contestId: contest._id.toString(),
      contestName: contest.name,
      teamId: team._id?.toString() ?? teamId,
      teamName: team.teamName ?? 'Team',
      userId: user._id?.toString() ?? entry.userId.toString(),
      userName: user.name ?? 'Unknown',
      liveRank: liveRankMap.get(entry._id.toString()) ?? 0,
      livePoints: entry.livePoints ?? 0,
      players,
    };
  }

  /**
   * getPlayerScore
   * ───────────────
   * Full score card for a single player in a match.
   */
  async getPlayerScore(matchId: string, playerId: string): Promise<PlayerScorePublic> {
    const score = await PlayerScore.findOne({
      matchId: new Types.ObjectId(matchId),
      playerId,
    });
    if (!score) throw new AppError('Score not found for this player.', 404);
    return toPublic(score);
  }
}

export default new ScoreService();
