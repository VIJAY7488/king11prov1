import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import { useApp } from "@/context/AppContext";
import { useAuthStore } from "@/store/authStore";
import type { MatchFromApi } from "@/types/api";
import { ContestCard, type Contest } from "@/components/contest/ContestCard";
import { Modal } from "@/components/ui/modal";

const Homepage = () => {

    const [matches, setMatches] = useState<MatchFromApi[]>([]);
    const [contests, setContests] = useState<Contest[]>([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState<string | null>(null);
    const [showPointTable, setShowPointTable] = useState(false);

    const { toast } = useApp();
    const token = useAuthStore((s) => s.token);
    const navigate = useNavigate();

    async function loadData() {
        try {
            setError(null);
            const [matchRes, contestRes] = await Promise.allSettled([
              api.get("/matches?limit=10"),
              api.get("/contests?limit=12"),
            ]);

            let hasData = false;

            if (matchRes.status === "fulfilled") {
              const allMatches: MatchFromApi[] = matchRes.value.data?.data?.matches ?? [];
              setMatches(allMatches.filter((m) => m.status === "LIVE" || m.status === "UPCOMING").slice(0, 6));
              hasData = true;
            } else {
              setMatches([]);
            }

            if (contestRes.status === "fulfilled") {
              const allContests: Contest[] = contestRes.value.data?.data?.contests ?? [];
              const openContests = allContests
                .filter((c) => c.status === "OPEN" || c.status === "FULL")
                .sort((a, b) => {
                  if (a.status === "OPEN" && b.status !== "OPEN") return -1;
                  if (a.status !== "OPEN" && b.status === "OPEN") return 1;
                  return b.prizePool - a.prizePool;
                })
                .slice(0, 6);
              setContests(openContests);
              hasData = true;
            } else {
              setContests([]);
            }

            if (!hasData) {
              throw new Error("Failed to load matches and contests.");
            }
        } catch (err) {
            const msg = getErrorMessage(err, "Failed to load matches.");
            setError(msg);
            toast({ type: "error", icon: "❌", msg });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadData(); }, []);

    // Helper functions
    const matchId = (m: MatchFromApi) => m.id ?? m._id ?? "";
    const matchTime = (m: MatchFromApi) => {
        const dateStr = m.matchDate ?? m.matchStartTime ?? "";
        if (!dateStr) return "—";
        return new Date(dateStr).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    };

    function handleJoinMatch(m: MatchFromApi) {
        if (!token) {
            toast({ type: "info", icon: "🔒", msg: "Please login to join a match" });
            navigate("/login");
            return;
        }
        // Navigate to Contests flow for this Match
        navigate(`/contests?matchId=${matchId(m)}`);
    }

    function handleJoinContest(c: Contest) {
      if (!token) {
        toast({ type: "info", icon: "🔒", msg: "Please login to join a contest" });
        navigate("/login");
        return;
      }
      const matchStatus = (c.match?.status ?? "UPCOMING").toUpperCase();
      if (matchStatus === "LIVE") {
        navigate(`/contests/${c.id}/live`);
        return;
      }
      navigate(`/teams?matchId=${c.matchId}&contestId=${c.id}`);
    }

    if (loading) {
        return (
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="h-48 bg-[#F4F1EC] rounded-2xl animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center">
                <p className="text-4xl mb-2">⚠️</p>
                <p className="font-bold text-red-500">{error}</p>
                <button
                    onClick={() => { setLoading(true); loadData(); }}
                    className="mt-4 px-5 py-2 bg-[#EA4800] text-white rounded-xl font-bold hover:bg-[#FF5A1A] transition-all"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-8">

            {/* ── Hero ── */}
            <section className="mb-8">
                <div className="bg-hero rounded-3xl overflow-hidden relative p-8 md:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6 min-h-[200px]">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute top-0 right-1/3 w-96 h-72 rounded-full" style={{ background: "radial-gradient(ellipse, rgba(234,72,0,.18) 0%, transparent 70%)" }} />
                        <div className="absolute bottom-0 right-0 w-72 h-60 rounded-full" style={{ background: "radial-gradient(ellipse, rgba(255,90,26,.12) 0%, transparent 70%)" }} />
                        <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
                    </div>
                    <div className="relative z-10 space-y-4">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[0.7rem] font-bold uppercase tracking-widest" style={{ background: "rgba(234,72,0,.2)", border: "1px solid rgba(234,72,0,.35)", color: "#FF8C5A" }}>
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A1A] animate-pulse-dot" />
                            Live Contests Active Now
                        </div>
                        <h1 className="font-display font-black leading-none text-white" style={{ fontSize: "clamp(2rem, 4.5vw, 3.25rem)" }}>
                            WIN UP TO{" "}<span className="text-[#EA4800]">₹10 CRORE</span><br />THIS WEEKEND
                        </h1>
                        <p className="text-white/50 text-[0.9375rem] max-w-md">Join 45M+ players. Build your dream XI. Win real cash daily.</p>
                        <div className="flex gap-3 flex-wrap">
                            <button
                                onClick={() => { if (!token) { toast({ type: "info", icon: "🔒", msg: "Please login to join a contest" }); navigate("/login"); return; } navigate("/teams"); }}
                                className="bg-[#EA4800] text-white px-7 py-3.5 rounded-xl font-bold text-[0.9375rem] shadow-[0_6px_28px_rgba(234,72,0,.4)] hover:bg-[#FF5A1A] hover:-translate-y-px transition-all"
                            >
                                ⚡ Create Team Now
                            </button>
                            <button
                                onClick={() => setShowPointTable(true)}
                                className="px-7 py-3.5 rounded-xl font-bold text-[0.9375rem] text-white hover:bg-white/10 transition-all"
                                style={{ background: "rgba(255,255,255,.08)", border: "1.5px solid rgba(255,255,255,.2)" }}>
                                View Point Table
                            </button>
                        </div>
                    </div>
                    <div className="relative z-10 flex gap-8 md:gap-10 shrink-0">
                        {[["₹10Cr", "Prize Pool"], ["24", "Live Matches"], ["45M+", "Players"]].map(([v, l]) => (
                            <div key={l} className="text-center">
                                <div className="font-display font-black text-[#EA4800] leading-none mb-1" style={{ fontSize: "clamp(1.75rem,3.5vw,2.5rem)" }}>{v}</div>
                                <div className="text-[0.65rem] uppercase tracking-wider text-white/40 font-semibold">{l}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Matches ── */}
            <section className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display font-bold text-lg flex items-center gap-2">
                        🔥 Live & Upcoming Matches
                        <span className="text-sm font-normal text-[#7A6A55]">({matches.length})</span>
                    </h2>
                    <button onClick={() => navigate("/matches")} className="text-sm font-bold text-[#EA4800] hover:text-[#FF5A1A]">See All →</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {matches.map((m) => (
                        <div
                          key={matchId(m)}
                          className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl p-4 transition-all hover:shadow-lg relative overflow-hidden"
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
                            <div className="flex flex-col">
                                <div className="text-xs text-[#7A6A55] font-semibold">Prize Pool</div>
                                <div className="font-bold text-[#EA4800]">₹{(m.prizePool ?? 0).toLocaleString("en-IN")}</div>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleJoinMatch(m); }}
                                className="bg-gradient-to-br from-[#EA4800] to-[#FF5A1A] text-white px-4 py-1.5 rounded-xl font-bold text-sm shadow-[0_4px_12px_rgba(234,72,0,0.3)] hover:scale-105 active:scale-95 transition-all"
                            >
                                Join Contests
                            </button>
                          </div>
                        </div>
                    ))}
                    {matches.length === 0 && (
                        <div className="col-span-full text-center py-12 bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl text-[#7A6A55]">
                            <p className="text-4xl mb-2">🏟️</p>
                            <p className="font-bold text-[#3D3020]">No matches available right now</p>
                        </div>
                    )}
                </div>
            </section>

            {/* ── Contests ── */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-lg flex items-center gap-2">
                  🏆 Hot Contests
                  <span className="text-sm font-normal text-[#7A6A55]">({contests.length})</span>
                </h2>
                <button onClick={() => navigate("/contests")} className="text-sm font-bold text-[#EA4800] hover:text-[#FF5A1A]">See All →</button>
              </div>

              {contests.length === 0 ? (
                <div className="text-center py-10 bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl text-[#7A6A55]">
                  <p className="text-3xl mb-2">🏆</p>
                  <p className="font-bold text-[#3D3020]">No active contests right now</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {contests.map((c) => (
                    <ContestCard key={c.id} contest={c} onJoin={handleJoinContest} />
                  ))}
                </div>
              )}
            </section>

            <Modal
              show={showPointTable}
              onClose={() => setShowPointTable(false)}
              title="Fantasy Point System"
              size="lg"
            >
              <div className="space-y-4 text-sm">
                <div className="rounded-xl border border-[#E8E0D4] bg-[#FAFAF8] p-4">
                  <p className="font-black text-[#1A1208] mb-2">Batting</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[#3D3020]">
                    <p>Run: <span className="font-bold">+1</span></p>
                    <p>Four Bonus: <span className="font-bold">+4</span></p>
                    <p>Six Bonus: <span className="font-bold">+6</span></p>
                    <p>Duck: <span className="font-bold text-red-600">-2</span></p>
                  </div>
                </div>

                <div className="rounded-xl border border-[#E8E0D4] bg-[#FAFAF8] p-4">
                  <p className="font-black text-[#1A1208] mb-2">Bowling</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[#3D3020]">
                    <p>Wicket: <span className="font-bold">+30</span></p>
                    <p>Dot Ball: <span className="font-bold">+1</span></p>
                    <p>Maiden Over: <span className="font-bold">+12</span></p>
                    <p>LBW/Bowled Bonus: <span className="font-bold">+8</span></p>
                  </div>
                </div>

                <div className="rounded-xl border border-[#E8E0D4] bg-[#FAFAF8] p-4">
                  <p className="font-black text-[#1A1208] mb-2">Fielding</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[#3D3020]">
                    <p>Catch: <span className="font-bold">+8</span></p>
                    <p>Stumping: <span className="font-bold">+12</span></p>
                    <p>Direct Run Out: <span className="font-bold">+12</span></p>
                    <p>Indirect Run Out: <span className="font-bold">+6</span></p>
                  </div>
                </div>

                <div className="rounded-xl border border-[#E8E0D4] bg-[#FFF0EA] p-4">
                  <p className="font-black text-[#1A1208] mb-1">Captain & Vice Captain</p>
                  <p className="text-[#3D3020]">Captain gets <span className="font-bold">2x</span> points, Vice Captain gets <span className="font-bold">1.5x</span> points.</p>
                </div>
              </div>
            </Modal>

        </div>
    );
};

export default Homepage;