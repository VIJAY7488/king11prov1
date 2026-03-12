import type { FantasyTeam } from "@/types";
import { Modal } from "../ui/modal";


interface Props {
  show: boolean;
  onClose: () => void;
  team: FantasyTeam | null;
  livePoints?: number;
}

const ROLE_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  WK:   { bg: "#FFF8E1", text: "#E65100", border: "#FFE0B2" },
  BAT:  { bg: "#E8F5E9", text: "#2E7D32", border: "#C8E6C9" },
  AR:   { bg: "#E3F2FD", text: "#1565C0", border: "#BBDEFB" },
  BOWL: { bg: "#FFEBEE", text: "#C62828", border: "#FFCDD2" },
};

export function ViewTeamModal({ show, onClose, team, livePoints }: Props) {
  if (!team) return null;

  return (
    <Modal show={show} onClose={onClose} title={`👕 ${team.name}`} size="lg">
      {/* Stats row */}
      <div className="flex justify-around bg-[#F4F1EC] rounded-xl p-4 mb-5">
        {[
          ["Captain", team.captain, "text-yellow-600"],
          ["Vice Cap.", team.viceCaptain, "text-[#EA4800]"],
          ["Live Pts", String(team.livePts ? livePoints : team.pts), "text-[#EA4800]"],
        ].map(([label, val, color]) => (
          <div key={label} className="text-center">
            <div className="text-xs font-bold text-[#7A6A55] uppercase tracking-wide mb-1">{label}</div>
            <div className={`font-bold text-sm ${color}`}>{val}</div>
          </div>
        ))}
      </div>

      {/* Players grid */}
      {team.players.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {team.players.map((p) => {
            const isCap = team.captain === p.name;
            const isVC = team.viceCaptain === p.name;
            const rc = ROLE_COLOR[p.role];
            return (
              <div
                key={p.id}
                className="flex items-center gap-2.5 p-2.5 rounded-xl border-[1.5px] transition-all"
                style={{
                  background: isCap ? "#FFF9E6" : isVC ? "#E3F2FD" : "#F4F1EC",
                  borderColor: isCap ? "#F59E0B" : isVC ? "#60A5FA" : "#E8E0D4",
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[0.65rem] font-black shrink-0"
                  style={{ background: rc.bg, border: `1.5px solid ${rc.border}`, color: rc.text }}
                >
                  {p.short.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 font-bold text-xs truncate">
                    {p.short}
                    {isCap && <span className="text-yellow-600 font-black text-[0.6rem]">C</span>}
                    {isVC && <span className="text-[#EA4800] font-black text-[0.6rem]">VC</span>}
                  </div>
                  <div className="text-[0.65rem] text-[#7A6A55]">{p.team} · {p.role}</div>
                </div>
                <div className="text-xs font-bold text-[#EA4800] shrink-0">{p.pts}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-[#7A6A55]">
          <p className="text-3xl mb-2">📋</p>
          <p className="font-bold text-[#3D3020]">No player details</p>
        </div>
      )}
    </Modal>
  );
}