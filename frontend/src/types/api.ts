export interface MatchPlayer {
  _id: string;
  name: string;
  role: "WICKET_KEEPER" | "BATSMAN" | "ALL_ROUNDER" | "BOWLER";
}

export interface MatchFromApi {
  id: string;   // backend serialises as `id` via toJSON virtuals
  _id?: string; // keep as optional fallback for safety
  league?: string;
  matchNumber?: string;
  status: "UPCOMING" | "LIVE" | "COMPLETED" | "CANCELLED";
  team1Name: string;
  team2Name: string;
  matchDate: string;  // backend field name
  venue?: string;
  prizePool?: number;
  team1Players?: MatchPlayer[];
  team2Players?: MatchPlayer[];
  // legacy optional fields
  matchStartTime?: string;
  matchId?: string;
  name?: string;
  format?: string;
}

export interface TeamPlayerFromApi {
  playerId: string;
  playerName: string;
  playerRole: "BATSMAN" | "BOWLER" | "ALL_ROUNDER" | "WICKET_KEEPER";
  teamName?: string;
  captainRole: "CAPTAIN" | "VICE_CAPTAIN" | "NONE" | "NORMAL";
}

export interface TeamFromApi {
  id?: string;
  _id?: string;
  userId: string;
  contestId: string;
  matchId: string;
  teamName: string;
  players: TeamPlayerFromApi[];
  isLocked?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
