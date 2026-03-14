import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import { useMatchWebSocket } from "@/hooks/useMatchWebSocket";
import { useApp } from "@/context/AppContext";
import { useAuthStore } from "@/store/authStore";
import type { MatchFromApi } from "@/types/api";

interface PlayerScore {
  playerId: string;
  playerName: string;
  playerRole: string;
  fantasyPoints: number;
}

export function MatchDetailPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { toast } = useApp();
  const user = useAuthStore(s => s.user);
  const token = useAuthStore(s => s.token);

  const [match, setMatch] = useState<MatchFromApi | null>(null);
  const [scores, setScores] = useState<PlayerScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Connect to WS
  const ws = useMatchWebSocket(matchId ?? null);

  useEffect(() => {
    if (!matchId) return;

    if (!token) {
      toast({ type: "info", icon: "🔒", msg: "Please login first to view match details" });
      navigate("/login", { replace: true });
      return;
    }

    async function load() {
      try {
        const [mRes, sRes] = await Promise.all([
          api.get(`/matches/${matchId}`),
          api.get(`/scores/match/${matchId}`)
        ]);
        setMatch(mRes.data?.data?.match);
        setScores(sRes.data?.data?.scores ?? []);
        // Note: For real leaderboards you need a contestId, so we will show the WS leaderboards instead if available
      } catch (err) {
        setError(getErrorMessage(err, "Failed to load match details"));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [matchId, navigate, toast, token]);

  if (loading) return <div className="p-12 text-center text-[#7A6A55] font-bold">Loading match details...</div>;
  if (error || !match) return <div className="p-12 text-center text-red-500 font-bold">{error ?? "Match not found"}</div>;

  // Merge WS scores into initial fetch
  const displayScores = scores.map(s => {
    const livePts = ws.pointsMap.get(s.playerId);
    return livePts !== undefined ? { ...s, fantasyPoints: livePts } : s;
  }).sort((a,b) => b.fantasyPoints - a.fantasyPoints);

  // We only show the first leaderboard from WS if running
  const liveLeaderboard = ws.leaderboards[0]?.entries ?? [];

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-8">
      
      <button onClick={() => navigate("/matches")} className="text-sm font-bold text-[#EA4800] mb-4 hover:underline">
        ← Back to Matches
      </button>

      {/* Match Header */}
      <div className="bg-hero rounded-2xl overflow-hidden relative mb-6" style={{ background: "linear-gradient(135deg,#1A1208,#2D2010)", borderTop: `3px solid ${match.status === "LIVE" ? "#EF4444" : "#EA4800"}` }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 500px 300px at 50% 50%, rgba(234,72,0,.15) 0%, transparent 80%)" }} />
        <div className="relative p-6 md:p-10 text-center">
          <div className="flex justify-center mb-4">
            <span className={`text-[0.65rem] font-black tracking-wider uppercase px-3 py-1 rounded-full border ${match.status === "LIVE" ? "bg-red-500/20 text-red-400 border-red-500/30 flex items-center gap-1.5" : "bg-white/10 text-white/70 border-white/20"}`}>
              {match.status === "LIVE" && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
              {match.status} • {match.format}
            </span>
          </div>
          <div className="flex items-center justify-center gap-6 md:gap-12 mb-2">
            <div className="font-display font-black text-3xl md:text-5xl text-white">{match.team1Name}</div>
            <div className="text-[#B0A090] font-black text-xl italic">VS</div>
            <div className="font-display font-black text-3xl md:text-5xl text-white">{match.team2Name}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Player Scores */}
        <div className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl shadow-sm overflow-hidden" style={{ borderTopWidth: 3, borderTopColor: "#EA4800" }}>
          <div className="bg-[#F4F1EC] border-b-[1.5px] border-[#E8E0D4] px-5 py-3.5 flex justify-between items-center">
            <span className="font-display font-bold text-base">Top Players</span>
            {ws.connected && <span className="text-[0.6rem] font-black uppercase text-green-600 bg-green-100 px-2 py-0.5 rounded flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> Live</span>}
          </div>
          <div className="p-0">
            {displayScores.length === 0 ? (
              <div className="p-8 text-center text-[#7A6A55] text-sm">No player scores available yet.</div>
            ) : (
              displayScores.slice(0, 10).map((s, i) => (
                <div key={s.playerId} className="flex justify-between items-center px-5 py-3 border-b border-[#E8E0D4] last:border-b-0">
                  <div className="flex items-center gap-3">
                    <div className="w-6 text-center text-[#B0A090] font-bold text-xs">{i + 1}</div>
                    <div>
                      <div className="font-bold text-sm text-[#1A1208]">{s.playerName}</div>
                      <div className="text-[0.65rem] text-[#7A6A55] uppercase">{s.playerRole}</div>
                    </div>
                  </div>
                  <div className="font-display font-black text-[#EA4800] text-lg">{s.fantasyPoints} <span className="text-[0.6rem] text-[#B0A090]">PTS</span></div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Leaderboard */}
        <div className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl shadow-sm overflow-hidden" style={{ borderTopWidth: 3, borderTopColor: "#EA4800" }}>
          <div className="bg-[#F4F1EC] border-b-[1.5px] border-[#E8E0D4] px-5 py-3.5 flex justify-between items-center">
            <span className="font-display font-bold text-base">Contest Leaderboard</span>
          </div>
          <div className="p-0">
            {liveLeaderboard.length === 0 && match.status !== "LIVE" ? (
              <div className="p-8 text-center text-[#7A6A55] text-sm">Leaderboard will appear when match goes LIVE.</div>
            ) : liveLeaderboard.length === 0 ? (
              <div className="p-8 text-center text-[#7A6A55] text-sm">No entries yet or waiting for WS sync.</div>
            ) : (
              liveLeaderboard.map((entry) => (
                <div key={entry.teamId} className={`flex justify-between items-center px-5 py-3 border-b border-[#E8E0D4] last:border-b-0 ${entry.userId === user?.id ? "bg-[#FFF0EA]" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#1A1208] text-white flex justify-center items-center font-black text-xs">{entry.rank}</div>
                    <div>
                      <div className="font-bold text-sm text-[#1A1208] flex items-center gap-1.5">
                        {entry.userName}
                        {entry.userId === user?.id && <span className="text-[0.6rem] font-black uppercase text-white bg-[#EA4800] px-1.5 py-0.5 rounded">You</span>}
                      </div>
                      <div className="text-[0.65rem] text-[#7A6A55]">Team ID: {entry.teamId.slice(-6)}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-black text-[#EA4800] text-lg">{entry.livePoints}</div>
                    {entry.pointsDelta > 0 && <div className="text-[0.65rem] text-green-600 font-bold">+{entry.pointsDelta}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
