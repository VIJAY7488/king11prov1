import type { MatchFromApi } from "@/types/api";

interface ContestLike {
  matchId?: string;
  prizePool?: number;
  match?: Partial<MatchFromApi> | null;
}

function toTime(value?: string): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(value);
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

/**
 * Build a deduplicated list of LIVE/UPCOMING matches from contest payloads.
 * Useful when public match endpoint is unavailable for logged-out users.
 */
export function extractLiveUpcomingMatches(contests: ContestLike[]): MatchFromApi[] {
  const byId = new Map<string, MatchFromApi>();

  for (const contest of contests) {
    const match = contest.match ?? {};
    const id =
      (typeof match.id === "string" && match.id) ||
      (typeof match._id === "string" && match._id) ||
      (typeof contest.matchId === "string" && contest.matchId) ||
      "";

    if (!id) continue;

    const rawStatus = String(match.status ?? "UPCOMING").toUpperCase();
    if (rawStatus !== "LIVE" && rawStatus !== "UPCOMING") continue;

    const status = rawStatus as MatchFromApi["status"];
    const existing = byId.get(id);

    const prizePool = Math.max(
      existing?.prizePool ?? 0,
      typeof match.prizePool === "number" ? match.prizePool : 0,
      typeof contest.prizePool === "number" ? contest.prizePool : 0
    );

    byId.set(id, {
      id,
      _id: typeof match._id === "string" ? match._id : existing?._id,
      status,
      team1Name:
        (typeof match.team1Name === "string" && match.team1Name) ||
        existing?.team1Name ||
        "Team 1",
      team2Name:
        (typeof match.team2Name === "string" && match.team2Name) ||
        existing?.team2Name ||
        "Team 2",
      matchDate:
        (typeof match.matchDate === "string" && match.matchDate) ||
        (typeof match.matchStartTime === "string" && match.matchStartTime) ||
        existing?.matchDate ||
        "",
      matchStartTime:
        (typeof match.matchStartTime === "string" && match.matchStartTime) ||
        existing?.matchStartTime,
      venue:
        (typeof match.venue === "string" && match.venue) ||
        existing?.venue,
      format:
        (typeof match.format === "string" && match.format) ||
        existing?.format ||
        "CRICKET",
      prizePool,
      team1Players: Array.isArray(match.team1Players) ? match.team1Players : existing?.team1Players,
      team2Players: Array.isArray(match.team2Players) ? match.team2Players : existing?.team2Players,
    });
  }

  return Array.from(byId.values()).sort((a, b) => {
    if (a.status !== b.status) return a.status === "LIVE" ? -1 : 1;
    return toTime(a.matchDate || a.matchStartTime) - toTime(b.matchDate || b.matchStartTime);
  });
}
