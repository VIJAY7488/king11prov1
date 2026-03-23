import { Document, model, Model, Schema, Types } from "mongoose"
import { CaptainRole, PlayerRole, TeamPlayer } from "./team.types"




// ═════════════════════════════════════════════════════════════════════════════
// PLAYER SUBDOCUMENT
// One slot in the team. Stored denormalised (playerName, teamName) so a
// single read returns everything needed to display the team — no joins.
// ═════════════════════════════════════════════════════════════════════════════



const playerSchema = new Schema<TeamPlayer> (
    {
        playerId: {
            type: String,
            required: [true, 'Player ID is required'],
            trim: true,
        }, 
        
        playerName: {
            type: String,
            required: [true, 'Player name is required'],
            trim: true,
            maxlength: [100, 'Player name cannot exceed 100 characters'],
        },

        playerRole: {
            type: String,
            enum: {
              values: Object.values(PlayerRole),
              message: `Player role must be one of: ${Object.values(PlayerRole).join(', ')}`,
            },
            required: [true, 'Player role is required'],
        },

        // Captain / vice-captain designation — stored so leaderboard can apply multipliers
        captainRole: {
            type: String,
            enum: {
                values: Object.values(CaptainRole),
                message: `Captain role must be one of: ${Object.values(CaptainRole).join(', ')}`,
            },
            default: CaptainRole.NONE,
            required: true,
        },

        teamName: {
            type: String,
            required: [true, 'Team name is required'],
            trim: true,
            maxlength: [100, 'Team name cannot exceed 100 characters'],
        },
    },
    { _id: false } // subdocument — no separate _id
);


// ═════════════════════════════════════════════════════════════════════════════
// TEAM INTERFACE
// ═════════════════════════════════════════════════════════════════════════════

export interface ITeam extends Document {
    contestId: Types.ObjectId;   // which contest this team is entered into
    matchId: Types.ObjectId;     // which match this team is for
    userId: Types.ObjectId;      // who owns this team
    teamName: string;            // user-chosen display name e.g. "Dream 11"
    players: TeamPlayer[];       // exactly 11 players
    // Derived quick-access fields — kept in sync by pre-save hook
    captainId: string | null;       // playerId of the player with CAPTAIN role
    viceCaptainId: string | null;   // playerId of the player with VICE_CAPTAIN role
    // Locked once the contest is CLOSED — prevents user edits after match starts
    isLocked: boolean;
    createdAt: Date;
    updatedAt: Date;
  
    // Virtual
    totalPlayers: number;
};

export interface ITeamModel extends Model<ITeam> {
    findByContestAndUser(
        contestId: Types.ObjectId,
        userId: Types.ObjectId
    ): Promise<ITeam | null>;
};


// ═════════════════════════════════════════════════════════════════════════════
// TEAM SCHEMA
// ═════════════════════════════════════════════════════════════════════════════

const teamSchema = new Schema<ITeam, ITeamModel>(
    {
        contestId: {
            type: Schema.Types.ObjectId,
            ref: 'Contest',
            required: [true, 'Contest ID is required'],
            index: true,
        },
    
        matchId: {
            type: Schema.Types.ObjectId,
            ref: 'Match',
            required: [true, 'Match ID is required'],
            index: true,
        },
    
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'User ID is required'],
            index: true,
        },
    
        teamName: {
            type: String,
            required: [true, 'Team name is required'],
            trim: true,
            minlength: [2,   'Team name must be at least 2 characters'],
            maxlength: [100, 'Team name cannot exceed 100 characters'],
        },
    
        players: {
            type: [playerSchema],
            required: true,
            validate: [
                {
                  validator: (arr: TeamPlayer[]) => arr.length === 11,
                  message: 'Team must have exactly 11 players',
                },
            ],
        },
    
        // Kept in sync by pre-save hook — never set manually
        captainId: {
            type: String,
            default: null,
        },
    
        viceCaptainId: {
            type: String,
            default: null,
        },
    
        // Flipped to true by the service when contest moves to CLOSED
        isLocked: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        versionKey: false,
        toJSON:   { virtuals: true },
        toObject: { virtuals: true },
    }
);  

