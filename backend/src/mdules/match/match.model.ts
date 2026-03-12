import { Document, Model, model, Schema, Types } from 'mongoose';
import { MatchStatus, SquadPlayer } from './match.types';
import { PlayerRole } from '../team/team.types';

// ═════════════════════════════════════════════════════════════════════════════
// INTERFACE
// ═════════════════════════════════════════════════════════════════════════════

export interface IMatch extends Document {
  team1Name: string;
  team2Name: string;
  /** Official squad for team 1 — each element has _id, name, role */
  team1Players: SquadPlayer[];
  /** Official squad for team 2 — each element has _id, name, role */
  team2Players: SquadPlayer[];
  matchDate: Date;
  venue?: string;
  status: MatchStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMatchModel extends Model<IMatch> {
  findLive(): Promise<IMatch[]>;
  findUpcoming(): Promise<IMatch[]>;
}

// ── Squad player subdocument schema ───────────────────────────────────────────
// _id is a plain String here (not ObjectId) so admin can supply readable IDs
// like "rohit_sharma_mi" — score.service.ts matches players by this string.

const squadPlayerSchema = new Schema<SquadPlayer>(
  {
    _id: {
      type: String,
      required: [true, 'Player ID is required'],
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Player name is required'],
      trim: true,
      maxlength: [100, 'Player name cannot exceed 100 characters'],
    },
    role: {
      type: String,
      enum: {
        values: Object.values(PlayerRole),
        message: `Role must be one of: ${Object.values(PlayerRole).join(', ')}`,
      },
      required: [true, 'Player role is required'],
    },
  },
  { _id: false } // _id is the string field above — don't auto-generate ObjectId
);

// ═════════════════════════════════════════════════════════════════════════════
// SCHEMA
// ═════════════════════════════════════════════════════════════════════════════

const matchSchema = new Schema<IMatch, IMatchModel>(
  {
    team1Name: {
      type: String,
      required: [true, 'Team 1 name is required'],
      trim: true,
      maxlength: [100, 'Team name cannot exceed 100 characters'],
    },

    team2Name: {
      type: String,
      required: [true, 'Team 2 name is required'],
      trim: true,
      maxlength: [100, 'Team name cannot exceed 100 characters'],
    },

    team1Players: {
      type: [squadPlayerSchema],
      validate: [
        {
          validator: (arr: SquadPlayer[]) => arr.length >= 11 && arr.length <= 15,
          message: 'Squad must have between 11 and 15 players',
        },
      ],
    },

    team2Players: {
      type: [squadPlayerSchema],
      validate: [
        {
          validator: (arr: SquadPlayer[]) => arr.length >= 11 && arr.length <= 15,
          message: 'Squad must have between 11 and 15 players',
        },
      ],
    },

    matchDate: {
      type: Date,
      required: [true, 'Match date is required'],
      index: true,
    },

    venue: {
      type: String,
      trim: true,
      maxlength: [200, 'Venue cannot exceed 200 characters'],
    },

    status: {
      type: String,
      enum: {
        values: Object.values(MatchStatus),
        message: `Status must be one of: ${Object.values(MatchStatus).join(', ')}`,
      },
      default: MatchStatus.UPCOMING,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

matchSchema.index({ status: 1, matchDate: 1 });
matchSchema.index({ matchDate: -1 });

// ── Statics ───────────────────────────────────────────────────────────────────

matchSchema.statics.findLive = function (): Promise<IMatch[]> {
  return this.find({ status: MatchStatus.LIVE }).sort({ matchDate: 1 });
};

matchSchema.statics.findUpcoming = function (): Promise<IMatch[]> {
  return this.find({ status: MatchStatus.UPCOMING }).sort({ matchDate: 1 });
};

// ═════════════════════════════════════════════════════════════════════════════
// MODEL
// ═════════════════════════════════════════════════════════════════════════════

export const Match = model<IMatch, IMatchModel>('Match', matchSchema);
