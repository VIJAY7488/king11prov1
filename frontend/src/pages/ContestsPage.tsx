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
            setTimeout(() => navigate("/joined-contests"), 2000);
        } catch (err) {
            toast({ type: "error", icon: "❌", msg: getErrorMessage(err, "Error joining contest") });
        } finally {
            setJoining(false);
        }
        return;
    }

    // Otherwise, they need to pick/create a team first
    navigate(`/teams?matchId=${c.matchId}&contestId=${c.id}`);
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-8">
      <div className="flex items-center justify-between mb-6">
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
            <ContestCard
              key={c.id}
              contest={c}
              onJoin={handleJoin}
            />
          ))}
        </div>
      )}
    </div>
  );
}
