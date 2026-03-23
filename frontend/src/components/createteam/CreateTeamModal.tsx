import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StepsBar } from "../ui/steps-bar";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import type { MatchFromApi, TeamFromApi } from "@/types/api";

const ROLE_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  WICKET_KEEPER: { bg: "#FFF8E1", text: "#E65100", border: "#FFE0B2" },
  BATSMAN:       { bg: "#E8F5E9", text: "#2E7D32", border: "#C8E6C9" },
  ALL_ROUNDER:   { bg: "#E3F2FD", text: "#1565C0", border: "#BBDEFB" },
  BOWLER:        { bg: "#FFEBEE", text: "#C62828", border: "#FFCDD2" },
};

export interface ApiPlayer {
  _id: string;
  name: string;
  role: "WICKET_KEEPER" | "BATSMAN" | "ALL_ROUNDER" | "BOWLER";
  team: string; // name
  credits: number;
}

interface Props {
  show: boolean;
  onClose: () => void;
  match: MatchFromApi | null;
  onSaved: () => void;
  mode?: "create" | "edit";
  initialTeam?: TeamFromApi | null;
  addToast: (opts: { type: "success" | "error" | "info"; icon?: string; msg: string }) => void;
}

function formatTeamSaveError(error: unknown): string {
  const raw = getErrorMessage(error, "Error saving team").replace(/^Error:\s*/i, "").trim();
  const normalized = raw.toLowerCase();

  if (normalized.includes("at least 4 batsmen")) return "Please select at least 4 batsmen.";
  if (normalized.includes("at least 3 bowlers")) return "Please select at least 3 bowlers.";
  if (normalized.includes("at least 1 all-rounder")) return "Please select at least 1 all-rounder.";
  if (normalized.includes("at most 8 all-rounders")) return "Please select at most 8 all-rounders.";
  if (normalized.includes("at least 1 wicket-keeper")) return "Please select at least 1 wicket-keeper.";
  if (normalized.includes("exactly 11 players")) return "Please select exactly 11 players.";
  if (normalized.includes("exactly 1 captain")) return "Please select exactly 1 captain.";
  if (normalized.includes("exactly 1 vice-captain")) return "Please select exactly 1 vice-captain.";
  if (normalized.includes("captain and vice-captain must be different")) return "Captain and vice-captain must be different players.";
  if (normalized.includes("duplicate players")) return "Duplicate players are not allowed in a team.";

  return raw || "Error saving team";
}

