import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { Match } from "../../types";
import { cn } from "@/lib/utils";
import { LiveBadge, UpcomingBadge } from "../ui/live-badges";

interface MatchCardProps {
  match: Match;
  onJoin?: (m: Match) => void;
  onSelect?: (m: Match) => void;
  selected?: boolean;
}

export function MatchCard({ match, onJoin, onSelect, selected }: MatchCardProps) {
  const live = match.status === "live";

  return (
    <div
      className={cn(
        // Use inline style for the top accent border to avoid Tailwind shorthand conflicts.
        // border-[1.5px] sets all sides; adding border-t-[3px] after it would be overridden
        // at the same specificity level. Using style prop guarantees correct layering.
        "bg-white rounded-2xl overflow-hidden shadow-sm cursor-pointer transition-all duration-300",
        "hover:-translate-y-1 hover:shadow-[0_16px_48px_rgba(26,18,8,.13)]",
        // Base border for all sides
        "border-[1.5px] border-[#E8E0D4]",
        // Selected state — override border color via ring so it doesn't fight border-t
        selected && "ring-2 ring-[#EA4800] border-[#EA4800]"
      )}
      // Top accent border set via inline style to avoid Tailwind class conflict
      style={{ borderTopWidth: "3px", borderTopColor: "#EA4800" }}
      onClick={() => (onSelect ? onSelect(match) : onJoin?.(match))}
    >
      {/* Header */}
      <div className="bg-[#F4F1EC] border-b-[1.5px] border-[#E8E0D4] px-4 py-2.5 flex items-center justify-between">
        <span className="text-[0.75rem] font-semibold text-[#7A6A55] flex items-center gap-1.5">
          <span>{match.flag}</span>
          {match.league} — {match.format}
        </span>
        {live
          ? <LiveBadge over={match.liveOver} />
          : <UpcomingBadge timeLeft={match.timeLeft} />}
      </div>

      {/* Teams */}
      <div className="p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center mb-4">
          {/* Team A */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-[52px] h-[52px] rounded-xl bg-[#F4F1EC] border-[1.5px] border-[#E8E0D4] flex items-center justify-center text-2xl">
              {match.teamA.emoji}
            </div>
            <p className="font-bold text-[0.875rem] text-center text-[#1A1208]">{match.teamA.short}</p>
            {match.teamA.score && (
              <p className="text-[0.7rem] text-[#7A6A55]">{match.teamA.score}</p>
            )}
          </div>

          {/* VS */}
          <div className="text-center">
            <p className="font-black text-lg text-[#D4C8B8] tracking-[3px] leading-none">VS</p>
            <p className={`text-[0.7rem] font-bold mt-1 ${live ? "text-[#EA4800]" : "text-[#7A6A55]"}`}>
              {live ? `● ${match.liveOver} OV` : match.matchTime}
            </p>
          </div>

          {/* Team B */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-[52px] h-[52px] rounded-xl bg-[#F4F1EC] border-[1.5px] border-[#E8E0D4] flex items-center justify-center text-2xl">
              {match.teamB.emoji}
            </div>
            <p className="font-bold text-[0.875rem] text-center text-[#1A1208]">{match.teamB.short}</p>
            {match.teamB.score && (
              <p className="text-[0.7rem] text-[#7A6A55]">{match.teamB.score}</p>
            )}
          </div>
        </div>

        <div className="h-px bg-[#E8E0D4] mb-3" />

        {/* Footer row */}
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <div className="font-display font-black text-[1.1rem] text-[#EA4800] leading-tight">{match.prize}</div>
            <div className="text-[0.7rem] text-[#7A6A55] mt-0.5">Prize Pool</div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-[0.7rem] text-[#7A6A55] mb-1.5">
              <span>{match.filled}% filled</span>
              <span>{match.spotsLeft}</span>
            </div>
            <Progress value={match.filled} />
          </div>

          {onJoin && (
            <Button
              variant="default"
              size="sm"
              className="shrink-0"
              onClick={(e) => { e.stopPropagation(); onJoin(match); }}
            >
              {live ? "🔴 Join" : "Join"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}