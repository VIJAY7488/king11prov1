import { useState, useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/store/authStore";

// ── Types mirroring backend WS payloads ──────────────────────────────────────

export interface LivePlayerScore {
  id: string;
  playerId: string;
  playerName: string;
  playerRole: string;
  teamName: string;
  teamSlot: "team1" | "team2";
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  strikeRate: number | null;
  isOut: boolean;
  dismissalType: string;
  wickets: number;
  oversBowled: number;
  maidenOvers: number;
  runsConceded: number;
  dotBalls: number;
  economy: number | null;
  catches: number;
  stumpings: number;
  directRunOuts: number;
  indirectRunOuts: number;
  isPlayerOfMatch: boolean;
  isAnnouncedInLineup: boolean;
  fantasyPoints: number;
  isConfirmed: boolean;
  updatedAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  teamId: string;
  livePoints: number;
  pointsDelta: number;
}

export interface LeaderboardSnapshot {
  contestId: string;
  contestName: string;
  entries: LeaderboardEntry[];
}

export interface WsState {
  connected: boolean;
  lastBall: { over: number; ball: number } | null;
  updatedPlayers: LivePlayerScore[];
  leaderboards: LeaderboardSnapshot[];
  matchConfirmed: boolean;
  /** Map of playerId → current fantasyPoints — for fast lookup */
  pointsMap: Map<string, number>;
}

const DEFAULT_API_BASE = "https://api.king11pro.live/api/v1";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE;

const WS_BASE = (() => {
  const explicitWsBase = import.meta.env.VITE_WS_BASE_URL?.trim();
  if (explicitWsBase) return explicitWsBase.replace(/\/$/, "");

  try {
    const apiUrl = new URL(API_BASE_URL);
    apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
    apiUrl.pathname = "/ws/match";
    apiUrl.search = "";
    apiUrl.hash = "";
    return apiUrl.toString().replace(/\/$/, "");
  } catch {
    return "ws://localhost:4000/ws/match";
  }
})();

export function useMatchWebSocket(matchId: string | null): WsState {
  const token = useAuthStore((s) => s.token);

  const [state, setState] = useState<WsState>({
    connected: false,
    lastBall: null,
    updatedPlayers: [],
    leaderboards: [],
    matchConfirmed: false,
    pointsMap: new Map(),
  });

  const wsRef  = useRef<WebSocket | null>(null);
  const active = useRef(true);

  const connect = useCallback(() => {
    if (!matchId || !token) return;

    const url = `${WS_BASE}?matchId=${matchId}&token=${encodeURIComponent(token)}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((s) => ({ ...s, connected: true }));
    };

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);

        if (event.type === "BALL_PROCESSED") {
          setState((prev) => {
            const newMap = new Map(prev.pointsMap);
            for (const p of event.updatedPlayers as LivePlayerScore[]) {
              newMap.set(p.playerId, p.fantasyPoints);
            }
            return {
              ...prev,
              lastBall:       { over: event.over, ball: event.ball },
              updatedPlayers: event.updatedPlayers,
              leaderboards:   event.leaderboards,
              pointsMap:      newMap,
            };
          });
        }

        if (event.type === "MATCH_CONFIRMED") {
          setState((s) => ({
            ...s,
            matchConfirmed: true,
            leaderboards:   event.leaderboards,
          }));
        }
      } catch {
        // malformed message — ignore
      }
    };

    ws.onerror = () => {
      setState((s) => ({ ...s, connected: false }));
    };

    ws.onclose = () => {
      setState((s) => ({ ...s, connected: false }));
      // Auto-reconnect after 3 seconds if hook is still mounted
      if (active.current) {
        setTimeout(() => { if (active.current) connect(); }, 3000);
      }
    };
  }, [matchId, token]);

  useEffect(() => {
    active.current = true;
    connect();

    return () => {
      active.current = false;
      wsRef.current?.close();
    };
  }, [connect]);

  return state;
}
