import { Schema, model, Document, Model, Types } from 'mongoose';
import { DismissalType } from './score.types';
import { PlayerRole }    from '../team/team.types';

// ═════════════════════════════════════════════════════════════════════════════
// INTERFACE
// One document per player per match.
// Stats are incremented in-place after every delivery.
// fantasyPoints is always derived — never set directly.
// ═════════════════════════════════════════════════════════════════════════════

export interface IPlayerScore extends Document {
  matchId:    Types.ObjectId;
  /** Subdoc _id from Match.team1Players or Match.team2Players. */
  playerId:   string;
  playerName: string;
  /** Stored so duck-penalty eligibility can be checked without a joins. */
  playerRole: PlayerRole;
  teamName:   string;
  teamSlot:   'team1' | 'team2';

  // ── Batting ───────────────────────────────────────────────────────────────
  runs:          number;
  ballsFaced:    number;
  /** Genuine struck boundaries only — overthrow boundaries are NOT counted here. */
  fours:         number;
  sixes:         number;
  isOut:         boolean;
  dismissalType: DismissalType;
  didNotBat:     boolean;

  // ── Bowling ───────────────────────────────────────────────────────────────
  wickets:        number;
  /** Stored as decimal: 3 overs 4 balls = 3.4 */
  oversBowled:    number;
  maidenOvers:    number;
  runsConceded:   number;
  /** Count of legal deliveries on which 0 runs were scored. */
  dotBalls:       number;
  /** Count of LBW + Bowled dismissals — each earns an extra +8 bonus. */
  lbwBowledCount: number;

  // ── Fielding ──────────────────────────────────────────────────────────────
  catches:         number;
  directRunOuts:   number;
  indirectRunOuts: number;
  stumpings:       number;

  // ── Bonus ─────────────────────────────────────────────────────────────────
  isPlayerOfMatch:     boolean;
  /** +4 awarded when admin marks player as part of the official announced playing XI. */
  isAnnouncedInLineup: boolean;

  // ── Derived — always recalculated, never manually assigned ───────────────
  fantasyPoints: number;

  // ── State ─────────────────────────────────────────────────────────────────
  /** Set to true by admin when match scores are finalised — blocks further edits. */
  isConfirmed: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export interface IPlayerScoreModel extends Model<IPlayerScore> {
  findByMatch(matchId: Types.ObjectId): Promise<IPlayerScore[]>;
  findByPlayer(matchId: Types.ObjectId, playerId: string): Promise<IPlayerScore | null>;
}

// ═════════════════════════════════════════════════════════════════════════════
// SCHEMA
// ═════════════════════════════════════════════════════════════════════════════

const playerScoreSchema = new Schema<IPlayerScore, IPlayerScoreModel>(
  {
    matchId: {
      type:     Schema.Types.ObjectId,
      ref:      'Match',
      required: [true, 'Match ID is required'],
      index:    true,
    },

    playerId: {
      type:     String,
      required: [true, 'Player ID is required'],
      trim:     true,
    },

    playerName: { type: String, required: true, trim: true },

    playerRole: {
      type:     String,
      enum:     Object.values(PlayerRole),
      required: [true, 'Player role is required'],
    },

    teamName: { type: String, required: true, trim: true },
    teamSlot: { type: String, enum: ['team1', 'team2'], required: true },

    // ── Batting ───────────────────────────────────────────────────────────────
    runs:         { type: Number, default: 0, min: 0 },
    ballsFaced:   { type: Number, default: 0, min: 0 },
    fours:        { type: Number, default: 0, min: 0 },
    sixes:        { type: Number, default: 0, min: 0 },
    isOut:        { type: Boolean, default: false },
    dismissalType: {
      type:    String,
      enum:    Object.values(DismissalType),
      default: DismissalType.NOT_OUT,
    },
    didNotBat: { type: Boolean, default: false },

    // ── Bowling ───────────────────────────────────────────────────────────────
    wickets:        { type: Number, default: 0, min: 0 },
    oversBowled:    { type: Number, default: 0, min: 0 },
    maidenOvers:    { type: Number, default: 0, min: 0 },
    runsConceded:   { type: Number, default: 0, min: 0 },
    dotBalls:       { type: Number, default: 0, min: 0 },
    lbwBowledCount: { type: Number, default: 0, min: 0 },

    // ── Fielding ──────────────────────────────────────────────────────────────
    catches:         { type: Number, default: 0, min: 0 },
    directRunOuts:   { type: Number, default: 0, min: 0 },
    indirectRunOuts: { type: Number, default: 0, min: 0 },
    stumpings:       { type: Number, default: 0, min: 0 },

    // ── Bonus ─────────────────────────────────────────────────────────────────
    isPlayerOfMatch:     { type: Boolean, default: false },
    isAnnouncedInLineup: { type: Boolean, default: false },

    // ── Derived ───────────────────────────────────────────────────────────────
    fantasyPoints: { type: Number, default: 0 },

    // ── State ─────────────────────────────────────────────────────────────────
    isConfirmed: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// One score document per player per match — enforced at DB level
playerScoreSchema.index({ matchId: 1, playerId: 1 }, { unique: true });
playerScoreSchema.index({ matchId: 1, teamSlot: 1 });
playerScoreSchema.index({ matchId: 1, fantasyPoints: -1 }); // top scorers query

// ── Statics ───────────────────────────────────────────────────────────────────

playerScoreSchema.statics.findByMatch = function (
  matchId: Types.ObjectId
): Promise<IPlayerScore[]> {
  return this.find({ matchId }).sort({ fantasyPoints: -1 });
};

playerScoreSchema.statics.findByPlayer = function (
  matchId: Types.ObjectId,
  playerId: string
): Promise<IPlayerScore | null> {
  return this.findOne({ matchId, playerId });
};

export const PlayerScore = model<IPlayerScore, IPlayerScoreModel>(
  'PlayerScore',
  playerScoreSchema
);