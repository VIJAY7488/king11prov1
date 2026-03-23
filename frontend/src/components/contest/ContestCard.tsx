import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface Contest {
  id: string;
  matchId: string;
  name: string;
  contestType: string;
  entryFee: number;
  prizePool: number;
  totalSpots: number;
  filledSpots: number;
  availableSpots: number;
  fillPercentage: number;
  maxEntriesPerUser: number;
  isGuaranteed: boolean;
  status: string;
  closedAt: string | null;
  createdAt: string;
  match?: import("@/types/api").MatchFromApi;
}

interface ContestCardProps {
  contest: Contest;
  onJoin: (c: Contest) => void;
}

interface PrizeDistributionRow {
  fromRank: number;
  toRank: number;
  winnersCount: number;
  poolPercentage?: number;
  amountPerRank: number;
  totalAmount: number;
}

interface ContestPrizeTableResponse {
  prizePool: number;
  totalWinners: number;
  distribution: PrizeDistributionRow[];
}

const guaranteedPrizeCache = new Map<string, ContestPrizeTableResponse>();

function formatPrize(amount: number): string {
  if (amount >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(0)} Cr`;
  if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(0)}L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(0)}K`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

const statusStyle = (status: string) => {
  if (status === "LIVE") return "bg-red-100 text-red-700 border-red-200";
  if (status === "OPEN") return "bg-green-100 text-green-700 border-green-200";
  if (status === "FULL") return "bg-amber-100 text-amber-700 border-amber-200";
  if (status === "CLOSED") return "bg-slate-100 text-slate-700 border-slate-200";
  if (status === "COMPLETED") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-[#E8E0D4] text-[#7A6A55] border-[#E8E0D4]";
};

export function ContestCard({ contest, onJoin }: ContestCardProps) {
  const [guaranteedPrizeTable, setGuaranteedPrizeTable] = useState<ContestPrizeTableResponse | null>(null);
  const [loadingGuaranteedPrize, setLoadingGuaranteedPrize] = useState(false);

  const m = contest.match;
  const filled = Math.max(0, Math.min(100, contest.fillPercentage ?? 0));
  const available = Math.max(0, contest.availableSpots ?? (contest.totalSpots - contest.filledSpots));
  const isFreeContest = contest.contestType === "FREE_LEAGUE" || Number(contest.entryFee) === 0;
  const joinedUsers = Math.max(0, Number(contest.filledSpots ?? 0));
  const previewWinners = joinedUsers > 0 ? Math.max(1, Math.ceil(joinedUsers * 0.1)) : 0;

  const team1Name = m?.team1Name ?? "Team 1";
  const team2Name = m?.team2Name ?? "Team 2";
  const format = m?.format ?? "CRICKET";
  const matchStatus = (m?.status ?? "UPCOMING").toUpperCase();
  const contestStatus = (contest.status ?? "").toUpperCase();
  const isLive = matchStatus === "LIVE";
  const isMatchLocked = matchStatus !== "UPCOMING";
  const isJoinable = contest.status === "OPEN" && available > 0 && !isMatchLocked;
  const canViewLive = isLive && !["COMPLETED", "CANCELLED"].includes(contestStatus);
  const canCheckRank = contestStatus === "COMPLETED";
  const isActionable = isJoinable || canViewLive || canCheckRank;
  const displayStatus =
    ["COMPLETED", "CANCELLED"].includes(contestStatus)
      ? contestStatus
      : matchStatus === "LIVE"
        ? "LIVE"
        : contest.status;

  useEffect(() => {
    if (!contest.isGuaranteed) return;

    const cached = guaranteedPrizeCache.get(contest.id);
    if (cached) {
      setGuaranteedPrizeTable(cached);
      return;
    }

    let cancelled = false;
    const loadGuaranteedPrize = async () => {
      setLoadingGuaranteedPrize(true);
      try {
        const res = await api.get(`/contests/${contest.id}/prize-table`, {
          cache: { ttlMs: 60_000, key: `contest-prize-table:${contest.id}` },
        });
        const data = res.data?.data;
        const payload: ContestPrizeTableResponse = {
          prizePool: Number(data?.prizePool ?? contest.prizePool ?? 0),
          totalWinners: Number(data?.totalWinners ?? 0),
          distribution: Array.isArray(data?.distribution) ? data.distribution : [],
        };
        guaranteedPrizeCache.set(contest.id, payload);
        if (!cancelled) setGuaranteedPrizeTable(payload);
      } catch {
        if (!cancelled) setGuaranteedPrizeTable(null);
      } finally {
        if (!cancelled) setLoadingGuaranteedPrize(false);
      }
    };

    loadGuaranteedPrize();
    return () => {
      cancelled = true;
    };
  }, [contest.id, contest.isGuaranteed, contest.prizePool]);

  const topGuaranteedRows = guaranteedPrizeTable?.distribution?.slice(0, 4) ?? [];
  const moreGuaranteedRows = Math.max(0, (guaranteedPrizeTable?.distribution?.length ?? 0) - topGuaranteedRows.length);

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border-[1.5px] border-[#E8E0D4] hover:-translate-y-1 hover:shadow-[0_14px_36px_rgba(26,18,8,.09)] transition-all duration-300">
      <div className="h-[3px] bg-[#EA4800]" />

      <div className="px-4 py-3 bg-[#F4F1EC] border-b border-[#E8E0D4] flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.72rem] font-black tracking-wider text-[#7A6A55] uppercase">{format}</p>
          <p className="text-sm font-bold text-[#1A1208] truncate">{contest.name}</p>
        </div>
        <span className={`shrink-0 text-[0.65rem] font-black px-2 py-1 rounded-full border uppercase tracking-wide ${statusStyle(displayStatus)}`}>
          {displayStatus}
        </span>
      </div>

      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-center min-w-[88px]">
            <p className="font-display font-black text-lg text-[#1A1208]">{team1Name.split(" ")[0]}</p>
          </div>
          <div className="text-center">
            <p className="font-display font-black text-xl text-[#D0C3B3] leading-none">VS</p>
            <p className="text-[0.65rem] font-bold text-[#7A6A55] mt-1 uppercase tracking-wide">{matchStatus}</p>
          </div>
          <div className="text-center min-w-[88px]">
            <p className="font-display font-black text-lg text-[#1A1208]">{team2Name.split(" ")[0]}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-lg border border-[#E8E0D4] bg-[#FAFAF8] p-2">
            <p className="text-[0.62rem] uppercase tracking-wide text-[#7A6A55] font-bold">Prize</p>
            <p className="font-display font-black text-[#EA4800] text-base">{formatPrize(contest.prizePool)}</p>
          </div>
          <div className="rounded-lg border border-[#E8E0D4] bg-[#FAFAF8] p-2">
            <p className="text-[0.62rem] uppercase tracking-wide text-[#7A6A55] font-bold">Entry</p>
            <p className={`font-display font-black text-base ${isFreeContest ? "text-emerald-700" : "text-[#1A1208]"}`}>
              {isFreeContest ? "FREE" : `₹${contest.entryFee}`}
            </p>
          </div>
          <div className="rounded-lg border border-[#E8E0D4] bg-[#FAFAF8] p-2">
            <p className="text-[0.62rem] uppercase tracking-wide text-[#7A6A55] font-bold">Max Teams</p>
            <p className="font-display font-black text-[#1A1208] text-base">{contest.maxEntriesPerUser}</p>
          </div>
        </div>

        <div className="mb-3">
          {isFreeContest ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[0.72rem] text-emerald-800 font-semibold">
              Joined users: {joinedUsers.toLocaleString("en-IN")} · Winners: Top 10% ({previewWinners})
            </div>
          ) : (
            <div>
              <div className="flex justify-between text-[0.72rem] text-[#7A6A55] font-semibold mb-1.5">
                <span>{filled}% filled</span>
                <span>{available.toLocaleString("en-IN")} spots left</span>
              </div>
              <div className="h-2 bg-[#F0EBE1] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#EA4800] transition-all duration-500"
                  style={{ width: `${filled}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {contest.isGuaranteed && (
          <div className="mb-3 rounded-lg border border-[#DCC7A7] bg-[#FFF7ED] px-3 py-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[0.7rem] font-black uppercase tracking-wide text-[#9A6B37]">Guaranteed Prize Ladder</p>
              <p className="text-[0.68rem] font-bold text-[#B07A3A]">100% Winners</p>
            </div>
            {loadingGuaranteedPrize ? (
              <div className="mt-2 h-10 rounded bg-[#F5E7D4] animate-pulse" />
            ) : topGuaranteedRows.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {topGuaranteedRows.map((row) => {
                  const rankLabel = row.fromRank === row.toRank
                    ? `#${row.fromRank}`
                    : `#${row.fromRank}–#${row.toRank}`;
                  return (
                    <div key={`${row.fromRank}-${row.toRank}`} className="flex items-center justify-between text-[0.72rem]">
                      <span className="font-bold text-[#6C4A20]">{rankLabel}</span>
                      <span className="font-black text-[#EA4800]">₹{Number(row.amountPerRank ?? 0).toFixed(2)}</span>
                    </div>
                  );
                })}
                {moreGuaranteedRows > 0 && (
                  <p className="text-[0.68rem] font-semibold text-[#8A6A45]">+{moreGuaranteedRows} more tiers</p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-[0.68rem] font-semibold text-[#8A6A45]">Prize ladder will appear shortly.</p>
            )}
          </div>
        )}

        <button
          disabled={!isActionable}
          onClick={() => onJoin(contest)}
          className={`w-full rounded-xl py-2.5 text-sm font-black transition-all ${
            isActionable
              ? "bg-gradient-to-br from-[#EA4800] to-[#FF5A1A] text-white hover:scale-[1.01]"
              : "bg-[#E8E0D4] text-[#7A6A55] cursor-not-allowed"
          }`}
        >
          {isJoinable
            ? (isFreeContest ? "Join Free Contest" : "Join Contest")
            : canViewLive
              ? "View Live"
              : canCheckRank
                ? "Check Rank"
                : isMatchLocked
                  ? "Locked"
                  : contest.status === "FULL"
                    ? "Contest Full"
                    : "Not Joinable"}
        </button>
      </div>
    </div>
  );
}
