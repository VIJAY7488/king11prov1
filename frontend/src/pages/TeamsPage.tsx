import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import { trackEvent } from "@/lib/analytics";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { CreateTeamModal } from "@/components/createteam/CreateTeamModal";
import { ViewTeamModal } from "@/components/team/ViewTeamModal";
import { useMatchWebSocket } from "@/hooks/useMatchWebSocket";
import type { MatchFromApi, TeamFromApi } from "@/types/api";
import { useAuthStore } from "@/store/authStore";

export function TeamsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { toast, refreshWallet, setWalletBalance } = useApp();
  const token = useAuthStore((s) => s.token);

  const urlMatchId = searchParams.get("matchId");
  const urlContestId = searchParams.get("contestId");
  const persistedMatchId = sessionStorage.getItem("selectedMatchId");
  const selectedContestMatchId = urlMatchId ?? persistedMatchId;
  const contestTabTo = selectedContestMatchId
    ? `/contests?matchId=${encodeURIComponent(selectedContestMatchId)}`
    : "/contests";
  const myContestsTabTo = selectedContestMatchId
    ? `/joined-contests?matchId=${encodeURIComponent(selectedContestMatchId)}`
    : "/joined-contests";
  const teamsTabTo = selectedContestMatchId
    ? `/teams?matchId=${encodeURIComponent(selectedContestMatchId)}`
    : "/teams";
  const statsTabTo = selectedContestMatchId
    ? `/matches?view=stats&matchId=${encodeURIComponent(selectedContestMatchId)}`
    : "/matches?view=stats";

  const [teams, setTeams] = useState<TeamFromApi[]>([]);
  const [matches, setMatches] = useState<MatchFromApi[]>([]);
  const [liveMatchId, setLiveMatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [createModal, setCreateModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchFromApi | null>(null);
  const [editingTeam, setEditingTeam] = useState<TeamFromApi | null>(null);
  const [viewTeam, setViewTeam] = useState<TeamFromApi | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [joinLockedByMatch, setJoinLockedByMatch] = useState(false);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);
  const [joinedTeamIds, setJoinedTeamIds] = useState<Set<string>>(new Set());

  // WebSocket should track a live match from the full backend list, not the filtered UPCOMING list.
  const { pointsMap, connected } = useMatchWebSocket(liveMatchId);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [teamsRes, matchesRes, joinedRes] = await Promise.all([
        api.get("/users/my-teams"),
        api.get("/matches?limit=20"),
        api.get("/users/joined-contests"),
      ]);
      setTeams(teamsRes.data?.data?.teams ?? []);

      const joinedItems: Array<{
        team?: { id?: string; _id?: string };
        contest?: { id?: string; status?: string };
      }> = joinedRes.data?.data?.contests ?? [];

      const joined = new Set<string>();

      for (const item of joinedItems) {
        const contestId = item?.contest?.id;
        const teamId = item?.team?.id ?? item?.team?._id;
        if (contestId && teamId) joined.add(`${contestId}::${teamId}`);
      }

      setJoinedTeamIds(joined);

      const allMatchesRaw: MatchFromApi[] = matchesRes.data?.data?.matches ?? [];
      const liveMatch = allMatchesRaw.find((m) => m.status === "LIVE");
      setLiveMatchId(liveMatch?.id ?? liveMatch?._id ?? null);
      if (urlContestId && urlMatchId) {
        const currentMatch = allMatchesRaw.find((m) => (m.id ?? m._id) === urlMatchId);
        setJoinLockedByMatch(!!currentMatch && currentMatch.status !== "UPCOMING");
      } else {
        setJoinLockedByMatch(false);
      }

      const allMatches = allMatchesRaw.filter((m: MatchFromApi) => m.status === "UPCOMING");
      setMatches(allMatches);

    } catch (err) {
      toast({ type: "error", icon: "❌", msg: getErrorMessage(err, "Failed to load data") });
    } finally {
      setLoading(false);
    }
  }, [toast, urlMatchId, urlContestId])

  useEffect(() => { loadData(); }, [loadData]);


  async function handleJoinContest(teamId: string) {
    if (!urlContestId) return;
    if (joinLockedByMatch) {
      toast({ type: "info", icon: "🔒", msg: "Contest is locked because the match is already live/started." });
      return;
    }
    setJoining(teamId);
    try {
      const res = await api.post("/users/join-contest", { contestId: urlContestId, teamId });
      trackEvent("join_contest", {
        contest_id: urlContestId,
        team_id: teamId,
        source: "teams_page",
      });
      toast({ type: "success", icon: "🎉", msg: res.data?.data?.message ?? "Successfully joined contest!" });
      setJoinedTeamIds((prev) => {
        const next = new Set(prev);
        next.add(`${urlContestId}::${teamId}`);
        return next;
      });

      if (typeof res.data?.data?.newBalance === "number") setWalletBalance(res.data.data.newBalance);

      refreshWallet();

    } catch (err) {
      toast({ type: "error", icon: "❌", msg: getErrorMessage(err, "Error joining contest") });
    } finally {
      setJoining(null);
    }
  }

  async function handleDeleteTeam(teamId: string, teamName: string) {

    const isInAnyContest = [...joinedTeamIds].some((key) => key.endsWith(`::${teamId}`));

    if (isInAnyContest) {
      toast({ type: "info", icon: "ℹ️", msg: "This team is joined in an active contest and cannot be deleted." });
      return;
    }

    const ok = window.confirm(`Delete team "${teamName}"?\n\nThis action cannot be undone.`);
    if (!ok) return;

    setDeletingTeamId(teamId);
    try {
      const res = await api.delete(`/users/team/${teamId}`);
      toast({ type: "success", icon: "🗑️", msg: res.data?.message ?? "Team deleted successfully." });
      loadData();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        toast({ type: "info", icon: "ℹ️", msg: "This team is joined in an active contest and cannot be deleted." });
      } else {
        toast({ type: "error", icon: "❌", msg: getErrorMessage(err, "Failed to delete team") });
      }
    } finally {
      setDeletingTeamId(null);
    }
  };

  // Open create modal using the matchId already in URL or team's matchId
  function openCreateForMatch() {
    const matchId = urlMatchId;
    if (!matchId) {
      toast({ type: "info", icon: "ℹ️", msg: "No match selected. Please join from a match." });
      return;
    }
    const match = matches.find((m) => (m.id ?? m._id) === matchId);
    if (!match) {
      toast({ type: "info", icon: "ℹ️", msg: "Match not found or already started." });
      return;
    }
    setSelectedMatch(match);
    setCreateModal(true);
  }

  const ROLE_COLOR: Record<string, { bg: string; text: string }> = {
    BATSMAN: { bg: "#E8F5E9", text: "#2E7D32" },
    BOWLER: { bg: "#FFEBEE", text: "#C62828" },
    ALL_ROUNDER: { bg: "#E3F2FD", text: "#1565C0" },
    WICKET_KEEPER: { bg: "#FFF8E1", text: "#E65100" },
  };

  const mobileTabs = [
    { label: "Contests", icon: "🏆", to: contestTabTo, requireAuth: false },
    { label: "My Contests", icon: "🎯", to: myContestsTabTo, requireAuth: true },
    { label: "Teams", icon: "👕", to: teamsTabTo, requireAuth: true },
    { label: "Stats", icon: "📊", to: statsTabTo, requireAuth: false },
  ];

  // Teams filtered to current match if urlMatchId present
  const visibleTeams = teams.filter((t) => (urlMatchId ? t.matchId === urlMatchId : true));

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-8">

      {/* ── Desktop header ── */}
      <div className="hidden md:flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-black text-3xl">
            {urlContestId ? "Pick a Team to Join" : "My Teams"}
          </h1>
          {urlContestId && (
            <p className="text-[#7A6A55] text-sm mt-1">
              Select a team below or create a new one — then click <strong>Join Contest →</strong>
            </p>
          )}
          {connected && liveMatchId && !urlContestId && (
            <p className="text-xs text-green-600 font-semibold flex items-center gap-1 mt-1">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />
              Live points updating via WebSocket
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {urlContestId && (
            <Button
              variant="outline"
              onClick={() => navigate(contestTabTo)}
            >
              ← Back to Contests
            </Button>
          )}
          {urlMatchId && (
            <Button onClick={openCreateForMatch}>+ Create New Team</Button>
          )}
          {!urlContestId && !urlMatchId && (
            <Button onClick={() => navigate(contestTabTo)}>+ Join Contest</Button>
          )}
        </div>
      </div>

      {/* ── Mobile tab strip ── */}
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

        {/* Mobile context title + actions */}
        <div className="mt-4 flex items-start justify-between gap-2">
          <div>
            <p className="font-display font-black text-xl">
              {urlContestId ? "Pick a Team to Join" : "My Teams"}
            </p>
            {urlContestId && (
              <p className="text-[#7A6A55] text-xs mt-0.5">
                Tap a team to join, or create a new one below.
              </p>
            )}
            {connected && liveMatchId && !urlContestId && (
              <p className="text-xs text-green-600 font-semibold flex items-center gap-1 mt-1">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />
                Live points updating
              </p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {urlContestId && (
              <button
                onClick={() => navigate(contestTabTo)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border-[1.5px] border-[#E8E0D4] text-xs font-bold text-[#7A6A55] hover:border-[#EA4800] hover:text-[#EA4800] transition-all"
              >
                ← Contests
              </button>
            )}
            {urlMatchId && (
              <button
                onClick={openCreateForMatch}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#EA4800] text-white text-xs font-bold shadow-[0_4px_12px_rgba(234,72,0,.25)] hover:bg-[#FF5A1A] transition-all"
              >
                + New Team
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Teams list */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => <div key={i} className="h-40 bg-[#F4F1EC] rounded-2xl animate-pulse" />)}
        </div>
      ) : visibleTeams.length === 0 ? (
        <div
          className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl p-12 text-center"
          style={{ borderTopWidth: 3, borderTopColor: "#EA4800" }}
        >
          <p className="text-5xl mb-3">👕</p>
          <p className="font-display font-bold text-xl text-[#3D3020] mb-2">No Teams Yet</p>
          <p className="text-[#7A6A55] text-sm mb-6">
            {urlMatchId
              ? "Create a team for this match to join the contest."
              : "Build your Dream XI and enter contests to win big prizes!"}
          </p>
          {urlMatchId ? (
            <Button size="lg" onClick={openCreateForMatch}>⚡ Create Team</Button>
          ) : (
            <Button size="lg" onClick={() => navigate("/matches")}>⚡ Browse Matches</Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {visibleTeams.map((t) => {
            const teamDocId = t.id ?? t._id ?? "";
            const isJoinedThisContest = teamDocId && urlContestId
              ? joinedTeamIds.has(`${urlContestId}::${teamDocId}`)
              : false;
            const isJoinedInAnyContest = teamDocId
              ? [...joinedTeamIds].some((key) => key.endsWith(`::${teamDocId}`))
              : false;
            const captainPlayer = t.players.find((p: any) => p.captainRole === "CAPTAIN");
            const livePoints = captainPlayer ? (pointsMap.get(captainPlayer.playerId) ?? null) : null;

            return (
              <div
                key={teamDocId}
                className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl overflow-hidden shadow-sm"
                style={{ borderTopWidth: 3, borderTopColor: "#EA4800" }}
              >
                {/* Card header */}
                <div className="bg-[#F4F1EC] border-b-[1.5px] border-[#E8E0D4] px-5 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="font-display font-black text-[1.05rem]">{t.teamName}</p>
                    {/* Show how many contests this team has joined */}
                    {isJoinedInAnyContest && (
                      <p className="text-[0.7rem] text-green-600 font-bold mt-0.5">
                        ✅ Joined {[...joinedTeamIds].filter((k) => k.endsWith(`::${teamDocId}`)).length} contest(s)
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {/* ── Join contest mode ── */}
                    {urlContestId ? (
                      isJoinedThisContest ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-xs font-bold text-green-700">
                          ✅ Joined
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => teamDocId && handleJoinContest(teamDocId)}
                          disabled={!teamDocId || joining === teamDocId || joinLockedByMatch}
                          className="bg-[#EA4800] hover:bg-[#FF5A1A] text-white"
                        >
                          {joinLockedByMatch ? "🔒 Locked" : joining === teamDocId ? "Joining..." : "Pick This Team →"}
                        </Button>
                      )
                    ) : (
                      /* ── My Teams mode ── */
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const match = matches.find((m) => (m.id ?? m._id) === t.matchId);
                            if (!match || match.status !== "UPCOMING") {
                              toast({ type: "info", icon: "ℹ️", msg: "Team can be edited only before match starts." });
                              return;
                            }
                            setSelectedMatch(match);
                            setEditingTeam(t);
                            setCreateModal(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => navigate(`/contests?matchId=${t.matchId || ''}&teamId=${teamDocId}`)}
                          disabled={!t.matchId || !teamDocId}
                        >
                          {t.matchId ? "Join Contest →" : "No Match"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => teamDocId && handleDeleteTeam(teamDocId, t.teamName)}
                          disabled={!teamDocId || deletingTeamId === teamDocId || isJoinedInAnyContest}
                          className={
                            isJoinedInAnyContest
                              ? "text-[#7A6A55] border-[#E8E0D4]"
                              : "text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                          }
                        >
                          {isJoinedInAnyContest
                            ? "In Contest"
                            : deletingTeamId === teamDocId
                              ? "Deleting..."
                              : "Delete"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Card body */}
                <div className="p-5">
                  <div className="flex justify-between mb-4 flex-wrap gap-3">
                    <div>
                      <div className="text-xs text-[#7A6A55] font-semibold mb-0.5">Captain (2×)</div>
                      <div className="font-bold text-yellow-600">
                        {t.players.find((p: any) => p.captainRole === "CAPTAIN")?.playerName ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#7A6A55] font-semibold mb-0.5">Vice Captain (1.5×)</div>
                      <div className="font-bold text-[#EA4800]">
                        {t.players.find((p: any) => p.captainRole === "VICE_CAPTAIN")?.playerName ?? "—"}
                      </div>
                    </div>
                    {livePoints !== null && (
                      <div>
                        <div className="text-xs text-[#7A6A55] font-semibold mb-0.5">Live C Pts</div>
                        <div className="font-display font-black text-2xl text-[#EA4800]">{livePoints}</div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.players.map((p: any) => {
                      const rc = ROLE_COLOR[p.playerRole] ?? { bg: "#F4F1EC", text: "#7A6A55" };
                      return (
                        <span
                          key={p.playerId}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold"
                          style={{ background: rc.bg, color: rc.text, border: `1px solid ${rc.bg}` }}
                        >
                          {p.playerName.split(" ").slice(-1)[0]}
                          {p.captainRole === "CAPTAIN" && <span className="text-yellow-600 font-black">C</span>}
                          {p.captainRole === "VICE_CAPTAIN" && <span className="font-black">VC</span>}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedMatch && (
        <CreateTeamModal
          show={createModal}
          onClose={() => { setCreateModal(false); setSelectedMatch(null); setEditingTeam(null); }}
          match={selectedMatch}
          mode={editingTeam ? "edit" : "create"}
          initialTeam={editingTeam}
          onSaved={() => {
            setCreateModal(false);
            setSelectedMatch(null);
            setEditingTeam(null);
            loadData();
            if (editingTeam) {
              toast({ type: "success", icon: "✅", msg: "Team updated successfully!" });
            } else if (urlContestId) {
              toast({ type: "success", icon: "✅", msg: "Team created! Now tap 'Pick This Team →' to enter." });
            } else {
              toast({ type: "success", icon: "✅", msg: "Team created! 🎉" });
            }
          }}
          addToast={toast}
        />
      )}

      <ViewTeamModal
        show={!!viewTeam}
        onClose={() => setViewTeam(null)}
        team={viewTeam as any}
        livePoints={undefined}
      />
    </div>
  );
}
