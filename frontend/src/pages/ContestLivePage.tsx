import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import { useApp } from "@/context/AppContext";
import { Modal } from "@/components/ui/modal";

interface LiveEntry {
  rank: number;
  userId: string;
  userName: string;
  teamId: string;
  teamName: string;
  livePoints: number;
  isCurrentUser: boolean;
}

interface LiveContestData {
  contestId: string;
  contestName: string;
  matchId: string;
  matchStatus: string;
  contestStatus: string;
  team1Name: string;
  team2Name: string;
  entries: LiveEntry[];
}

interface TeamBreakdownPlayer {
  playerId: string;
  playerName: string;
  playerRole: string;
  teamName: string;
  captainRole: "CAPTAIN" | "VICE_CAPTAIN" | "NONE" | string;
  basePoints: number;
  multiplier: number;
  totalPoints: number;
}

interface TeamBreakdown {
  contestId: string;
  contestName: string;
  teamId: string;
  teamName: string;
  userId: string;
  userName: string;
  liveRank: number;
  livePoints: number;
  players: TeamBreakdownPlayer[];
}

interface ContestPrizeTable {
  totalWinners: number;
  rankPrizes: number[];
}

export function ContestLivePage() {
  const navigate = useNavigate();
  const { contestId } = useParams();
  const { toast, refreshWallet } = useApp();
  const walletSyncedOnCompleteRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LiveContestData | null>(null);

  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamData, setTeamData] = useState<TeamBreakdown | null>(null);
  const [prizeTable, setPrizeTable] = useState<ContestPrizeTable | null>(null);

  async function loadContestLive(silent = false) {
    if (!contestId) return;
    if (!silent) setLoading(true);
    try {
      const res = await api.get(`/scores/contest/${contestId}/live`, { cache: false });
      setData(res.data?.data ?? null);
      setError(null);
    } catch (err) {
      const msg = getErrorMessage(err, "Failed to load live leaderboard");
      if (!silent) {
        setError(msg);
        toast({ type: "error", icon: "❌", msg });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function loadPrizeTable() {
    if (!contestId) return;
    try {
      const res = await api.get(`/contests/${contestId}/prize-table?winnerPercentage=25`);
      setPrizeTable({
        totalWinners: Number(res.data?.data?.totalWinners ?? 0),
        rankPrizes: Array.isArray(res.data?.data?.rankPrizes) ? res.data.data.rankPrizes : [],
      });
    } catch (err) {
      const msg = getErrorMessage(err, "Failed to load prize table");
      toast({ type: "error", icon: "❌", msg });
    }
  }

  async function openTeam(teamId: string) {
    if (!contestId) return;
    setShowTeamModal(true);
    setTeamLoading(true);
    setTeamError(null);
    setTeamData(null);
    try {
      const res = await api.get(`/scores/contest/${contestId}/team/${teamId}`, { cache: false });
      setTeamData(res.data?.data ?? null);
    } catch (err) {
      const msg = getErrorMessage(err, "Failed to load team breakdown");
      setTeamError(msg);
      toast({ type: "error", icon: "❌", msg });
    } finally {
      setTeamLoading(false);
    }
  }

  useEffect(() => {
    loadContestLive();
    loadPrizeTable();
  }, [contestId]);

  useEffect(() => {
    if (!contestId) return;
    const timer = setInterval(() => loadContestLive(true), 7000);
    return () => clearInterval(timer);
  }, [contestId]);

  useEffect(() => {
    const status = (data?.contestStatus ?? "").toUpperCase();
    if (status !== "COMPLETED") {
      walletSyncedOnCompleteRef.current = false;
      return;
    }
    if (walletSyncedOnCompleteRef.current) return;
    walletSyncedOnCompleteRef.current = true;
    void refreshWallet();
  }, [data?.contestStatus, refreshWallet]);

  const top3 = useMemo(() => (data?.entries ?? []).slice(0, 3), [data]);
  const myEntry = useMemo(() => (data?.entries ?? []).find((e) => e.isCurrentUser) ?? null, [data]);
  const getPotentialByRank = (rank: number): number => {
    if (!prizeTable || rank < 1 || rank > prizeTable.rankPrizes.length) return 0;
    return Number(prizeTable.rankPrizes[rank - 1] ?? 0);
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-8">
      <button onClick={() => navigate("/contests")} className="text-sm font-bold text-[#EA4800] mb-4 hover:underline">
        ← Back to Contests
      </button>

      {loading ? (
        <div className="space-y-4">
          <div className="h-28 bg-[#F4F1EC] rounded-2xl animate-pulse" />
          <div className="h-96 bg-[#F4F1EC] rounded-2xl animate-pulse" />
        </div>
      ) : error || !data ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl font-bold text-center">{error ?? "Contest not found"}</div>
      ) : (
        <>
          <div className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl p-5 mb-5" style={{ borderTopWidth: 3, borderTopColor: "#EA4800" }}>
            <h1 className="font-display font-black text-2xl text-[#1A1208] mb-1">🏆 {data.contestName}</h1>
            <p className="text-sm text-[#7A6A55]">
              {data.team1Name} vs {data.team2Name} · <span className="font-bold">{data.matchStatus}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#B0A090]">
              <p>Auto-refresh every 7 seconds</p>
              {prizeTable && <p>Paid ranks: 1 to {prizeTable.totalWinners}</p>}
              {myEntry && <p>Your potential earning: <span className="font-bold text-[#EA4800]">₹{getPotentialByRank(myEntry.rank).toFixed(2)}</span></p>}
            </div>
          </div>

          {top3.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
              {top3.map((row) => (
                <div key={row.teamId} className="bg-white border-[1.5px] border-[#E8E0D4] rounded-xl p-4">
                  <div className="text-xs text-[#7A6A55]">Rank</div>
                  <div className="font-display font-black text-2xl text-[#EA4800]">#{row.rank}</div>
                  <div className="font-bold text-[#1A1208] mt-1 truncate">{row.teamName}</div>
                  <div className="text-xs text-[#7A6A55] truncate">{row.userName}</div>
                  <div className="mt-2 text-sm font-bold">{row.livePoints.toFixed(1)} pts</div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl overflow-hidden" style={{ borderTopWidth: 3, borderTopColor: "#EA4800" }}>
            <div className="bg-[#F4F1EC] border-b-[1.5px] border-[#E8E0D4] px-5 py-3.5 flex items-center justify-between">
              <span className="font-display font-bold text-base">Live Team Rankings</span>
              <button onClick={() => loadContestLive()} className="text-xs font-bold text-[#EA4800] hover:underline">Refresh</button>
            </div>
            <div className="divide-y divide-[#E8E0D4]">
              {data.entries.length === 0 ? (
                <div className="p-8 text-center text-[#7A6A55] text-sm">No teams joined this contest yet.</div>
              ) : (
                data.entries.map((row) => (
                  <div key={row.teamId} className={`px-4 py-3 flex items-center justify-between gap-3 ${row.isCurrentUser ? "bg-[#FFF0EA]" : ""}`}>
                    <div className="min-w-0">
                      <p className="text-xs text-[#7A6A55]">Rank #{row.rank}</p>
                      <p className="font-bold text-[#1A1208] truncate">
                        {row.teamName}
                        {row.isCurrentUser && <span className="ml-2 text-[0.65rem] font-black uppercase text-white bg-[#EA4800] px-1.5 py-0.5 rounded">You</span>}
                      </p>
                      <p className="text-xs text-[#7A6A55] truncate">{row.userName}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="font-display font-black text-lg text-[#EA4800]">{row.livePoints.toFixed(1)}</div>
                        <div className="text-[0.65rem] text-[#7A6A55]">PTS</div>
                        <div className="text-[0.65rem] font-bold text-green-700">
                          Potential: ₹{getPotentialByRank(row.rank).toFixed(2)}
                        </div>
                      </div>
                      <button onClick={() => openTeam(row.teamId)} className="px-3 py-2 rounded-lg border border-[#E8E0D4] text-sm font-bold hover:border-[#EA4800] hover:text-[#EA4800] transition-colors">
                        View Team
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      <Modal
        show={showTeamModal}
        onClose={() => setShowTeamModal(false)}
        title={teamData ? `Team: ${teamData.teamName}` : "Team Details"}
        size="lg"
      >
        {teamLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-[#F4F1EC] rounded-lg animate-pulse" />)}
          </div>
        ) : teamError ? (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-semibold">{teamError}</div>
        ) : !teamData ? (
          <div className="text-[#7A6A55] text-sm">No team data found.</div>
        ) : (
          <div>
            <div className="bg-[#FAFAF8] border border-[#E8E0D4] rounded-xl p-3 mb-4">
              <p className="text-sm text-[#7A6A55]">
                Owner: <span className="font-bold text-[#1A1208]">{teamData.userName}</span> · Rank: <span className="font-bold text-[#EA4800]">#{teamData.liveRank || "—"}</span>
              </p>
              <p className="text-sm text-[#7A6A55] mt-1">
                Total: <span className="font-display font-black text-[#EA4800]">{teamData.livePoints.toFixed(1)} pts</span>
              </p>
              <p className="text-sm text-[#7A6A55] mt-1">
                Potential Earning: <span className="font-display font-black text-green-700">₹{getPotentialByRank(teamData.liveRank).toFixed(2)}</span>
              </p>
            </div>

            <div className="space-y-2 max-h-[55vh] overflow-y-auto">
              {teamData.players.map((p) => (
                <div key={p.playerId} className="border border-[#E8E0D4] rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-[#1A1208] truncate">
                      {p.playerName}
                      {p.captainRole === "CAPTAIN" && <span className="ml-2 text-[0.6rem] font-black text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">C</span>}
                      {p.captainRole === "VICE_CAPTAIN" && <span className="ml-2 text-[0.6rem] font-black text-[#EA4800] bg-[#FFF0EA] px-1.5 py-0.5 rounded">VC</span>}
                    </p>
                    <p className="text-xs text-[#7A6A55]">{p.teamName} · {p.playerRole}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-[#7A6A55]">{p.basePoints.toFixed(1)} × {p.multiplier}</p>
                    <p className="font-display font-black text-[#EA4800]">{p.totalPoints.toFixed(1)} pts</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}