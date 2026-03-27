import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import { extractLiveUpcomingMatches } from "@/lib/matches";
import { buildReferralLink } from "@/lib/referral";
import { useApp } from "@/context/AppContext";
import { useAuthStore } from "@/store/authStore";
import type { MatchFromApi } from "@/types/api";
import type { Contest } from "@/components/contest/ContestCard";
import { Modal } from "@/components/ui/modal";
import HeroBanner from "@/components/home/HeroBanner";

const Homepage = () => {
  type ReferralSummary = {
    referralCode: string;
    totalReferrals: number;
    rewardedReferrals: number;
    pendingReferrals: number;
    totalBonusEarned: number;
    rewardPerReferral: number;
  };

  const [matches, setMatches] = useState<MatchFromApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPointTable, setShowPointTable] = useState(false);
  const [referralSummary, setReferralSummary] = useState<ReferralSummary | null>(null);
  const [referralSlide, setReferralSlide] = useState(0);
  const [matchFilter, setMatchFilter] = useState<"recommended" | "starting-soon">("recommended");


  const { toast } = useApp();
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();

  const loadData = useCallback(async () => {
    try {
      setError(null);
      let hasData = false;
      if (!token) {
        const contestRes = await api.get("/contests?limit=12");
        const allContests: Contest[] = contestRes.data?.data?.contests ?? [];
        setMatches(extractLiveUpcomingMatches(allContests).filter((m) => m.status === "UPCOMING").slice(0, 6));
        setReferralSummary(null);
        hasData = true;
      } else {
        const [matchRes, contestRes] = await Promise.allSettled([
          api.get("/matches?limit=10"),
          api.get("/contests?limit=12"),
        ]);
        const referralRes = await api.get("/users/me/referral").catch(() => null);

        let allContests: Contest[] = [];

        if (matchRes.status === "fulfilled") {
          const allMatches: MatchFromApi[] = matchRes.value.data?.data?.matches ?? [];
          setMatches(allMatches.filter((m) => m.status === "UPCOMING").slice(0, 6));
          hasData = true;
        } else {
          setMatches([]);
        }

        if (contestRes.status === "fulfilled") {
          allContests = contestRes.value.data?.data?.contests ?? [];
          hasData = true;
        }

        if (matchRes.status !== "fulfilled" && allContests.length > 0) {
          setMatches(extractLiveUpcomingMatches(allContests).filter((m) => m.status === "UPCOMING").slice(0, 6));
          hasData = true;
        }

        setReferralSummary(referralRes?.data?.data?.summary ?? null);
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
  }, [token]);

  useEffect(() => { loadData(); }, [token]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      setReferralSlide((prev) => (prev + 1) % 2);
    }, 4200);
    return () => clearInterval(id);
  }, [token]);

  // Helper functions
  const matchId = (m: MatchFromApi) => m.id ?? m._id ?? "";
  const matchDateObj = (m: MatchFromApi) => {
    const dateStr = m.matchDate ?? m.matchStartTime ?? "";
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const matchTime = (m: MatchFromApi) => {
    const d = matchDateObj(m);
    if (!d) return "TBA";
    return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  };

  const matchDateLabel = (m: MatchFromApi) => {
    const d = matchDateObj(m);
    if (!d) return "Date TBA";
    return d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
  };

  const matchStartsIn = (m: MatchFromApi) => {
    const d = matchDateObj(m);
    if (!d) return "Schedule soon";
    const diffMs = d.getTime() - Date.now();
    if (diffMs <= 0) return "Starting soon";
    const mins = Math.floor(diffMs / 60000);
    const days = Math.floor(mins / (60 * 24));
    const hours = Math.floor((mins % (60 * 24)) / 60);
    const remainingMins = mins % 60;
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${remainingMins}m left`;
    return `${remainingMins}m left`;
  };

  const filteredMatches = (() => {
    if (matchFilter === "starting-soon") {
      const fiveHoursMs = 5 * 60 * 60 * 1000;
      const now = Date.now();
      return [...matches]
        .filter((m) => {
          if (m.status !== "UPCOMING") return false;
          const d = matchDateObj(m);
          if (!d) return false;
          const diff = d.getTime() - now;
          return diff > 0 && diff <= fiveHoursMs; // starts within 5 hours
        })
        .sort((a, b) => {
          const da = matchDateObj(a)?.getTime() ?? Infinity;
          const db = matchDateObj(b)?.getTime() ?? Infinity;
          return da - db;
        });
    }
    // "recommended" → show only upcoming by date
    return [...matches].sort((a, b) => {
      const da = matchDateObj(a)?.getTime() ?? Infinity;
      const db = matchDateObj(b)?.getTime() ?? Infinity;
      return da - db;
    });
  })();

  function handleJoinMatch(m: MatchFromApi) {
    if (!token) {
      toast({ type: "info", icon: "🔒", msg: "Please login to join a match" });
      navigate("/login");
      return;
    }
    // Navigate to Contests flow for this Match
    const selectedMatchId = matchId(m);
    if (selectedMatchId) sessionStorage.setItem("selectedMatchId", selectedMatchId);
    navigate(`/contests?matchId=${selectedMatchId}`);
  }

  async function shareReferralLink() {
    const code = referralSummary?.referralCode;
    if (!code) {
      toast({ type: "error", icon: "❌", msg: "Referral link not available yet." });
      return;
    }
    const link = buildReferralLink(code);
    if (!link) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Join King11Pro",
          text: "Join using my referral link and start playing!",
          url: link,
        });
        toast({ type: "success", icon: "✅", msg: "Referral link shared." });
        return;
      }
      await navigator.clipboard.writeText(link);
      toast({ type: "success", icon: "✅", msg: "Referral link copied." });
    } catch {
      toast({ type: "error", icon: "❌", msg: "Failed to share referral link." });
    }
  }

  async function copyBonusCode() {
    try {
      await navigator.clipboard.writeText("KING11PRO50");
      toast({ type: "success", icon: "✅", msg: "Bonus code copied." });
    } catch {
      toast({ type: "error", icon: "❌", msg: "Failed to copy bonus code." });
    }
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
        <HeroBanner
          onCreateTeamClick={() => {
            if (!token) {
              toast({ type: "info", icon: "🔒", msg: "Please login to join a contest" });
              navigate("/login");
              return;
            }
            navigate("/teams");
          }}
          onPointSystemClick={() => setShowPointTable(true)}
        />
      </section>

      {token && (
        <section className="mb-8">
          <div className="rounded-2xl overflow-hidden border-[1.5px] border-[#E8E0D4] shadow-sm bg-white" style={{ borderTopWidth: 3, borderTopColor: "#EA4800" }}>
            <div className="bg-[#F4F1EC] px-4 sm:px-5 py-3 border-b border-[#E8E0D4] flex items-center justify-between gap-3">
              <h3 className="font-display font-bold text-sm sm:text-base">🎁 Refer Friends & Earn</h3>
              <button onClick={() => navigate("/profile")} className="text-xs font-bold text-[#EA4800] hover:text-[#FF5A1A]">View Referrals →</button>
            </div>

            <div className="p-4 sm:p-5">
              <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#1A1208] via-[#2A1A0E] to-[#3D2413] text-white min-h-[170px]">
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute -top-10 -right-6 w-40 h-40 rounded-full bg-[#EA480066] blur-2xl" />
                  <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full bg-[#FFB36644] blur-2xl" />
                </div>

                <div className="relative p-4 sm:p-5">
                  {referralSlide === 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 items-stretch">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-[#FFB88F] mb-2">Share Referral Link</p>
                        <p className="font-display font-black text-3xl tracking-wider">{referralSummary?.referralCode ?? "KING------"}</p>
                        <p className="text-xs text-white/65 mt-2">Invite friends and earn ₹{(referralSummary?.rewardPerReferral ?? 50).toLocaleString("en-IN")} when they complete first deposit.</p>
                        <a
                          href={buildReferralLink(referralSummary?.referralCode ?? "") || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-[11px] text-[#FFD7BC] underline break-all"
                          onClick={(e) => {
                            if (!referralSummary?.referralCode) e.preventDefault();
                          }}
                        >
                          {buildReferralLink(referralSummary?.referralCode ?? "")}
                        </a>
                        <div className="mt-4">
                          <button onClick={shareReferralLink} className="px-4 py-2 rounded-lg bg-[#EA4800] text-white text-xs font-bold hover:bg-[#FF5A1A] transition-colors">Share Link</button>
                        </div>
                      </div>

                      <div className="rounded-lg border border-white/20 bg-white/10 p-3">
                        <p className="text-xs font-black uppercase tracking-wider text-[#FFB88F] mb-2">How It Works</p>
                        <div className="space-y-1.5 text-sm">
                          <p>1. Share your referral link</p>
                          <p>2. Friend signs up and deposits first time</p>
                          <p>3. You get ₹{(referralSummary?.rewardPerReferral ?? 50).toLocaleString("en-IN")} referral bonus</p>
                        </div>
                        <p className="text-[11px] text-white/65 mt-2">Bonus is non-withdrawable, usable in contests.</p>
                      </div>
                    </div>
                  )}

                  {referralSlide === 1 && (
                    <div className="max-w-[620px]">
                      <p className="text-xs font-black uppercase tracking-wider text-[#FFB88F] mb-2">Deposit Bonus Offer</p>
                      <div className="rounded-lg border border-[#FFB88F66] bg-[#EA480033] px-3 py-3 flex items-center justify-between gap-3">
                        <span className="font-display font-black tracking-wider text-xl">KING11PRO50</span>
                        <button onClick={copyBonusCode} className="px-3 py-1.5 rounded-md bg-white/20 text-white text-[11px] font-bold hover:bg-white/30 transition-colors">
                          Copy Code
                        </button>
                      </div>
                      <p className="text-sm text-white/85 mt-3">Use this while adding money to unlock <span className="font-black">50% bonus</span> on ₹50+ deposits.</p>
                      <p className="text-[12px] text-white/65 mt-1">Bonus is non-withdrawable. Deposit + winnings are withdrawable.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 mt-3">
                {[0, 1].map((idx) => (
                  <button
                    key={idx}
                    onClick={() => setReferralSlide(idx)}
                    className={`h-2 rounded-full transition-all ${referralSlide === idx ? "w-6 bg-[#EA4800]" : "w-2 bg-[#D8CFC4]"}`}
                    aria-label={`Referral slide ${idx + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Matches ── */}
      <section className="mb-8">
        {/* Desktop-only header */}
        <div className="hidden md:flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-lg flex items-center gap-2">
            🔥 Live & Upcoming Matches
            <span className="text-sm font-normal text-[#7A6A55]">({matches.length})</span>
          </h2>
          <button onClick={() => navigate("/matches")} className="text-sm font-bold text-[#EA4800] hover:text-[#FF5A1A]">See All →</button>
        </div>

        {/* Mobile-only filter tabs */}
        <div className="md:hidden flex items-center gap-2 mb-4">
          <button
            onClick={() => setMatchFilter("recommended")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold border-[1.5px] transition-all ${matchFilter === "recommended"
              ? "bg-[#EA4800] text-white border-[#EA4800] shadow-[0_4px_14px_rgba(234,72,0,.30)]"
              : "bg-white text-[#7A6A55] border-[#E8E0D4] hover:border-[#EA4800] hover:text-[#EA4800]"
              }`}
          >
            ⭐ Recommended
          </button>
          <button
            onClick={() => setMatchFilter("starting-soon")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold border-[1.5px] transition-all ${matchFilter === "starting-soon"
              ? "bg-[#EA4800] text-white border-[#EA4800] shadow-[0_4px_14px_rgba(234,72,0,.30)]"
              : "bg-white text-[#7A6A55] border-[#E8E0D4] hover:border-[#EA4800] hover:text-[#EA4800]"
              }`}
          >
            ⏰ Starting Soon
          </button>
        </div>

        {/* Match cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredMatches.map((m) => (
            <div
              key={matchId(m)}
              className={`border-[1.5px] rounded-2xl p-4 transition-all hover:shadow-lg relative overflow-hidden ${m.status === "UPCOMING"
                ? "bg-gradient-to-br from-[#FFF8EE] via-[#FFFDF8] to-white border-[#FFD8BF] shadow-[0_12px_35px_rgba(234,72,0,.11)] hover:-translate-y-1"
                : "bg-white border-[#E8E0D4] hover:-translate-y-0.5"
                }`}
              style={{ borderTopWidth: 3, borderTopColor: m.status === "LIVE" ? "#EF4444" : "#EA4800" }}
            >
              {m.status === "UPCOMING" && (
                <div className="absolute -right-10 -top-12 w-28 h-28 rounded-full bg-[#FFA26033] blur-2xl pointer-events-none" />
              )}

              {/* ── MOBILE card layout ── */}
              <div className="md:hidden p-3" onClick={() => handleJoinMatch(m)}>
                {/* Top row: format badge + status badge */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[0.6rem] font-black tracking-wider uppercase bg-[#F4F1EC] px-2 py-0.5 rounded text-[#7A6A55]">
                    {m.format ?? "CRICKET"}
                  </span>
                  {m.status === "LIVE" ? (
                    <span className="text-[0.6rem] font-black tracking-wider uppercase bg-red-100 text-red-600 px-2 py-0.5 rounded border border-red-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" /> LIVE
                    </span>
                  ) : (
                    <span className="text-[0.6rem] font-black uppercase tracking-wider text-[#EA4800] bg-[#FFF0E7] border border-[#FFD4BE] px-2 py-0.5 rounded">
                      UPCOMING
                    </span>
                  )}
                </div>

                {/* Main row: teams left, date-time + prize right */}
                <div className="flex items-center justify-between gap-3">
                  {/* Teams stacked vertically */}
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    {/* Team 1 */}
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#F4F1EC] border border-[#E8E0D4] text-[0.65rem] font-extrabold text-[#3D3020] flex items-center justify-center shrink-0">
                        {(m.team1Name ?? "T1").slice(0, 2).toUpperCase()}
                      </div>
                      <p className="font-black text-[0.875rem] text-[#1A1208] truncate leading-tight">
                        {m.team1Name}
                      </p>
                    </div>

                    {/* VS divider */}
                    <div className="flex items-center gap-2">
                      <div className="w-7 flex justify-center shrink-0">
                        <span className="text-[0.55rem] font-black text-[#D4C8B8] tracking-widest">VS</span>
                      </div>
                      <div className="h-px flex-1 bg-[#E8E0D4]" />
                    </div>

                    {/* Team 2 */}
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#F4F1EC] border border-[#E8E0D4] text-[0.65rem] font-extrabold text-[#3D3020] flex items-center justify-center shrink-0">
                        {(m.team2Name ?? "T2").slice(0, 2).toUpperCase()}
                      </div>
                      <p className="font-black text-[0.875rem] text-[#1A1208] truncate leading-tight">
                        {m.team2Name}
                      </p>
                    </div>
                  </div>

                  {/* Right column: date/time + countdown only */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {m.status === "LIVE" ? (
                      <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                        <span className="text-[0.7rem] font-black text-red-600 whitespace-nowrap">Live Now</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end bg-[#FFF0E7] border border-[#FFD4BE] rounded-xl px-3 py-2.5 gap-1">
                        <span className="text-[0.65rem] font-black text-[#1A1208] whitespace-nowrap">
                          {matchDateLabel(m)}
                        </span>
                        <span className="text-[0.7rem] font-bold text-[#EA4800] whitespace-nowrap">
                          ⏰ {matchTime(m)}
                        </span>
                        <span className="text-[0.75rem] font-black text-[#B3470F] whitespace-nowrap tabular-nums">
                          🚀 {matchStartsIn(m)}
                        </span>
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* ── DESKTOP card layout (original) ── */}
              <div className="hidden md:block p-4">
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
                    <span className="text-[0.6rem] font-black tracking-wider uppercase text-[#EA4800] bg-[#FFF0E7] border border-[#FFD4BE] px-2 py-1 rounded-lg">
                      ⏰ {matchDateLabel(m)} · {matchTime(m)}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#F4F1EC] border border-[#E8E0D4] text-[#3D3020] text-sm font-extrabold tracking-wide flex items-center justify-center shrink-0">
                      {(m.team1Name ?? "T1").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="font-display font-black text-xl truncate">{m.team1Name}</div>
                  </div>
                  <div className="text-[#B0A090] font-black text-sm px-2">VS</div>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="font-display font-black text-xl truncate text-right">{m.team2Name}</div>
                    <div className="w-8 h-8 rounded-full bg-[#F4F1EC] border border-[#E8E0D4] text-[#3D3020] text-sm font-extrabold tracking-wide flex items-center justify-center shrink-0">
                      {(m.team2Name ?? "T2").slice(0, 2).toUpperCase()}
                    </div>
                  </div>
                </div>

                <div className="h-px bg-[#E8E0D4] my-3" />

                {m.status === "UPCOMING" && (
                  <>
                    <div className="mb-2 rounded-lg bg-[#FFF0E7] border border-[#FFD9C3] px-3 py-2 flex items-center justify-between">
                      <span className="text-[0.68rem] font-black uppercase tracking-wider text-[#B3470F]">Match Date</span>
                      <span className="text-xs font-bold text-[#1A1208]">{matchDateLabel(m)}, {matchTime(m)}</span>
                    </div>
                    <div className="mb-3 rounded-lg bg-gradient-to-r from-[#EA4800] to-[#FF6B2B] px-3 py-2 flex items-center justify-between shadow-[0_8px_22px_rgba(234,72,0,.24)]">
                      <span className="text-[0.68rem] font-black uppercase tracking-wider text-white/85">Kickoff In</span>
                      <span className="text-xs font-black text-white">🚀 {matchStartsIn(m)}</span>
                    </div>
                  </>
                )}

                <div className="flex justify-between items-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleJoinMatch(m); }}
                    className="bg-gradient-to-br from-[#EA4800] to-[#FF5A1A] text-white px-4 py-1.5 rounded-xl font-bold text-sm shadow-[0_4px_12px_rgba(234,72,0,0.3)] hover:scale-105 active:scale-95 transition-all"
                  >
                    Join Contests →
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredMatches.length === 0 && (
            <div className="col-span-full text-center py-12 bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl text-[#7A6A55]">
              <p className="text-4xl mb-2">🏟️</p>
              <p className="font-bold text-[#3D3020]">
                {matchFilter === "starting-soon"
                  ? "No matches starting right now"
                  : "No matches available right now"}
              </p>
              {matchFilter === "starting-soon" && matches.length > 0 && (
                <button
                  onClick={() => setMatchFilter("recommended")}
                  className="mt-3 text-sm font-bold text-[#EA4800] hover:text-[#FF5A1A]"
                >
                  View all matches →
                </button>
              )}
            </div>
          )}
        </div>
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
