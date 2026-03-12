// ── Enums ─────────────────────────────────────────────────────────────────────

export enum PlayerRole {
    BATSMAN       = 'BATSMAN',
    BOWLER        = 'BOWLER',
    ALL_ROUNDER   = 'ALL_ROUNDER',
    WICKET_KEEPER = 'WICKET_KEEPER',
}

export enum CaptainRole {
    NONE         = 'NONE',       // regular player
    CAPTAIN      = 'CAPTAIN',    // 2× points multiplier
    VICE_CAPTAIN = 'VICE_CAPTAIN', // 1.5× points multiplier
}


// ── Subdocument: one player slot in the team ──────────────────────────────────

export interface TeamPlayer {
    playerId: string;           // reference to player/athlete master data
    playerName: string;         // denormalised — avoids join on every read
    playerRole: PlayerRole;     // BATSMAN | BOWLER | ALL_ROUNDER | WICKET_KEEPER
    captainRole: CaptainRole;   // NONE | CAPTAIN | VICE_CAPTAIN
    teamName: string;           // real-world team (e.g. "Mumbai Indians")
}


// ── Request DTOs ──────────────────────────────────────────────────────────────

export interface CreateTeamDTO {
    contestId: string;
    teamName: string;        // user's chosen team name e.g. "Dream 11"
    players: TeamPlayer[];   // exactly 11 players
}

export interface UpdateTeamDTO {
    teamName?: string;
    players?: TeamPlayer[];  // full replacement of player list
    // captain/vice-captain are changed via players[].captainRole
}


// ── Response Shapes ───────────────────────────────────────────────────────────

export interface TeamPlayerPublic {
    playerId: string;
    playerName: string;
    playerRole: PlayerRole;
    captainRole: CaptainRole;
    teamName: string;
}

export interface TeamPublic {
    id: string;
    contestId: string;
    matchId?: string;
    userId: string;
    teamName: string;
    players: TeamPlayerPublic[];
    captainId: string | null;       // playerId of the captain
    viceCaptainId: string | null;   // playerId of the vice-captain
    isLocked: boolean;              // true once contest is CLOSED — no user edits
    totalPlayers: number;
    createdAt: Date;
    updatedAt: Date;
}