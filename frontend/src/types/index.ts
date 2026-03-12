// ─── SPORT ──────────────────────────────────────────
export interface Sport {
  id: string;
  icon: string;
  label: string;
  count: number;
}

// ─── MATCH ──────────────────────────────────────────
export type MatchStatus = "live" | "upcoming" | "completed";

export interface TeamInfo {
  emoji: string;
  name: string;
  short: string;
  score?: string;
}

export interface Match {
  id: number;
  sport: string;
  league: string;
  flag: string;
  format: string;
  status: MatchStatus;
  liveOver?: string;
  timeLeft?: string;
  matchTime?: string;
  teamA: TeamInfo;
  teamB: TeamInfo;
  prize: string;
  prizeRaw: number;
  filled: number;
  spotsLeft: string;
  featured?: boolean;
  players: Player[];
}

// ─── CONTEST ─────────────────────────────────────────
export type ContestCategory = "mega" | "small" | "h2h" | "practice";
export type TagType = "mega" | "guar" | "multi" | "free" | "h2h" | "practice";

export interface ContestTag {
  l: string;
  t: TagType;
}

export interface Contest {
  id: number;
  matchId: number;
  name: string;
  cat: ContestCategory;
  tags: ContestTag[];
  prize: string;
  prizeLabel: string;
  entry: string;
  entryRaw: number;
  total: number;
  filled: number;
  winners: number;
  isFree?: boolean;
}

// ─── PLAYER ──────────────────────────────────────────
export type PlayerRole = "WK" | "BAT" | "AR" | "BOWL";

export interface Player {
  id: number;
  name: string;
  short: string;
  team: string;
  role: PlayerRole;
  credits: number;
  pts: number;
  sel: number;
}

// ─── FANTASY TEAM ────────────────────────────────────
export interface FantasyTeam {
  id: number;
  name: string;
  matchId: number;
  matchLabel: string;
  captain: string;
  viceCaptain: string;
  players: Player[];
  pts: number;
  icon: string;
  livePts?: boolean;
}

// ─── LEADERBOARD ─────────────────────────────────────
export interface LeaderboardEntry {
  rank: number;
  init: string;
  name: string;
  team: string;
  pts: number;
  prize: string;
  bg: string;
  isMe?: boolean;
}

// ─── WALLET ──────────────────────────────────────────
export interface Wallet {
  balance: number;
  won: number;
  contests: number;
  bonus: number;
}

// ─── NOTIFICATION ────────────────────────────────────
export interface Notification {
  id: number;
  type: "win" | "alert" | "promo" | "deposit";
  icon: string;
  title: string;
  msg: string;
  time: string;
  read: boolean;
}

// ─── TRANSACTION ─────────────────────────────────────
export interface Transaction {
  id: number;
  icon: string;
  title: string;
  amount: string;
  date: string;
  clr: string;
}

// ─── TOAST ───────────────────────────────────────────
export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  type: ToastType;
  icon?: string;
  msg: string;
}

// ─── APP STATE ───────────────────────────────────────
export interface AppDispatchAction {
  type:
    | "CREATE_TEAM"
    | "PAYMENT"
    | "ADD_MONEY"
    | "WITHDRAW"
    | "VIEW_TEAM";
  match?: Match;
  contest?: Contest;
  team?: FantasyTeam;
}