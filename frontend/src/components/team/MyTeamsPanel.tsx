import type { FantasyTeam } from "@/types";
import { Card, CardHeader } from "../ui/card";
import { Button } from "../ui/button";


interface Props {
  teams: FantasyTeam[];
  livePoints: number;
  onCreate: () => void;
  onView: (t: FantasyTeam) => void;
}

export function MyTeamsPanel({ teams, livePoints, onCreate, onView }: Props) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <span className="font-display font-bold text-base">👕 My Teams</span>
        <Button size="sm" onClick={onCreate}>+ Create</Button>
      </CardHeader>

      {teams.length === 0 ? (
        <div className="text-center py-12 px-6">
          <span className="text-5xl block mb-3">👕</span>
          <p className="font-display font-bold text-[#3D3020] mb-1">No Teams Yet</p>
          <p className="text-sm text-[#7A6A55] mb-4">Create your first dream XI</p>
          <Button onClick={onCreate}>⚡ Create Team</Button>
        </div>
      ) : (
        <div>
          {teams.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 px-5 py-4 border-b border-[#E8E0D4] last:border-b-0 cursor-pointer hover:bg-[#FAFAF8] transition-colors"
              onClick={() => onView(t)}
            >
              <div className="w-10 h-10 rounded-xl bg-[#F4F1EC] border-[1.5px] border-[#E8E0D4] flex items-center justify-center text-xl shrink-0">
                {t.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">{t.name}</p>
                <p className="text-[0.75rem] text-[#7A6A55]">
                  {t.matchLabel} · C: {t.captain}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-display font-black text-[1.375rem] text-[#EA4800] leading-tight">
                  {t.livePts ? livePoints : t.pts}
                </p>
                <p className="text-[0.65rem] text-[#7A6A55]">Live Pts</p>
              </div>
              <span className="text-[#7A6A55]">›</span>
            </div>
          ))}

          <button
            className="w-full py-3.5 text-sm font-semibold text-[#7A6A55] hover:text-[#EA4800] transition-colors flex items-center justify-center gap-1.5"
            onClick={onCreate}
          >
            + Create New Team
          </button>
        </div>
      )}
    </Card>
  );
}