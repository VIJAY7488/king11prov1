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
  const [playerPointsMap, setPlayerPointsMap] = useState<Map<string, number>>(new Map());


  const loadLivePlayerPoints = useCallback(async (contests: JoinedContestItem[]) => {
    const matchIds = [
      ...new Set(
        contests
          .filter((c) => {
            const status = (c.match?.status ?? "").toUpperCase();
            return status === "LIVE" || status === "COMPLETED";
          })
          .map((c) => c.match?.id)
          .filter(Boolean)
      ),
    ] as string[];

    if (!matchIds.length) { setPlayerPointsMap(new Map()); return; }

    try {
      const responses = await Promise.all(matchIds.map((id) => api.get(`/scores/match/${id}`)));
      const next = new Map<string, number>();
      for (const res of responses) {
        const all = [...(res.data?.data?.team1 ?? []), ...(res.data?.data?.team2 ?? [])];
        for (const p of all) {
          if (p?.playerId) next.set(p.playerId, Number(p.fantasyPoints ?? 0));
        }
      }
      setPlayerPointsMap(next);
    } catch {
      // keep existing map on failure
    }
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get("/users/joined-contests");
      const contests: JoinedContestItem[] = res.data?.data?.contests ?? [];
      setItems(contests);
      await loadLivePlayerPoints(contests);
    } catch (err) {
      toast({ type: "error", icon: "❌", msg: getErrorMessage(err, "Failed to load joined contests") });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [toast, loadLivePlayerPoints]);

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
            return (
              <div
                key={item.entryId}
                className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl overflow-hidden shadow-sm"
                style={{ borderTopWidth: 3, borderTopColor: "#EA4800" }}
              >
                <div className="bg-[#F4F1EC] border-b-[1.5px] border-[#E8E0D4] px-5 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="font-display font-black text-lg">{item.contest.name}</p>
                    <p className="text-xs text-[#7A6A55]">
                      {item.match?.team1Name ?? "Team 1"} vs {item.match?.team2Name ?? "Team 2"} · {item.contest.status}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => load(true)}>🔄 Rank</Button>
                    <Button
                      size="sm"
                      variant={isEditable ? "default" : "outline"}
                      disabled={!isEditable}
                      onClick={() => {
                        if (!item.match) return;
                        setEditing(item);
                        setShowEdit(true);
                      }}
                    >
                      {isEditable ? "Edit Team" : "Locked"}
                    </Button>
                  </div>
                </div>

                <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-[#FAFAF8] rounded-xl p-3 border border-[#E8E0D4]">
                    <div className="text-xs text-[#7A6A55] mb-1">Team</div>
                    <div className="font-bold">{item.team.teamName}</div>
                  </div>
                  <div className="bg-[#FFF0EA] rounded-xl p-3 border border-[#FFDDCC]">
                    <div className="text-xs text-[#7A6A55] mb-1">Live Rank</div>
                    <div className="font-display font-black text-2xl text-[#EA4800]">
                      #{item.liveRank > 0 ? item.liveRank : "—"}
                    </div>
                  </div>
                  <div className="bg-[#FAFAF8] rounded-xl p-3 border border-[#E8E0D4]">
                    <div className="text-xs text-[#7A6A55] mb-1">Live Points</div>
                    <div className="font-display font-black text-2xl">{item.livePoints ?? 0}</div>
                  </div>
                  <div className="bg-[#FAFAF8] rounded-xl p-3 border border-[#E8E0D4]">
                    <div className="text-xs text-[#7A6A55] mb-1">Entry Fee</div>
                    <div className="font-display font-black text-2xl">
                      {item.contest.entryFee === 0 ? "FREE" : `₹${item.contest.entryFee}`}
                    </div>
                  </div>
                </div>

                <div className="px-5 pb-5">
                  <div className="text-xs text-[#7A6A55] font-semibold mb-2">Live Player Points</div>
                  <div className="flex flex-wrap gap-2">
                    {(item.team.players ?? []).map((p: any) => {
                      const pts = playerPointsMap.get(p.playerId) ?? 0;
                      return (
                        <div
                          key={p.playerId}
                          className="px-2.5 py-1.5 rounded-lg border border-[#E8E0D4] bg-[#FAFAF8] text-xs"
                        >
                          <span className="font-bold text-[#1A1208]">{p.playerName}</span>
                          <span className="text-[#7A6A55]"> · {pts.toFixed(1)} pts</span>
                          {p.captainRole === "CAPTAIN" && <span className="ml-1 text-yellow-600 font-black">C</span>}
                          {p.captainRole === "VICE_CAPTAIN" && <span className="ml-1 text-[#EA4800] font-black">VC</span>}
                        </div>
                      );
                    })}
                  </div>
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
