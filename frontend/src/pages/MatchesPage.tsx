import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import { extractLiveUpcomingMatches } from "@/lib/matches";
import { useApp } from "@/context/AppContext";
import { useAuthStore } from "@/store/authStore";
import type { MatchFromApi } from "@/types/api";
import type { Contest } from "@/components/contest/ContestCard";

export function MatchesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const urlMatchId = searchParams.get("matchId");
  const persistedMatchId = sessionStorage.getItem("selectedMatchId");
  const targetMatchId = urlMatchId ?? persistedMatchId;
  const token = useAuthStore((s) => s.token);
  const { toast } = useApp();
  const [matches, setMatches] = useState<MatchFromApi[]>([]);
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
        // Fetch all matches — backend doesn't support comma-separated status filter.
        // Filter LIVE and UPCOMING client-side.
        const res = await api.get("/matches?limit=50");
        const all: MatchFromApi[] = res.data?.data?.matches ?? [];
        setMatches(all.filter((m) => m.status === "LIVE" || m.status === "UPCOMING"));
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

    navigate(`/matches/${id}`);
  }

  useEffect(() => {
    if (urlMatchId) sessionStorage.setItem("selectedMatchId", urlMatchId);
  }, [urlMatchId]);

  const visibleMatches = targetMatchId
    ? matches.filter((m) => (m.id ?? m._id ?? "") === targetMatchId)
    : matches;

  const contestsTabTo = targetMatchId
    ? `/contests?matchId=${encodeURIComponent(targetMatchId)}`
    : "/contests";
  const myContestsTabTo = targetMatchId
    ? `/joined-contests?matchId=${encodeURIComponent(targetMatchId)}`
    : "/joined-contests";
  const teamsTabTo = targetMatchId
    ? `/teams?matchId=${encodeURIComponent(targetMatchId)}`
    : "/teams";
  const statsTabTo = targetMatchId
    ? `/matches?matchId=${encodeURIComponent(targetMatchId)}`
    : "/matches";

  const mobileTabs = [
    { label: "Contests", icon: "🏆", to: contestsTabTo, requireAuth: false },
    { label: "My Contests", icon: "🎯", to: myContestsTabTo, requireAuth: true },
    { label: "Teams", icon: "👕", to: teamsTabTo, requireAuth: true },
    { label: "Stats", icon: "📊", to: statsTabTo, requireAuth: false },
  ];

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-8">
      <h1 className="font-display font-black text-3xl mb-6">🏏 Matches</h1>

      <div className="md:hidden mb-5">
        <div className="grid grid-cols-4 gap-2">
          {mobileTabs.map((tab) => {
            const isActive = tab.label === "Contests"
              ? location.pathname === "/contests"
              : tab.label === "My Contests"
              ? location.pathname === "/joined-contests"
              : tab.label === "Teams"
              ? location.pathname === "/teams"
              : tab.label === "Stats"
              ? location.pathname === "/matches"
              : location.pathname === tab.to;
            return (
              <button
                key={tab.label}
                onClick={() => {
                  if (isActive) return;
                  if (tab.requireAuth && !token) {
                    toast({ type: "info", icon: "🔒", msg: "Please login to continue" });
                    navigate("/login");
                    return;
                  }
                  navigate(tab.to);
                }}
                className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-2xl border-[1.5px] transition-all ${isActive
                  ? "bg-[#EA4800] border-[#EA4800] text-white shadow-[0_4px_14px_rgba(234,72,0,.30)]"
                  : "bg-white border-[#E8E0D4] text-[#7A6A55] hover:border-[#EA4800] hover:text-[#EA4800]"
                  }`}
              >
                <span className="text-lg leading-none">{tab.icon}</span>
                <span className="text-[0.65rem] font-extrabold leading-none whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-[#F4F1EC] animate-pulse rounded-2xl" />)}
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl font-bold">{error}</div>
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
