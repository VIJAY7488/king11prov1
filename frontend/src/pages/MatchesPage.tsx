import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import { extractLiveUpcomingMatches } from "@/lib/matches";
import { useApp } from "@/context/AppContext";
import { useAuthStore } from "@/store/authStore";
import type { MatchFromApi } from "@/types/api";
import type { Contest } from "@/components/contest/ContestCard";
import type { LivePlayerScore } from "@/hooks/useMatchWebSocket";

interface MatchScoreApiResponse {
  team1?: LivePlayerScore[];
  team2?: LivePlayerScore[];
}

export function MatchesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlMatchId = searchParams.get("matchId");
  const view = searchParams.get("view");
  const isStatsView = view === "stats";
  const persistedMatchId = sessionStorage.getItem("selectedMatchId");
  const contextMatchId = urlMatchId ?? persistedMatchId;
  const statsMatchId = isStatsView ? contextMatchId : null;
  const token = useAuthStore((s) => s.token);
  const { toast } = useApp();
  const [matches, setMatches] = useState<MatchFromApi[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<MatchFromApi | null>(null);
  const [team1Scores, setTeam1Scores] = useState<LivePlayerScore[]>([]);
  const [team2Scores, setTeam2Scores] = useState<LivePlayerScore[]>([]);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!token) {
        try {
          const contestRes = await api.get("/contests?limit=100");
          const contests: Contest[] = contestRes.data?.data?.contests ?? [];
          setMatches(extractLiveUpcomingMatches(contests));
          setError(null);
        } catch (err) {
          setError(getErrorMessage(err, "Failed to load matches"));
        } finally {
          setLoading(false);
        }
        return;
      }

      try {
        const [matchesRes, joinedRes] = await Promise.all([
          api.get("/matches?limit=50"),
          api.get("/users/joined-contests"),
        ]);
        const joinedItems: Array<{ match?: { id?: string; _id?: string } }> = joinedRes.data?.data?.contests ?? [];
        const joinedIds = new Set(
          joinedItems
            .map((item) => item.match?.id ?? item.match?._id ?? "")
            .filter(Boolean)
        );
        const all: MatchFromApi[] = matchesRes.data?.data?.matches ?? [];
        const liveJoinedMatches = all.filter((m) => m.status === "LIVE" && joinedIds.has(m.id ?? m._id ?? ""));
        setMatches(liveJoinedMatches);
      } catch (err) {
        setError(getErrorMessage(err, "Failed to load matches"));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  // Resolve the match ID — backend returns `id` (virtual), not `_id`
  function matchId(m: MatchFromApi) { return m.id ?? m._id ?? ""; }

  // Resolve the date to show
  function matchTime(m: MatchFromApi) {
    const dateStr = m.matchDate ?? m.matchStartTime ?? "";
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  }

  function handleOpenMatch(m: MatchFromApi) {
    const id = matchId(m);
    if (!id) return;

    if (!token) {
      toast({ type: "info", icon: "🔒", msg: "Please login first to view match details" });
      navigate("/login");
      return;
    }

    navigate(`/joined-contests?matchId=${encodeURIComponent(id)}`);
  }

  useEffect(() => {
    if (urlMatchId) sessionStorage.setItem("selectedMatchId", urlMatchId);
  }, [urlMatchId]);

  useEffect(() => {
    async function loadScorecard() {
      if (!isStatsView || !statsMatchId) {
        setSelectedMatch(null);
        setTeam1Scores([]);
        setTeam2Scores([]);
        return;
      }

      setScoreLoading(true);
      try {
        const [mRes, sRes] = await Promise.all([
          api.get(`/matches/${statsMatchId}`),
          api.get(`/scores/match/${statsMatchId}`).catch(() => null),
        ]);
        setSelectedMatch(mRes.data?.data?.match ?? null);
        const scoreData: MatchScoreApiResponse = sRes?.data?.data ?? {};
        setTeam1Scores(scoreData.team1 ?? []);
        setTeam2Scores(scoreData.team2 ?? []);
      } catch {
        setSelectedMatch(null);
        setTeam1Scores([]);
        setTeam2Scores([]);
      } finally {
        setScoreLoading(false);
      }
    }
    loadScorecard();
  }, [isStatsView, statsMatchId]);

  const visibleMatches = matches;

  function formatBattingRow(player: LivePlayerScore) {
    return {
      name: player.playerName,
      runs: player.runs ?? 0,
      balls: player.ballsFaced ?? 0,
      fours: player.fours ?? 0,
      sixes: player.sixes ?? 0,
      sr: player.strikeRate ?? 0,
      out: player.isOut,
    };
  }

  function formatBowlingRow(player: LivePlayerScore) {
    return {
      name: player.playerName,
      overs: player.oversBowled ?? 0,
      maidens: player.maidenOvers ?? 0,
      runs: player.runsConceded ?? 0,
      wickets: player.wickets ?? 0,
      econ: player.economy ?? 0,
    };
  }

  function getTeamTotals(players: LivePlayerScore[]) {
    const battingRuns = players.reduce((sum, p) => sum + (p.runs ?? 0), 0);
    const wickets = players.filter((p) => p.isOut).length;
    const balls = players.reduce((sum, p) => sum + (p.ballsFaced ?? 0), 0);
    const overs = `${Math.floor(balls / 6)}.${balls % 6}`;
    return { battingRuns, wickets, overs };
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-8">
      <h1 className="hidden md:block font-display font-black text-3xl mb-6">🏏 Matches</h1>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-[#F4F1EC] animate-pulse rounded-2xl" />)}
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl font-bold">{error}</div>
      ) : isStatsView && statsMatchId && (scoreLoading || selectedMatch) ? (
        <div className="space-y-4">
          {scoreLoading ? (
            <div className="h-52 bg-[#F4F1EC] animate-pulse rounded-2xl" />
          ) : (
            <>
              <div
                className="bg-gradient-to-br from-[#1A1208] to-[#2D2010] rounded-2xl p-4 text-white"
                style={{ borderTop: `3px solid ${selectedMatch?.status === "LIVE" ? "#EF4444" : "#EA4800"}` }}
              >
                <p className="text-[0.7rem] font-black tracking-wider uppercase text-white/70">
                  {selectedMatch?.status} · {selectedMatch?.format ?? "CRICKET"}
                </p>
                <p className="font-display font-black text-xl mt-1">
                  {selectedMatch?.team1Name} vs {selectedMatch?.team2Name}
                </p>
                <p className="text-xs text-white/70 mt-1">Live Scorecard</p>
              </div>

              {[
                { teamName: selectedMatch?.team1Name ?? "Team 1", batting: team1Scores, bowling: team2Scores },
                { teamName: selectedMatch?.team2Name ?? "Team 2", batting: team2Scores, bowling: team1Scores },
              ].map((team) => {
                const totals = getTeamTotals(team.batting);
                const battingRows = team.batting.map(formatBattingRow).sort((a, b) => b.runs - a.runs);
                const bowlingRows = team.bowling
                  .map(formatBowlingRow)
                  .filter((b) => b.overs > 0 || b.wickets > 0 || b.runs > 0);

                return (
                  <div key={team.teamName} className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl overflow-hidden">
                    <div className="bg-[#F4F1EC] px-4 py-3 border-b border-[#E8E0D4]">
                      <p className="font-display font-black text-lg text-[#1A1208]">{team.teamName}</p>
                      <p className="text-xs text-[#7A6A55]">{totals.battingRuns}/{totals.wickets} ({totals.overs} ov)</p>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-xs font-black uppercase tracking-wider text-[#7A6A55] mb-2">Batting</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-[#7A6A55]">
                            <tr>
                              <th className="text-left py-1">Batter</th>
                              <th className="text-right py-1">R</th>
                              <th className="text-right py-1">B</th>
                              <th className="text-right py-1">4s</th>
                              <th className="text-right py-1">6s</th>
                              <th className="text-right py-1">SR</th>
                            </tr>
                          </thead>
                          <tbody>
                            {battingRows.map((p) => (
                              <tr key={p.name} className="border-t border-[#F0E9DE]">
                                <td className="py-1.5 pr-2 text-[#1A1208] font-semibold">{p.name}{!p.out ? "*" : ""}</td>
                                <td className="py-1.5 text-right">{p.runs}</td>
                                <td className="py-1.5 text-right">{p.balls}</td>
                                <td className="py-1.5 text-right">{p.fours}</td>
                                <td className="py-1.5 text-right">{p.sixes}</td>
                                <td className="py-1.5 text-right">{Number(p.sr).toFixed(1)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <p className="text-xs font-black uppercase tracking-wider text-[#7A6A55] mt-4 mb-2">Bowling</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-[#7A6A55]">
                            <tr>
                              <th className="text-left py-1">Bowler</th>
                              <th className="text-right py-1">O</th>
                              <th className="text-right py-1">M</th>
                              <th className="text-right py-1">R</th>
                              <th className="text-right py-1">W</th>
                              <th className="text-right py-1">Econ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bowlingRows.length === 0 ? (
                              <tr><td colSpan={6} className="py-2 text-[#7A6A55]">No bowling stats yet.</td></tr>
                            ) : bowlingRows.map((b) => (
                              <tr key={b.name} className="border-t border-[#F0E9DE]">
                                <td className="py-1.5 pr-2 text-[#1A1208] font-semibold">{b.name}</td>
                                <td className="py-1.5 text-right">{Number(b.overs).toFixed(1)}</td>
                                <td className="py-1.5 text-right">{b.maidens}</td>
                                <td className="py-1.5 text-right">{b.runs}</td>
                                <td className="py-1.5 text-right">{b.wickets}</td>
                                <td className="py-1.5 text-right">{Number(b.econ).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      ) : visibleMatches.length === 0 ? (
        <div className="bg-white border-[1.5px] border-[#E8E0D4] p-12 rounded-2xl text-center">
          <span className="text-4xl mb-3 block">🏏</span>
          <p className="font-display font-bold text-lg mb-1">No Matches Right Now</p>
          <p className="text-[#7A6A55] text-sm">Check back later for upcoming fixtures!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleMatches.map(m => (
            <div
              key={matchId(m)}
              onClick={() => handleOpenMatch(m)}
              className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl p-4 cursor-pointer hover:-translate-y-1 hover:border-[#EA4800] hover:shadow-lg transition-all"
              style={{ borderTopWidth: 3, borderTopColor: m.status === "LIVE" ? "#EF4444" : "#EA4800" }}
            >
              <div className="flex justify-between items-center mb-4">
                <span className="text-[0.65rem] font-black tracking-wider uppercase bg-[#F4F1EC] px-2 py-0.5 rounded text-[#7A6A55]">
                  {m.format ?? "CRICKET"}
                </span>
                {m.status === "LIVE" && (
                  <span className="text-[0.65rem] font-black tracking-wider uppercase bg-red-100 text-red-600 px-2 py-0.5 rounded border border-red-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" /> LIVE
                  </span>
                )}
                {m.status === "UPCOMING" && (
                  <span className="text-[0.65rem] font-black tracking-wider uppercase text-[#1A1208]">
                    {matchTime(m)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between mb-2">
                <div className="font-display font-black text-xl">{m.team1Name}</div>
                <div className="text-[#B0A090] font-bold text-sm">vs</div>
                <div className="font-display font-black text-xl">{m.team2Name}</div>
              </div>
              <div className="h-px bg-[#E8E0D4] my-3" />
              <div className="flex justify-between items-center">
                <div className="text-xs text-[#7A6A55] font-semibold">Prize Pool</div>
                <div className="font-bold text-[#EA4800]">₹{(m.prizePool ?? 0).toLocaleString("en-IN")}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
