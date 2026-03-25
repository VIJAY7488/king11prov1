import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import { trackEvent } from "@/lib/analytics";
import { useApp } from "@/context/AppContext";
import { useAuthStore } from "@/store/authStore";
import { ContestCard, type Contest } from "@/components/contest/ContestCard";

export function ContestsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlMatchId = searchParams.get("matchId");
  const urlTeamId = searchParams.get("teamId");

  const { toast, refreshWallet, setWalletBalance } = useApp();
  const token = useAuthStore((s) => s.token);

  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const query = urlMatchId ? `?matchId=${urlMatchId}&limit=50` : `?limit=50`;
        const res = await api.get(`/contests${query}`);
        const all: Contest[] = res.data?.data?.contests ?? [];
        setContests(all);
      } catch (err) {
        const msg = getErrorMessage(err, "Failed to load contests");
        setError(msg);
        toast({ type: "error", icon: "❌", msg });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [urlMatchId]);

  async function handleJoin(c: Contest) {
    trackEvent("view_contest", {
      contest_id: c.id,
      match_id: c.matchId,
      contest_status: c.status,
    });

    if (!token) {
      toast({ type: "info", icon: "🔒", msg: "Please login to join a contest" });
      navigate("/login");
      return;
    }

    const matchStatus = (c.match?.status ?? "UPCOMING").toUpperCase();
    const contestStatus = (c.status ?? "").toUpperCase();
    const canViewLive = matchStatus === "LIVE" && !["COMPLETED", "CANCELLED"].includes(contestStatus);
    const canCheckRank = contestStatus === "COMPLETED";

    if (canViewLive || canCheckRank) {
      navigate(`/contests/${c.id}/live`);
      return;
    }
    if (matchStatus !== "UPCOMING") {
      toast({ type: "info", icon: "🔒", msg: "Contest is locked because the match is already started." });
      return;
    }

    // If they came from the "My Teams" page by clicking "Join Contest", 
    // we already have their team context, so join immediately!
    if (urlTeamId) {
      if (joining) return; // prevent double-submit
      setJoining(true);
      try {
        const res = await api.post("/users/join-contest", { contestId: c.id, teamId: urlTeamId });
        trackEvent("join_contest", {
          contest_id: c.id,
          match_id: c.matchId,
          source: "contests_with_team",
        });
        toast({ type: "success", icon: "🎉", msg: res.data?.data?.message ?? "Successfully joined contest!" });
        if (typeof res.data?.data?.newBalance === "number") {
          setWalletBalance(res.data.data.newBalance);
        }
        refreshWallet();
        setTimeout(() => navigate("/teams"), 2000);
      } catch (err) {
        toast({ type: "error", icon: "❌", msg: getErrorMessage(err, "Error joining contest") });
      } finally {
        setJoining(false);
      }
      return;
    }

    // Otherwise, they need to pick/create a team first
    navigate(`/teams?matchId=${c.matchId}&contestId=${c.id}`);
  };

  const mobileTabs = [
    { label: "Contests", icon: "🏆", to: "/contests" },
    { label: "My Contests", icon: "🎯", to: "/joined-contests", requireAuth: true },
    { label: "Teams", icon: "👕", to: "/teams", requireAuth: true },
    { label: "Stats", icon: "📊", to: "/matches" },
  ];

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-8">
      {/* ── Desktop header ── */}
      <div className="hidden md:flex items-center justify-between mb-6">
        <h1 className="font-display font-black text-3xl">🏆 Contests</h1>
        {urlMatchId && (
          <button
            onClick={() => { searchParams.delete("matchId"); setSearchParams(searchParams); }}
            className="text-sm font-bold text-[#EA4800] hover:underline"
          >
            Clear Filter ✕
          </button>
        )}
      </div>

      {/* ── Mobile tab strip ── */}
      <div className="md:hidden mb-5">
        <div className="grid grid-cols-4 gap-2">
          {mobileTabs.map((tab) => {
            const isActive = location.pathname === tab.to;
            return (
              <button
                key={tab.label}
                onClick={() => {
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

      {/* ── Content ── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-64 bg-[#F4F1EC] animate-pulse rounded-3xl" />)}
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl font-bold text-center">{error}</div>
      ) : contests.length === 0 ? (
        <div className="bg-white border-[1.5px] border-[#E8E0D4] p-12 rounded-2xl text-center">
          <span className="text-4xl mb-3 block">🏟️</span>
          <p className="font-display font-bold text-lg mb-1">No Active Contests</p>
          <p className="text-[#7A6A55] text-sm">Check back later for new contests!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contests.map((c) => (
            <ContestCard key={c.id} contest={c} onJoin={handleJoin} />
          ))}
        </div>
      )}
    </div>
  );
}