// ── Virtual ───────────────────────────────────────────────────────────────────

teamSchema.virtual('totalPlayers').get(function (this: ITeam) {
    return this.players.length;
});


// ── Pre-save Hook ─────────────────────────────────────────────────────────────
// Runs before every save. Validates team composition rules and
// syncs captainId / viceCaptainId from the players array.

teamSchema.pre('save', async function (this: ITeam) {
    const players = this.players;


    // ── Rule: exactly 11 players ──────────────────────────────────────────────
    if (players.length !== 11) {
        throw new Error(`Team must have exactly 11 players. Got ${players.length}.`);
    }

    // ── Rule: exactly 1 captain ───────────────────────────────────────────────
    const captains = players.filter(p => p.captainRole === CaptainRole.CAPTAIN);
    if (captains.length !== 1) {
        throw new Error(`Team must have exactly 1 captain. Got ${captains.length}.`);
    }

    // ── Rule: exactly 1 vice-captain ─────────────────────────────────────────
    const viceCaptains = players.filter(p => p.captainRole === CaptainRole.VICE_CAPTAIN);
    if (viceCaptains.length !== 1) {
        throw new Error(`Team must have exactly 1 vice-captain. Got ${viceCaptains.length}.`);
    }

    // ── Rule: a player cannot be both captain and vice-captain ───────────────
    if (captains[0].playerId === viceCaptains[0].playerId) {
        throw new Error('Captain and vice-captain must be different players.');
    }

    // ── Rule: no duplicate players ────────────────────────────────────────────
    const playerIds = players.map(p => p.playerId);
    if (new Set(playerIds).size !== playerIds.length) {
        throw new Error('Duplicate players found in team. Each player can appear only once.');
    }

    // ── Rule: at least 1 wicket-keeper ───────────────────────────────────────
    const wks = players.filter(p => p.playerRole === PlayerRole.WICKET_KEEPER);
    if (wks.length < 1) {
        throw new Error('Team must have at least 1 wicket-keeper.');
    }

    // ── Rule: at least 1 bowlers ──────────────────────────────────────────────
    const bowlers = players.filter(p => p.playerRole === PlayerRole.BOWLER);
    if (bowlers.length < 1) {
        throw new Error('Team must have at least 1 bowlers.');
    }

    // ── Rule: at least 2 batsmen ──────────────────────────────────────────────
    const batsmen = players.filter(p => p.playerRole === PlayerRole.BATSMAN);
    if (batsmen.length < 2) {
        throw new Error('Team must have at least 2 batsmen.');
    }

    // ── Rule: all-rounders must be between 1 and 8 (inclusive) ───────────────
    const allRounders = players.filter(p => p.playerRole === PlayerRole.ALL_ROUNDER);
    if (allRounders.length < 1) {
        throw new Error('Team must have at least 1 all-rounder.');
    }
    if (allRounders.length > 8) {
        throw new Error('Team can have at most 8 all-rounders.');
    }

    // ── Sync captainId / viceCaptainId ────────────────────────────────────────
    this.captainId     = captains[0].playerId;
    this.viceCaptainId = viceCaptains[0].playerId;
});


// ── Indexes ───────────────────────────────────────────────────────────────────

// A user can have multiple teams for the same match/contest
teamSchema.index({ userId: 1, createdAt: -1 });
teamSchema.index({ contestId: 1, isLocked: 1 });

// ── Statics ───────────────────────────────────────────────────────────────────

teamSchema.statics.findByContestAndUser = function (
    contestId: Types.ObjectId,
    userId: Types.ObjectId
): Promise<ITeam | null> {
    return this.findOne({ contestId, userId });
};


// ═════════════════════════════════════════════════════════════════════════════
// MODEL
// ═════════════════════════════════════════════════════════════════════════════

export const Team = model<ITeam, ITeamModel>('Team', teamSchema);
