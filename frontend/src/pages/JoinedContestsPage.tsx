import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import { useApp } from "@/context/AppContext";
import type { MatchFromApi, TeamFromApi } from "@/types/api";
import { Button } from "@/components/ui/button";
import { CreateTeamModal } from "@/components/createteam/CreateTeamModal";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

interface JoinedContestItem {
  entryId: string;
  joinedAt: string;
  livePoints: number;
  liveRank: number;
  finalPoints: number;
  finalRank: number;
  contest: {
    id: string;
    name: string;
    entryFee: number;
    prizePool: number;
    status: string;
    filledSpots?: number;
    totalSpots?: number;
    availableSpots?: number;
    fillPercentage?: number;
    maxEntriesPerUser?: number;
  };
  team: TeamFromApi;
  match?: MatchFromApi;
}

export function JoinedContestsPage() {
  const { toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlMatchId = searchParams.get("matchId");
  const token = useAuthStore((s) => s.token);
  const persistedMatchId = sessionStorage.getItem("selectedMatchId");
  const targetMatchId = urlMatchId ?? persistedMatchId;
  const contestTabTo = targetMatchId
    ? `/contests?matchId=${encodeURIComponent(targetMatchId)}`
    : "/contests";
  const myContestsTabTo = targetMatchId
    ? `/joined-contests?matchId=${encodeURIComponent(targetMatchId)}`
    : "/joined-contests";
  const teamsTabTo = targetMatchId
    ? `/teams?matchId=${encodeURIComponent(targetMatchId)}`
    : "/teams";
  const statsTabTo = targetMatchId
    ? `/matches?view=stats&matchId=${encodeURIComponent(targetMatchId)}`
    : "/matches?view=stats";

  const [items, setItems] = useState<JoinedContestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<JoinedContestItem | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get("/users/joined-contests");
      const contests: JoinedContestItem[] = res.data?.data?.contests ?? [];
      setItems(contests);
    } catch (err) {
      toast({ type: "error", icon: "❌", msg: getErrorMessage(err, "Failed to load joined contests") });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(() => load(true), 8000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (urlMatchId) sessionStorage.setItem("selectedMatchId", urlMatchId);
  }, [urlMatchId]);

  const sorted = useMemo(() => {
    const ordered = [...items].sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime());
    if (!targetMatchId) return ordered;
    return ordered.filter((item) => {
      const itemMatchId = item.match?.id ?? item.match?._id ?? item.team?.matchId ?? null;
      return itemMatchId === targetMatchId;
    });
  }, [items, targetMatchId]);

  function formatPrize(amount: number): string {
    if (amount >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(0)} Cr`;
    if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(0)}L`;
    if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(0)}K`;
    return `₹${amount.toLocaleString("en-IN")}`;
  }

  const mobileTabs = [
    { label: "Contests", icon: "🏆", to: contestTabTo, requireAuth: false },
    { label: "My Contests", icon: "🎯", to: myContestsTabTo, requireAuth: true },
    { label: "Teams", icon: "👕", to: teamsTabTo, requireAuth: true },
    { label: "Stats", icon: "📊", to: statsTabTo, requireAuth: false },
  ];

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-8">
      {/* Desktop header */}
      <div className="hidden md:flex items-center justify-between mb-6">
        <h1 className="font-display font-black text-3xl">🎯 Joined Contests</h1>
        <div className="flex items-center gap-2">
          {urlMatchId && (
            <Button
              variant="outline"
              onClick={() => {
                searchParams.delete("matchId");
                setSearchParams(searchParams);
              }}
            >
              Clear Filter
            </Button>
          )}
          <Button variant="outline" onClick={() => load()}>Refresh</Button>
        </div>
      </div>

      {/* Mobile tab strip */}
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

      {/* Mobile refresh button */}
      <div className="md:hidden flex justify-end mb-4">
        <div className="flex items-center gap-2">
          {urlMatchId && (
            <button
              onClick={() => {
                searchParams.delete("matchId");
                setSearchParams(searchParams);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-[1.5px] border-[#E8E0D4] text-xs font-bold text-[#7A6A55] hover:border-[#EA4800] hover:text-[#EA4800] transition-all"
            >
              Clear Filter
            </button>
          )}
          <button
            onClick={() => load()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-[1.5px] border-[#E8E0D4] text-xs font-bold text-[#7A6A55] hover:border-[#EA4800] hover:text-[#EA4800] transition-all"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-44 bg-[#F4F1EC] rounded-2xl animate-pulse" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl p-12 text-center">
          <p className="text-5xl mb-3">🏆</p>
          <p className="font-display font-bold text-xl text-[#3D3020] mb-2">No Joined Contests Yet</p>
          <p className="text-[#7A6A55] text-sm">Join a contest first to track rank and edit team before match starts.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((item) => {
            const isEditable = item.match?.status === "UPCOMING" && !!item.match;
            const matchStatus = (item.match?.status ?? "").toUpperCase();
            const contestStatus = (item.contest?.status ?? "").toUpperCase();
            const canViewLive = matchStatus === "LIVE" && !["COMPLETED", "CANCELLED"].includes(contestStatus);
            const canCheckRank = contestStatus === "COMPLETED";
            const team1Name = item.match?.team1Name ?? "Team 1";
            const team2Name = item.match?.team2Name ?? "Team 2";
            const format = item.match?.format ?? "CRICKET";
            const filled = Math.max(0, Math.min(100, Number(item.contest.fillPercentage ?? 0)));
            const totalSpots = Number(item.contest.totalSpots ?? 0);
            const filledSpots = Number(item.contest.filledSpots ?? 0);
            const availableSpots = Number(item.contest.availableSpots ?? Math.max(0, totalSpots - filledSpots));
            return (
              <div
                key={item.entryId}
                className="bg-white rounded-2xl overflow-hidden shadow-sm border-[1.5px] border-[#E8E0D4]"
              >
                <div className="h-[3px] bg-[#EA4800]" />

                <div className="bg-[#F4F1EC] border-b-[1.5px] border-[#E8E0D4] px-4 py-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[0.72rem] font-black tracking-wider text-[#7A6A55] uppercase">{format}</p>
                    <p className="font-display font-black text-lg">{item.contest.name}</p>
                  </div>
                  <span className={`text-[0.7rem] font-black px-3 py-1 rounded-full border uppercase tracking-wide ${
                    matchStatus === "LIVE"
                      ? "bg-red-100 text-red-700 border-red-200"
                      : matchStatus === "COMPLETED"
                      ? "bg-blue-100 text-blue-700 border-blue-200"
                      : "bg-amber-100 text-amber-700 border-amber-200"
                  }`}>
                    {matchStatus}
                  </span>
                </div>

                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-center min-w-[88px]">
                      <p className="font-display font-black text-lg text-[#1A1208]">{team1Name.split(" ")[0]}</p>
                    </div>
                    <div className="text-center">
                      <p className="font-display font-black text-4xl text-[#D0C3B3] leading-none">VS</p>
                      <p className="text-[0.8rem] font-bold text-[#7A6A55] mt-1 uppercase tracking-wide">{matchStatus}</p>
                    </div>
                    <div className="text-center min-w-[88px]">
                      <p className="font-display font-black text-lg text-[#1A1208]">{team2Name.split(" ")[0]}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="rounded-xl border border-[#E8E0D4] bg-[#FAFAF8] p-3">
                      <p className="text-[0.65rem] uppercase tracking-wide text-[#7A6A55] font-bold">Prize</p>
                      <p className="font-display font-black text-[#EA4800] text-2xl">{formatPrize(item.contest.prizePool)}</p>
                    </div>
                    <div className="rounded-xl border border-[#E8E0D4] bg-[#FAFAF8] p-3">
                      <p className="text-[0.65rem] uppercase tracking-wide text-[#7A6A55] font-bold">Entry</p>
                      <p className="font-display font-black text-[#1A1208] text-2xl">{item.contest.entryFee === 0 ? "FREE" : `₹${item.contest.entryFee}`}</p>
                    </div>
                    <div className="rounded-xl border border-[#E8E0D4] bg-[#FAFAF8] p-3">
                      <p className="text-[0.65rem] uppercase tracking-wide text-[#7A6A55] font-bold">Max Teams</p>
                      <p className="font-display font-black text-[#1A1208] text-2xl">{item.contest.maxEntriesPerUser ?? 1}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[#7A6A55] font-semibold mb-2">
                    <span>{filled}% filled</span>
                    <span>{availableSpots} spots left</span>
                  </div>
                  <div className="h-3 bg-[#F0EBE1] rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-[#EA4800]" style={{ width: `${filled}%` }} />
                  </div>

                  {(canViewLive || canCheckRank) ? (
                    <button
                      onClick={() => navigate(`/contests/${item.contest.id}/live`)}
                      className="w-full rounded-2xl py-3 text-lg font-black bg-gradient-to-br from-[#EA4800] to-[#FF5A1A] text-white"
                    >
                      View Rank
                    </button>
                  ) : (
                    <button
                      disabled={!isEditable}
                      onClick={() => {
                        if (!isEditable || !item.match) return;
                        setEditing(item);
                        setShowEdit(true);
                      }}
                      className={`w-full rounded-2xl py-3 text-lg font-black ${isEditable ? "bg-gradient-to-br from-[#EA4800] to-[#FF5A1A] text-white" : "bg-[#E8E0D4] text-[#7A6A55]"}`}
                    >
                      {isEditable ? "Edit Team" : "Locked"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <CreateTeamModal
          show={showEdit}
          onClose={() => { setShowEdit(false); setEditing(null); }}
          match={editing?.match ?? null}
          mode="edit"
          initialTeam={editing.team}
          onSaved={() => {
            setShowEdit(false);
            setEditing(null);
            load(true);
            toast({ type: "success", icon: "✅", msg: "Team updated successfully." });
          }}
          addToast={toast}
        />
      )}
    </div>
  );
}