export function CreateTeamModal({
  show,
  onClose,
  match,
  onSaved,
  mode = "create",
  initialTeam = null,
  addToast,
}: Props) {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<ApiPlayer[]>([]);
  const [captain, setCaptain] = useState<ApiPlayer | null>(null);
  const [vc, setVc] = useState<ApiPlayer | null>(null);
  const [teamName, setTeamName] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [saving, setSaving] = useState(false);
  const [contestId, setContestId] = useState("");
  const [contests, setContests] = useState<{ id: string; name: string; entryFee: number }[]>([]);
  const [loadingContests, setLoadingContests] = useState(false);
  // Auto-fetch contests for this match whenever the modal opens
  useEffect(() => {
    if (!show || !match) return;
    setContestId(initialTeam?.contestId ?? "");
    setContests([]);
    setLoadingContests(true);
    const matchId = match.id ?? match._id ?? "";
    api.get(`/contests?matchId=${matchId}&limit=20`)
      .then((res) => {
        const list = res.data?.data?.contests ?? [];
        const mapped = list.map((c: any) => ({ id: c.id ?? c._id, name: c.name, entryFee: c.entryFee }));
        setContests(mapped);
        // Auto-select the only contest silently — user never sees a picker.
        // In edit mode, keep contest locked to the team's existing contestId.
        if (initialTeam?.contestId) setContestId(initialTeam.contestId);
        else if (mapped.length === 1) setContestId(mapped[0].id);
      })
      .catch((err) => {
        addToast({ type: "error", icon: "❌", msg: getErrorMessage(err, "Failed to load contests for this match") });
      })
      .finally(() => setLoadingContests(false));
  }, [show, match, initialTeam]);

  // Build real player list from the match object (team1Players + team2Players).
  // The backend stores {_id, name, role} per player on the match doc.
  // We assign default credits by role since the squad schema doesn't carry credits.
  const DEFAULT_CREDITS: Record<string, number> = {
    WICKET_KEEPER: 9.0, BATSMAN: 8.5, ALL_ROUNDER: 9.5, BOWLER: 8.0,
  };

  const players: ApiPlayer[] = match ? [
    ...(match.team1Players ?? []).map((p) => ({
      _id:     p._id,
      name:    p.name,
      role:    p.role as ApiPlayer["role"],
      team:    match.team1Name,
      credits: DEFAULT_CREDITS[p.role] ?? 8.5,
    })),
    ...(match.team2Players ?? []).map((p) => ({
      _id:     p._id,
      name:    p.name,
      role:    p.role as ApiPlayer["role"],
      team:    match.team2Name,
      credits: DEFAULT_CREDITS[p.role] ?? 8.5,
    })),
  ] : [];

  const credits = selected.reduce((a, p) => a + p.credits, 0);

  useEffect(() => {
    if (!show || !initialTeam || !players.length) return;

    const selectedPlayers = initialTeam.players
      .map((tp) => players.find((p) => p._id === tp.playerId))
      .filter(Boolean) as ApiPlayer[];

    const captainPlayerId = initialTeam.players.find((p) => p.captainRole === "CAPTAIN")?.playerId;
    const viceCaptainPlayerId = initialTeam.players.find((p) => p.captainRole === "VICE_CAPTAIN")?.playerId;

    setSelected(selectedPlayers);
    setCaptain(selectedPlayers.find((p) => p._id === captainPlayerId) ?? null);
    setVc(selectedPlayers.find((p) => p._id === viceCaptainPlayerId) ?? null);
    setTeamName(initialTeam.teamName ?? "");
    setContestId(initialTeam.contestId ?? "");
    setStep(0);
  }, [show, initialTeam, players]);

  const roleCounts = selected.reduce<Record<string, number>>((acc, p) => {
    acc[p.role] = (acc[p.role] || 0) + 1;
    return acc;
  }, {});

  const filtered = players.filter((p) => {
    if (roleFilter !== "ALL" && p.role !== roleFilter) return false;
    if (teamFilter !== "ALL" && p.team !== teamFilter) return false;
    return true;
  });
  const team1Name = match?.team1Name ?? "Team 1";
  const team2Name = match?.team2Name ?? "Team 2";
  const filteredTeam1 = filtered.filter((p) => p.team === team1Name);
  const filteredTeam2 = filtered.filter((p) => p.team === team2Name);
  const selectedTeam1 = selected.filter((p) => p.team === team1Name).length;
  const selectedTeam2 = selected.filter((p) => p.team === team2Name).length;

  const isSel = (p: ApiPlayer) => selected.some((s) => s._id === p._id);

  function canAdd(p: ApiPlayer): boolean {
    if (isSel(p)) return true;
    if (selected.length >= 11) return false;
    if (credits + p.credits > 100) return false;
    const rc = { ...roleCounts, [p.role]: (roleCounts[p.role] || 0) + 1 };
    if ((rc.WICKET_KEEPER || 0) > 4) return false;
    if ((rc.BOWLER || 0) > 6) return false;
    if ((rc.BATSMAN || 0) > 6) return false;
    if ((rc.ALL_ROUNDER || 0) > 8) return false;
    return true;
  }

  function toggle(p: ApiPlayer) {
    if (isSel(p)) {
      setSelected((prev) => prev.filter((s) => s._id !== p._id));
      if (captain?._id === p._id) setCaptain(null);
      if (vc?._id === p._id) setVc(null);
    } else if (canAdd(p)) {
      setSelected((prev) => [...prev, p]);
    } else {
      addToast({
        type: "error", icon: "⚠️",
        msg: selected.length >= 11 ? "Max 11 players selected" : "Role limit or credits exceeded",
      });
    }
  }

  async function handleSave() {
    if (!contestId.trim()) {
      addToast({ type: "error", icon: "⚠️", msg: "Please select or enter a Contest ID" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        contestId: contestId.trim(),
        teamName: teamName.trim() || "My Dream Team",
        players: selected.map((p) => ({
          playerId:    p._id,
          playerName:  p.name,
          playerRole:  p.role,
          captainRole: captain?._id === p._id ? "CAPTAIN" : vc?._id === p._id ? "VICE_CAPTAIN" : "NONE",
          teamName:    p.team,   // team1Name or team2Name from the match
        })),
      };

      const editingTeamId = initialTeam?.id ?? initialTeam?._id;
      if (mode === "edit" && editingTeamId) {
        await api.patch(`/users/team/${editingTeamId}`, payload);
      } else {
        await api.post("/users/form-team", payload);
      }

      setSaving(false);
      setStep(0); setSelected([]); setCaptain(null); setVc(null); setTeamName("");
      onSaved();
    } catch (err) {
      setSaving(false);
      addToast({
        type: "error", icon: "❌",
        msg: formatTeamSaveError(err),
      });
    }
  }

  function canNext() {
    if (step === 0) {
      const arCount = roleCounts.ALL_ROUNDER || 0;
      return selected.length === 11 && arCount >= 1 && arCount <= 8;
    }
    if (step === 1) return captain && vc && captain._id !== vc._id;
    return true;
  }

  const ROLE_FILTERS = ["ALL", "WICKET_KEEPER", "BATSMAN", "ALL_ROUNDER", "BOWLER"];

  /* ── Step 0: Pick Players ── */
  const step0 = (
    <div>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {ROLE_FILTERS.map((r) => (
          <button key={r} onClick={() => setRoleFilter(r)}
            className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${roleFilter === r ? "bg-[#EA4800] text-white border-[#EA4800]" : "bg-white border-[#E8E0D4] text-[#7A6A55] hover:border-[#EA4800] hover:text-[#EA4800]"}`}>
            {r === "WICKET_KEEPER" ? "WK" : r === "BATSMAN" ? "BAT" : r === "ALL_ROUNDER" ? "AR" : r === "BOWLER" ? "BOWL" : "ALL"}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {[
          { key: "ALL", label: "ALL" },
          { key: team1Name, label: team1Name },
          { key: team2Name, label: team2Name },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTeamFilter(t.key)}
            className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
              teamFilter === t.key
                ? "bg-[#1A1208] text-white border-[#1A1208]"
                : "bg-white border-[#E8E0D4] text-[#7A6A55] hover:border-[#1A1208] hover:text-[#1A1208]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-[#FFF0EA] border-[1.5px] border-[#FFDDCC] rounded-xl p-3 mb-3 flex justify-between items-center flex-wrap gap-2">
        <span className="text-sm font-bold text-[#EA4800]">👥 {selected.length}/11 players</span>
        <span className="text-sm font-bold text-[#EA4800]">💰 {credits.toFixed(1)}/100 credits</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg border border-[#E8E0D4] bg-[#FAFAF8] p-2.5 text-xs text-[#7A6A55]">
          <span className="font-black text-[#1A1208]">{team1Name}</span>: {selectedTeam1} selected
        </div>
        <div className="rounded-lg border border-[#E8E0D4] bg-[#FAFAF8] p-2.5 text-xs text-[#7A6A55]">
          <span className="font-black text-[#1A1208]">{team2Name}</span>: {selectedTeam2} selected
        </div>
      </div>

      <div className="flex flex-col gap-2 max-h-[45vh] overflow-y-auto pr-1">
        {(teamFilter === "ALL" || teamFilter === team1Name) && (
          <>
            <div className="text-[0.68rem] uppercase tracking-wide font-black text-[#7A6A55] mt-1">{team1Name}</div>
            {filteredTeam1.map((p) => {
              const sel = isSel(p);
              const ok = canAdd(p);
              const rc = ROLE_COLOR[p.role];
              return (
                <div key={p._id}
                  onClick={() => toggle(p)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-[1.5px] cursor-pointer transition-all ${sel ? "border-[#EA4800] bg-[#FFF0EA]" : "border-[#E8E0D4] bg-white hover:border-[#EA4800]"} ${!sel && !ok ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                    style={{ background: rc.bg, border: `1.5px solid ${rc.border}`, color: rc.text }}>
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 font-bold text-sm">{p.name}</div>
                    <div className="text-xs text-[#7A6A55]">{p.role.replace("_", " ")}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-sm">₹{p.credits}</div>
                    <div className="text-[0.65rem] text-[#7A6A55]">Credits</div>
                  </div>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${sel ? "bg-[#EA4800] text-white" : "bg-[#F4F1EC] text-[#7A6A55]"}`}>
                    {sel ? "✓" : ""}
                  </div>
                </div>
              );
            })}
          </>
        )}
        {(teamFilter === "ALL" || teamFilter === team2Name) && (
          <>
            <div className="text-[0.68rem] uppercase tracking-wide font-black text-[#7A6A55] mt-2">{team2Name}</div>
            {filteredTeam2.map((p) => {
              const sel = isSel(p);
              const ok = canAdd(p);
              const rc = ROLE_COLOR[p.role];
              return (
                <div key={p._id}
                  onClick={() => toggle(p)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-[1.5px] cursor-pointer transition-all ${sel ? "border-[#EA4800] bg-[#FFF0EA]" : "border-[#E8E0D4] bg-white hover:border-[#EA4800]"} ${!sel && !ok ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                    style={{ background: rc.bg, border: `1.5px solid ${rc.border}`, color: rc.text }}>
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 font-bold text-sm">{p.name}</div>
                    <div className="text-xs text-[#7A6A55]">{p.role.replace("_", " ")}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-sm">₹{p.credits}</div>
                    <div className="text-[0.65rem] text-[#7A6A55]">Credits</div>
                  </div>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${sel ? "bg-[#EA4800] text-white" : "bg-[#F4F1EC] text-[#7A6A55]"}`}>
                    {sel ? "✓" : ""}
                  </div>
                </div>
              );
            })}
          </>
        )}
        {filtered.length === 0 && (
          <div className="text-sm text-[#7A6A55] py-6 text-center border border-[#E8E0D4] rounded-xl bg-[#FAFAF8]">
            No players found for selected filters.
          </div>
        )}
      </div>
    </div>
  );

  /* ── Step 1: C & VC ── */
  const step1 = (
    <div>
      <p className="text-[#7A6A55] text-sm mb-4">Captain gets 2× points, Vice Captain gets 1.5× points.</p>
      <div className="flex flex-col gap-2">
        {selected.map((p) => {
          const isCap = captain?._id === p._id;
          const isVC = vc?._id === p._id;
          const rc = ROLE_COLOR[p.role];
          return (
            <div key={p._id}
              className={`flex items-center gap-3 p-3 rounded-xl border-[1.5px] ${isCap ? "border-yellow-400 bg-yellow-50" : isVC ? "border-blue-400 bg-blue-50" : "border-[#E8E0D4] bg-white"}`}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                style={{ background: rc.bg, border: `1.5px solid ${rc.border}`, color: rc.text }}>
                {p.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="font-bold text-sm">{p.name}</div>
                <div className="text-xs text-[#7A6A55]">{p.team} · {p.role}</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { if (vc?._id === p._id) setVc(null); setCaptain(isCap ? null : p); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all ${isCap ? "bg-yellow-500 text-white border-yellow-500" : "bg-white border-[#E8E0D4] text-[#7A6A55] hover:border-yellow-400"}`}>
                  C
                </button>
                <button
                  onClick={() => { if (captain?._id === p._id) setCaptain(null); setVc(isVC ? null : p); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all ${isVC ? "bg-[#EA4800] text-white border-[#EA4800]" : "bg-white border-[#E8E0D4] text-[#7A6A55] hover:border-[#EA4800]"}`}>
                  VC
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ── Step 2: Team Name + Preview + Save ── */
  const step2 = (
    <div>
      {/* If multiple contests for this match, show a picker — otherwise silently auto-selected */}
      {mode === "create" && contests.length > 1 && (
        <div className="mb-4">
          <label className="block text-xs font-bold text-[#3D3020] mb-1.5">Select Contest</label>
          <select value={contestId} onChange={(e) => setContestId(e.target.value)}
            className="w-full border-[1.5px] border-[#E8E0D4] rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-[#EA4800]">
            <option value="">— Pick a contest —</option>
            {contests.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.entryFee === 0 ? "FREE ENTRY" : `₹${c.entryFee} entry`})
              </option>
            ))}
          </select>
        </div>
      )}
      {loadingContests && <p className="text-xs text-[#7A6A55] mb-3">Loading contests…</p>}
      {!loadingContests && contests.length === 0 && mode === "create" && (
        <p className="text-xs text-red-500 mb-3">⚠️ No contests found for this match. Create one in Admin → Contests first.</p>
      )}
      {mode === "edit" && (
        <p className="text-xs text-[#7A6A55] mb-3">Contest is fixed while editing a team.</p>
      )}

      {/* Team Name */}
      <div className="mb-4">
        <label className="block text-xs font-bold text-[#3D3020] mb-1.5">Team Name</label>
        <Input value={teamName} onChange={(e) => setTeamName(e.target.value)}
          placeholder="My Dream Team" />
      </div>

      {/* Summary */}
      <div className="bg-[#F4F1EC] rounded-xl p-4 mb-4 space-y-2.5">
        {[
          ["Players Selected", `${selected.length}/11`],
          ["Captain", captain?.name ?? "Not set"],
          ["Vice Captain", vc?.name ?? "Not set"],
          ["Credits Used", `${credits.toFixed(1)}/100`],
        ].map(([l, v]) => (
          <div key={l} className="flex justify-between border-b border-[#E8E0D4] pb-2 last:border-b-0 last:pb-0">
            <span className="text-sm text-[#7A6A55]">{l}</span>
            <span className="font-bold text-[#1A1208]">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const STEP_CONTENT = [step0, step1, step2];
  const STEP_TITLES = ["Pick 11 Players", "Captain & Vice Captain", "Preview & Save"];

  return (
    <Modal show={show} onClose={onClose} title={STEP_TITLES[step]} size="lg"
      footer={
        <div className="flex justify-between w-full">
          {step > 0
            ? <Button variant="outline" onClick={() => setStep((s) => s - 1)}>← Back</Button>
            : <div />}
          {step < 2
            ? <Button disabled={!canNext()} onClick={() => setStep((s) => s + 1)}>
                {step === 0 ? `Next (${selected.length}/11)` : "Next →"}
              </Button>
            : <Button disabled={saving} onClick={handleSave} className="min-w-[140px]">
                {saving
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : mode === "edit" ? "💾 Update Team" : "💾 Save Team"}
              </Button>}
        </div>
      }
    >
      <StepsBar current={step} steps={["Pick Players", "C & VC", "Preview"]} />
      {STEP_CONTENT[step]}
    </Modal>
  );
}
