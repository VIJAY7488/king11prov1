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
  const m = contest.match;
  const filled = Math.max(0, Math.min(100, contest.fillPercentage ?? 0));
  const available = Math.max(0, contest.availableSpots ?? (contest.totalSpots - contest.filledSpots));

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
            <p className="font-display font-black text-[#1A1208] text-base">₹{contest.entryFee}</p>
          </div>
          <div className="rounded-lg border border-[#E8E0D4] bg-[#FAFAF8] p-2">
            <p className="text-[0.62rem] uppercase tracking-wide text-[#7A6A55] font-bold">Max Teams</p>
            <p className="font-display font-black text-[#1A1208] text-base">{contest.maxEntriesPerUser}</p>
          </div>
        </div>

        <div className="mb-3">
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
            ? "Join Contest"
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