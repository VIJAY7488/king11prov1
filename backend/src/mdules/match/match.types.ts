import { PlayerRole } from '../team/team.types';

// ── Enums ─────────────────────────────────────────────────────────────────────

export enum MatchStatus {
  UPCOMING  = 'UPCOMING',   // match scheduled, squads announced
  LIVE      = 'LIVE',       // match in progress — score service active
  COMPLETED = 'COMPLETED',  // match over, scores confirmed
  CANCELLED = 'CANCELLED',  // abandoned / cancelled
}

// ── Squad Player ──────────────────────────────────────────────────────────────
/** One entry in the official match squad (team1Players / team2Players). */
export interface SquadPlayer {
  _id: string;          // unique string ID — referenced by PlayerScore.playerId and Team.players[].playerId
  name: string;
  role: PlayerRole;
}

// ── Request DTOs ──────────────────────────────────────────────────────────────

export interface CreateMatchDTO {
  team1Name: string;
  team2Name: string;
  team1Players: SquadPlayer[];
  team2Players: SquadPlayer[];
  matchDate: Date | string;
  venue?: string;
}

export interface UpdateMatchDTO {
  team1Name?: string;
  team2Name?: string;
  team1Players?: SquadPlayer[];
  team2Players?: SquadPlayer[];
  matchDate?: Date | string;
  venue?: string;
  status?: MatchStatus;
}

export interface MatchQueryParams {
  status?: MatchStatus;
  page?: number;
  limit?: number;
}

// ── Response Shapes ───────────────────────────────────────────────────────────

export interface MatchPublic {
  id: string;
  team1Name: string;
  team2Name: string;
  team1Players: SquadPlayer[];
  team2Players: SquadPlayer[];
  matchDate: Date;
  venue?: string;
  status: MatchStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedMatches {
  matches: MatchPublic[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
