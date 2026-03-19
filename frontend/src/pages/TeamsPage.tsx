import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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

export function TeamsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast, refreshWallet, setWalletBalance } = useApp();

  const urlMatchId = searchParams.get("matchId");
  const urlContestId = searchParams.get("contestId");

  const [teams,   setTeams]   = useState<TeamFromApi[]>([]);
  const [matches, setMatches] = useState<MatchFromApi[]>([]);
  const [loading, setLoading] = useState(true);

  const [createModal, setCreateModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchFromApi | null>(null);
  const [editingTeam, setEditingTeam] = useState<TeamFromApi | null>(null);
  const [viewTeam, setViewTeam] = useState<TeamFromApi | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [joinLockedByMatch, setJoinLockedByMatch] = useState(false);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);
  const [joinedTeamIds, setJoinedTeamIds] = useState<Set<string>>(new Set());

  // WebSocket for the most recently selected live match
  const liveMatchId = matches.find((m) => m.status === "LIVE")?.id ?? null;
  const { pointsMap, connected } = useMatchWebSocket(liveMatchId);

  async function loadData() {
    setLoading(true);
    try {
      const [teamsRes, matchesRes, joinedRes] = await Promise.all([
        api.get("/users/my-teams"),
        api.get("/matches?limit=20"),
        api.get("/users/joined-contests"),
      ]);
      setTeams(teamsRes.data?.data?.teams ?? []);
      const joinedItems: Array<{ team?: { id?: string; _id?: string }; contest?: { status?: string } }> = joinedRes.data?.data?.contests ?? [];
      const ids = new Set<string>();
      for (const item of joinedItems) {
        const contestStatus = (item?.contest?.status ?? "").toUpperCase();
        const isActiveContest = contestStatus === "OPEN" || contestStatus === "FULL" || contestStatus === "CLOSED" || contestStatus === "DRAFT";
        if (!isActiveContest) continue;
        const id = item?.team?.id ?? item?.team?._id;
        if (id) ids.add(id);
      }
      setJoinedTeamIds(ids);
      const allMatchesRaw: MatchFromApi[] = matchesRes.data?.data?.matches ?? [];
      if (urlContestId && urlMatchId) {
        const currentMatch = allMatchesRaw.find((m) => (m.id ?? m._id) === urlMatchId);
        setJoinLockedByMatch(!!currentMatch && currentMatch.status !== "UPCOMING");
      } else {
        setJoinLockedByMatch(false);
      }

      let allMatches = allMatchesRaw;
      allMatches = allMatches.filter((m: MatchFromApi) => m.status === "UPCOMING");
      if (urlMatchId) {
        allMatches = allMatches.filter((m: MatchFromApi) => (m.id ?? m._id) === urlMatchId);
      }
      setMatches(allMatches);
    } catch (err) {
      toast({ type: "error", icon: "❌", msg: getErrorMessage(err, "Failed to load data") });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  function openCreateModal(match: MatchFromApi) {
    setSelectedMatch(match);
    setCreateModal(true);
  }

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
        next.add(teamId);
        return next;
      });
      if (typeof res.data?.data?.newBalance === "number") {
        setWalletBalance(res.data.data.newBalance);
      }
      refreshWallet();
      setTimeout(() => navigate("/teams"), 2000); // go back to my teams after success
    } catch (err) {
      toast({ type: "error", icon: "❌", msg: getErrorMessage(err, "Error joining contest") });
    } finally {
      setJoining(null);
    }
  }

  async function handleDeleteTeam(teamId: string, teamName: string) {
    if (joinedTeamIds.has(teamId)) {
      toast({ type: "info", icon: "ℹ️", msg: "This team is joined in an active contest and cannot be deleted." });
      return;
    }

    const ok = window.confirm(`Delete team "${teamName}"?\n\nThis action cannot be undone.`);
    if (!ok) return;

    setDeletingTeamId(teamId);
    try {
      const res = await api.delete(`/users/team/${teamId}`);
      toast({ type: "success", icon: "🗑️", msg: res.data?.message ?? "Team deleted successfully." });
      setTeams((prev) => prev.filter((t) => (t.id ?? t._id) !== teamId));
      setJoinedTeamIds((prev) => {
        const next = new Set(prev);
        next.delete(teamId);
        return next;
      });
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
  }

  const ROLE_COLOR: Record<string, { bg: string; text: string }> = {
    BATSMAN:       { bg: "#E8F5E9", text: "#2E7D32" },
    BOWLER:        { bg: "#FFEBEE", text: "#C62828" },
    ALL_ROUNDER:   { bg: "#E3F2FD", text: "#1565C0" },
    WICKET_KEEPER: { bg: "#FFF8E1", text: "#E65100" },
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-black text-3xl">
            {urlContestId ? "Select Team to Join" : "My Teams"}
          </h1>
          {urlContestId && <p className="text-[#7A6A55] text-sm mt-1">Pick a team below or create a new one to join this contest.</p>}
          {connected && liveMatchId && !urlContestId && (
            <p className="text-xs text-green-600 font-semibold flex items-center gap-1 mt-1">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />
              Live points updating via WebSocket
            </p>
          )}
        </div>
        {!urlContestId && <Button onClick={() => navigate("/contests")}>+ Join Contest</Button>}
      </div>

      {/* Pick an upcoming match to create team */}
      {matches.length > 0 && (
        <div className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl overflow-hidden shadow-sm mb-6" style={{ borderTopWidth: 3, borderTopColor: "#EA4800" }}>
          <div className="bg-[#F4F1EC] border-b-[1.5px] border-[#E8E0D4] px-5 py-3.5">
            <span className="font-display font-bold text-base">🏏 Create Team (Upcoming Matches Only)</span>
          </div>
          <div className="p-5 flex flex-wrap gap-3">
            {matches.map((m) => (
              <button
                key={m.id ?? m._id}
                onClick={() => openCreateModal(m)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-[1.5px] border-[#E8E0D4] bg-white hover:border-[#EA4800] hover:bg-[#FFF0EA] transition-all text-sm font-bold"
              >
                <span>{m.team1Name}</span>
                <span className="text-[#7A6A55] font-normal">vs</span>
                <span>{m.team2Name}</span>
                {m.status === "LIVE" && (
                  <span className="px-1.5 py-0.5 rounded-full text-[0.6rem] font-black bg-red-100 text-red-600 border border-red-200">LIVE</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Teams list */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => <div key={i} className="h-40 bg-[#F4F1EC] rounded-2xl animate-pulse" />)}
        </div>
      ) : teams.length === 0 ? (
        <div className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl p-12 text-center" style={{ borderTopWidth: 3, borderTopColor: "#EA4800" }}>
          <p className="text-5xl mb-3">👕</p>
          <p className="font-display font-bold text-xl text-[#3D3020] mb-2">No Teams Yet</p>
          <p className="text-[#7A6A55] text-sm mb-6">Build your Dream XI and enter contests to win big prizes!</p>
          <Button size="lg" onClick={() => navigate("/matches")}>⚡ Browse Matches</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {teams
            .filter((t) => (urlMatchId ? t.matchId === urlMatchId : true))
            .map((t) => {
            const teamDocId = t.id ?? t._id ?? "";
            const isJoinedTeam = teamDocId ? joinedTeamIds.has(teamDocId) : false;
            // Try to get live points for the captain from WS
            const captainPlayer = t.players.find((p: any) => p.captainRole === "CAPTAIN");
            const livePoints = captainPlayer ? (pointsMap.get(captainPlayer.playerId) ?? null) : null;

            return (
              <div key={teamDocId} className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl overflow-hidden shadow-sm" style={{ borderTopWidth: 3, borderTopColor: "#EA4800" }}>
                <div className="bg-[#F4F1EC] border-b-[1.5px] border-[#E8E0D4] px-5 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="font-display font-black text-[1.05rem]">{t.teamName}</p>
                    {/* Only show contest ID if they are viewing all teams and it's joined */}
                    {!urlContestId && t.contestId && <p className="text-xs text-[#7A6A55]">Contest: {t.contestId}</p>}
                  </div>
                  <div className="flex gap-2">
                    {urlContestId ? (
                      isJoinedTeam ? (
                        <span className="inline-flex items-center px-3 py-1.5 rounded-lg border border-[#E8E0D4] bg-[#FAFAF8] text-xs font-bold text-[#7A6A55]">
                          Joined
                        </span>
                      ) : (
                        <Button size="sm" onClick={() => teamDocId && handleJoinContest(teamDocId)} disabled={!teamDocId || joining === teamDocId || joinLockedByMatch}>
                          {joinLockedByMatch ? "Locked" : joining === teamDocId ? "Joining..." : "Join Contest →"}
                        </Button>
                      )
                    ) : (
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
                        <Button size="sm" onClick={() => navigate(`/contests?matchId=${t.matchId || ''}&teamId=${teamDocId}`)} disabled={!t.matchId || !teamDocId}>
                          {t.matchId ? "Join Contest →" : "Invalid Legacy Team"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => teamDocId && handleDeleteTeam(teamDocId, t.teamName)}
                          disabled={!teamDocId || deletingTeamId === teamDocId || isJoinedTeam}
                          className={`${
                            isJoinedTeam
                              ? "text-[#7A6A55] border-[#E8E0D4]"
                              : "text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                          }`}
                        >
                          {isJoinedTeam ? "Joined" : deletingTeamId === teamDocId ? "Deleting..." : "Delete"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
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
                        <span key={p.playerId} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold" style={{ background: rc.bg, color: rc.text, border: `1px solid ${rc.bg}` }}>
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
          onClose={() => {
            setCreateModal(false);
            setSelectedMatch(null);
            setEditingTeam(null);
          }}
          match={selectedMatch}
          mode={editingTeam ? "edit" : "create"}
          initialTeam={editingTeam}
          onSaved={() => { 
            const wasEditing = !!editingTeam;
            const savedMatchId = selectedMatch?.id ?? selectedMatch?._id ?? undefined;
            setCreateModal(false); 
            setSelectedMatch(null);
            setEditingTeam(null);
            loadData(); 
            if (!wasEditing) {
              trackEvent("create_team", {
                match_id: savedMatchId,
                source: urlContestId ? "contest_join_flow" : "teams_page",
              });
            }
            if (editingTeam) {
              toast({ type: "success", icon: "✅", msg: "Team updated successfully!" });
            } else if (urlContestId) {
              toast({ type: "success", icon: "✅", msg: "Team created! Now click 'Join Contest' to enter." });
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
