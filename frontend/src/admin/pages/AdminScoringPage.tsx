import { useState } from "react";
import { api } from "@/admin/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Player {
  _id: string;
  name: string;
  role: string;
  team: "team1" | "team2";
  teamName: string;
}

interface MatchInfo {
  id: string;
  team1Name: string;
  team2Name: string;
  team1Players: { _id: string; name: string; role: string }[];
  team2Players: { _id: string; name: string; role: string }[];
  status: string;
}

// Keep this list aligned with backend DismissalType enum.
const DISMISSAL_TYPES = ["BOWLED", "CAUGHT", "LBW", "RUN_OUT", "STUMPED", "HIT_WICKET"];

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  input: { width: "100%", height: 40, padding: "0 12px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#101010", color: "#ddd", fontSize: 13, boxSizing: "border-box" as const, outline: "none" },
  label: { display: "block", fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 5, textTransform: "uppercase" as const, letterSpacing: "0.5px" },
  section: { background: "#151515", border: "1px solid #242424", borderRadius: 12, padding: 16, marginBottom: 16 },
};

// ── Toggle Button ──────────────────────────────────────────────────────────────

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      padding: "6px 12px", borderRadius: 8, border: `1px solid ${on ? "#EA4800" : "#2A2A2A"}`,
      background: on ? "rgba(234,72,0,.12)" : "transparent", color: on ? "#EA4800" : "#555",
      fontSize: 12, fontWeight: 700, cursor: "pointer",
    }}>{on ? "✓" : "○"} {label}</button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AdminScoringPage() {
  // Match Loading
  const [matchIdInput, setMatchIdInput] = useState("");
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [battingTeam, setBattingTeam] = useState<"team1" | "team2" | null>(null);

  // Player Selection
  const [batter,  setBatter]  = useState<Player | null>(null);
  const [bowler,  setBowler]  = useState<Player | null>(null);
  const [fielder, setFielder] = useState<Player | null>(null);
  const [batterSearch, setBatterSearch] = useState("");
  const [bowlerSearch, setBowlerSearch] = useState("");
  const [fielderSearch, setFielderSearch] = useState("");

  // Ball Event
  const [over,   setOver]   = useState(0);
  const [ball,   setBallN]  = useState(1);
  const [runs,   setRuns]   = useState(0);
  const [isWide,   setIsWide]   = useState(false);
  const [isNoBall, setIsNoBall] = useState(false);
  const [isLegBye, setIsLegBye] = useState(false);
  const [isFour,   setIsFour]   = useState(false);
  const [isSix,    setIsSix]    = useState(false);
  const [isOut,    setIsOut]    = useState(false);
  const [dismissalType, setDismissalType] = useState("BOWLED");
  const [isOverthrow, setIsOverthrow] = useState(false);
  const [overthrowRuns, setOverthrowRuns] = useState(1);
  const [overthrowBoundary, setOverthrowBoundary] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [log, setLog] = useState<string[]>([]);

  // Confirm
  const [confirming, setConfirming] = useState(false);

  // ── Load match + players ───────────────────────────────────────────────────

  async function loadMatch() {
    if (!matchIdInput.trim()) { setMatchError("Enter a Match ID"); return; }
    setLoadingMatch(true); setMatchError(""); setMatch(null); setPlayers([]);
    setBatter(null); setBowler(null); setFielder(null);
    try {
      const res = await api.get(`/matches/${matchIdInput.trim()}`);
      const m: MatchInfo = res.data?.data?.match ?? res.data?.data;
      setMatch(m);
      const all: Player[] = [
        ...(m.team1Players ?? []).map((p) => ({ ...p, team: "team1" as const, teamName: m.team1Name })),
        ...(m.team2Players ?? []).map((p) => ({ ...p, team: "team2" as const, teamName: m.team2Name })),
      ];
      setPlayers(all);
      setBattingTeam("team1");
    } catch (e: any) {
      setMatchError(e?.response?.data?.message ?? "Match not found");
    } finally { setLoadingMatch(false); }
  }

  // Auto-increment ball number after submit
  function advanceBall() {
    if (isWide || isNoBall) return; // extras don't count as a legal ball
    if (ball >= 6) { setOver((o) => o + 1); setBallN(1); }
    else setBallN((b) => b + 1);
  }

  function resetBallForm() {
    setRuns(0);
    setIsWide(false);
    setIsNoBall(false);
    setIsLegBye(false);
    setIsFour(false);
    setIsSix(false);
    setIsOut(false);
    setDismissalType("BOWLED");
    setIsOverthrow(false);
    setOverthrowRuns(1);
    setOverthrowBoundary(false);
    setFielder(null);
  }

  function applyQuickEvent(type: "DOT" | "ONE" | "TWO" | "FOUR" | "SIX" | "WIDE" | "NO_BALL" | "LEG_BYE_1" | "WICKET") {
    if (type === "DOT") {
      resetBallForm();
      return;
    }
    if (type === "ONE") {
      resetBallForm();
      setRuns(1);
      return;
    }
    if (type === "TWO") {
      resetBallForm();
      setRuns(2);
      return;
    }
    if (type === "FOUR") {
      resetBallForm();
      setRuns(4);
      setIsFour(true);
      return;
    }
    if (type === "SIX") {
      resetBallForm();
      setRuns(6);
      setIsSix(true);
      return;
    }
    if (type === "WIDE") {
      resetBallForm();
      setIsWide(true);
      return;
    }
    if (type === "NO_BALL") {
      resetBallForm();
      setIsNoBall(true);
      return;
    }
    if (type === "LEG_BYE_1") {
      resetBallForm();
      setIsLegBye(true);
      setRuns(1);
      return;
    }
    if (type === "WICKET") {
      resetBallForm();
      setIsOut(true);
      return;
    }
  }

  // ── Submit Ball Event ──────────────────────────────────────────────────────

  async function submitBall() {
    if (!match || !batter || !bowler) {
      setError("Load a match and select both a batter and a bowler."); return;
    }
    setSubmitting(true); setError(""); setSuccess("");
    const batterRuns = isLegBye ? 0 : runs;
    const legByeRuns = isLegBye ? runs : 0;
    const isDot = !isWide && !isNoBall && batterRuns === 0 && legByeRuns === 0 && !isFour && !isSix;
    const ballsFaced = (isWide || isNoBall) ? 0 : 1;
    const runsConceded = batterRuns + legByeRuns + (isWide ? 1 : 0) + (isNoBall ? 1 : 0) + (isOverthrow ? overthrowRuns : 0);

    const payload: Record<string, unknown> = {
      matchId:          match.id,
      battingPlayerId:  batter._id,
      bowlingPlayerId:  bowler._id,
      runs: batterRuns,
      isDotBall:   isDot,
      isFour,
      isSix,
      ballsFaced,
      isOut,
      isWide,
      isNoBall,
      runsConceded,
      isOverthrow,
      overNumber: over,
      ballNumber: ball,
    };
    if (isOut) {
      payload.dismissalType = dismissalType;
      if (fielder) payload.fieldingPlayerId = fielder._id;
    }
    if (isOverthrow) {
      payload.overthrowRuns = overthrowRuns;
      payload.overthrowIsBoundary = overthrowBoundary;
    }

    try {
      await api.post("/scores/ball", payload);
      const desc = `Over ${over}.${ball}: ${batter.name} ${isLegBye ? `${runs} LEG-BYE` : runs}${isFour ? " FOUR" : ""}${isSix ? " SIX" : ""}${isWide ? " WIDE" : ""}${isNoBall ? " NO-BALL" : ""}${isOut ? ` OUT (${dismissalType})` : ""} | Bowl: ${bowler.name}`;
      setLog((prev) => [desc, ...prev].slice(0, 30));
      setSuccess("✅ Ball submitted!");
      advanceBall();
      // Reset ball state for next entry while keeping selected batter/bowler.
      resetBallForm();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Error submitting ball");
    } finally { setSubmitting(false); }
  }

  async function confirmScores() {
    if (!match) { setError("Load a match first."); return; }
    setConfirming(true); setError(""); setSuccess("");
    try {
      await api.post(`/scores/confirm/${match.id}`);
      // Status transition is explicit: confirm scores first, then mark match completed.
      if (match.status !== "COMPLETED") {
        await api.patch(`/matches/${match.id}`, { status: "COMPLETED" });
        setMatch((prev) => (prev ? { ...prev, status: "COMPLETED" } : prev));
      }
      setSuccess("✅ Match confirmed and marked COMPLETED.");
    } catch (e: any) { setError(e?.response?.data?.message ?? "Error confirming"); }
    finally { setConfirming(false); }
  }

  const battingPlayers = battingTeam ? players.filter((p) => p.team === battingTeam) : [];
  const bowlingPlayers = battingTeam ? players.filter((p) => p.team !== battingTeam) : players;
  const filteredBattingPlayers = battingPlayers.filter((p) => p.name.toLowerCase().includes(batterSearch.toLowerCase()));
  const filteredBowlingPlayers = bowlingPlayers.filter((p) => p.name.toLowerCase().includes(bowlerSearch.toLowerCase()));
  const filteredFieldingPlayers = bowlingPlayers.filter((p) => p.name.toLowerCase().includes(fielderSearch.toLowerCase()));

  function pickDefaultPlayers(team: "team1" | "team2") {
    const bat = players.filter((p) => p.team === team);
    const bowl = players.filter((p) => p.team !== team);
    const defaultBatter = bat.find((p) => p.role === "BATSMAN") ?? bat.find((p) => p.role === "WICKET_KEEPER") ?? bat[0] ?? null;
    const defaultBowler = bowl.find((p) => p.role === "BOWLER") ?? bowl.find((p) => p.role === "ALL_ROUNDER") ?? bowl[0] ?? null;
    setBatter(defaultBatter);
    setBowler(defaultBowler);
    setFielder(defaultBowler);
  }

  function switchBattingTeam(team: "team1" | "team2") {
    setBattingTeam(team);
    setBatterSearch("");
    setBowlerSearch("");
    setFielderSearch("");
    pickDefaultPlayers(team);
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginBottom: 4 }}>Live Scoring</h1>
      <p style={{ color: "#555", fontSize: 13, marginBottom: 20 }}>Load match, pick players, submit ball.</p>

      {/* ── Step 1: Load Match ── */}
      <div style={S.section}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#aaa", marginBottom: 12 }}>① Load Match</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={matchIdInput} onChange={(e) => setMatchIdInput(e.target.value)}
            placeholder="Paste Match ObjectId — copy from Admin → Matches" style={{ ...S.input, flex: 1 }}
            onKeyDown={(e) => e.key === "Enter" && loadMatch()} />
          <button onClick={loadMatch} disabled={loadingMatch} style={{ padding: "0 20px", height: 40, border: "none", borderRadius: 8, background: "#EA4800", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
            {loadingMatch ? "Loading…" : "Load →"}
          </button>
        </div>
        {matchError && <div style={{ color: "#FCA5A5", fontSize: 12, marginTop: 8 }}>⚠️ {matchError}</div>}
        {match && (
          <div style={{ marginTop: 12, background: "#0F0F0F", borderRadius: 8, padding: "10px 14px", display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>{match.team1Name} <span style={{ color: "#444" }}>vs</span> {match.team2Name}</div>
              <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{players.length} players loaded</div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => switchBattingTeam("team1")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 8,
                    border: `1px solid ${battingTeam === "team1" ? "#EA4800" : "#2A2A2A"}`,
                    background: battingTeam === "team1" ? "rgba(234,72,0,.12)" : "#1A1A1A",
                    color: battingTeam === "team1" ? "#EA4800" : "#777",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {match.team1Name} batting
                </button>
                <button
                  onClick={() => switchBattingTeam("team2")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 8,
                    border: `1px solid ${battingTeam === "team2" ? "#EA4800" : "#2A2A2A"}`,
                    background: battingTeam === "team2" ? "rgba(234,72,0,.12)" : "#1A1A1A",
                    color: battingTeam === "team2" ? "#EA4800" : "#777",
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {match.team2Name} batting
                </button>
              </div>
              <div style={{ padding: "4px 10px", borderRadius: 20, background: match.status === "LIVE" ? "rgba(239,68,68,.15)" : "rgba(245,158,11,.15)", color: match.status === "LIVE" ? "#EF4444" : "#F59E0B", fontSize: 11, fontWeight: 900 }}>
                {match.status}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#ddd", background: "#1A1A1A", padding: "4px 12px", borderRadius: 8 }}>
                Over {over}.{ball - 1}
              </div>
            </div>
          </div>
        )}
      </div>

      {match && (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>

          {/* ── Player Panel ── */}
          <div style={S.section}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#aaa", marginBottom: 12 }}>② Players</div>

            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <label style={S.label}>Batter</label>
                <input
                  value={batterSearch}
                  onChange={(e) => setBatterSearch(e.target.value)}
                  placeholder="Search batter..."
                  style={{ ...S.input, marginBottom: 6 }}
                />
                <select
                  value={batter?._id ?? ""}
                  onChange={(e) => {
                    const p = players.find((x) => x._id === e.target.value) ?? null;
                    setBatter(p);
                  }}
                  style={{ ...S.input, appearance: "none" as const }}
                >
                  <option value="">Select batter</option>
                  {filteredBattingPlayers.map((p) => (
                    <option key={`bat-${p._id}`} value={p._id}>{p.name} ({p.teamName})</option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, maxHeight: 72, overflowY: "auto" }}>
                  {filteredBattingPlayers.slice(0, 12).map((p) => (
                    <button
                      key={`bat-chip-${p._id}`}
                      onClick={() => setBatter(p)}
                      style={{
                        border: `1px solid ${batter?._id === p._id ? "#EA4800" : "#2A2A2A"}`,
                        background: batter?._id === p._id ? "rgba(234,72,0,.14)" : "#0F0F0F",
                        color: batter?._id === p._id ? "#EA4800" : "#bbb",
                        borderRadius: 999,
                        padding: "4px 8px",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={S.label}>Bowler</label>
                <input
                  value={bowlerSearch}
                  onChange={(e) => setBowlerSearch(e.target.value)}
                  placeholder="Search bowler..."
                  style={{ ...S.input, marginBottom: 6 }}
                />
                <select
                  value={bowler?._id ?? ""}
                  onChange={(e) => {
                    const p = players.find((x) => x._id === e.target.value) ?? null;
                    setBowler(p);
                  }}
                  style={{ ...S.input, appearance: "none" as const }}
                >
                  <option value="">Select bowler</option>
                  {filteredBowlingPlayers.map((p) => (
                    <option key={`bowl-${p._id}`} value={p._id}>{p.name} ({p.teamName})</option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, maxHeight: 72, overflowY: "auto" }}>
                  {filteredBowlingPlayers.slice(0, 12).map((p) => (
                    <button
                      key={`bowl-chip-${p._id}`}
                      onClick={() => setBowler(p)}
                      style={{
                        border: `1px solid ${bowler?._id === p._id ? "#EA4800" : "#2A2A2A"}`,
                        background: bowler?._id === p._id ? "rgba(234,72,0,.14)" : "#0F0F0F",
                        color: bowler?._id === p._id ? "#EA4800" : "#bbb",
                        borderRadius: 999,
                        padding: "4px 8px",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={S.label}>Fielder (Optional)</label>
                <input
                  value={fielderSearch}
                  onChange={(e) => setFielderSearch(e.target.value)}
                  placeholder="Search fielder..."
                  style={{ ...S.input, marginBottom: 6 }}
                />
                <select
                  value={fielder?._id ?? ""}
                  onChange={(e) => {
                    const p = players.find((x) => x._id === e.target.value) ?? null;
                    setFielder(p);
                  }}
                  style={{ ...S.input, appearance: "none" as const }}
                >
                  <option value="">None</option>
                  {filteredFieldingPlayers.map((p) => (
                    <option key={`field-${p._id}`} value={p._id}>{p.name} ({p.teamName})</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 12, padding: "8px 10px", background: "#0F0F0F", borderRadius: 8, fontSize: 12 }}>
              <div style={{ color: "#9CA3AF", fontWeight: 600 }}>Batter: <span style={{ color: "#fff" }}>{batter?.name ?? "—"}</span></div>
              <div style={{ color: "#9CA3AF", fontWeight: 600 }}>Bowler: <span style={{ color: "#fff" }}>{bowler?.name ?? "—"}</span></div>
              <div style={{ color: "#9CA3AF", fontWeight: 600 }}>Fielder: <span style={{ color: "#fff" }}>{fielder?.name ?? "—"}</span></div>
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => battingTeam && pickDefaultPlayers(battingTeam)}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#121212", color: "#ddd", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                >
                  Auto Select Players
                </button>
              </div>
            </div>
          </div>

          {/* ── Ball Event Panel ── */}
          <div>
            <div style={S.section}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#aaa", marginBottom: 12 }}>③ Ball Event — {over}.{ball}</div>

              {error   && <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#FCA5A5", marginBottom: 12 }}>⚠️ {error}</div>}
              {success && <div style={{ background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.3)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#6EE7B7", marginBottom: 12 }}>{success}</div>}

              {/* Quick actions */}
              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>Quick Actions</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <button onClick={() => applyQuickEvent("DOT")} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#0F0F0F", color: "#ddd", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Dot</button>
                  <button onClick={() => applyQuickEvent("ONE")} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#0F0F0F", color: "#ddd", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>1 Run</button>
                  <button onClick={() => applyQuickEvent("TWO")} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#0F0F0F", color: "#ddd", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>2 Runs</button>
                  <button onClick={() => applyQuickEvent("FOUR")} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #EA4800", background: "rgba(234,72,0,.12)", color: "#EA4800", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Four</button>
                  <button onClick={() => applyQuickEvent("SIX")} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #EA4800", background: "rgba(234,72,0,.12)", color: "#EA4800", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Six</button>
                  <button onClick={() => applyQuickEvent("WIDE")} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#0F0F0F", color: "#ddd", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Wide</button>
                  <button onClick={() => applyQuickEvent("NO_BALL")} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#0F0F0F", color: "#ddd", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>No Ball</button>
                  <button onClick={() => applyQuickEvent("LEG_BYE_1")} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#0F0F0F", color: "#ddd", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Leg Bye +1</button>
                  <button onClick={() => applyQuickEvent("WICKET")} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #EF4444", background: "rgba(239,68,68,.12)", color: "#EF4444", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Wicket</button>
                  <button onClick={resetBallForm} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #2A2A2A", background: "transparent", color: "#777", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Reset Ball</button>
                </div>
              </div>

              {/* Runs */}
              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>{isLegBye ? "Leg Bye Runs" : "Runs Scored by Batter"}</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {[0, 1, 2, 3, 4, 5, 6].map((r) => (
                    <button key={r} onClick={() => { setRuns(r); if (!isLegBye) { if (r === 4) setIsFour(true); if (r === 6) setIsSix(true); if (r !== 4) setIsFour(false); if (r !== 6) setIsSix(false); } }}
                      style={{ flex: 1, height: 44, borderRadius: 8, border: `2px solid ${runs === r ? "#EA4800" : "#2A2A2A"}`, background: runs === r ? "rgba(234,72,0,.15)" : "#0F0F0F", color: runs === r ? "#EA4800" : "#666", fontWeight: 900, fontSize: 16, cursor: "pointer" }}>
                      {r}
                    </button>
                  ))}
                </div>
                {isLegBye && <div style={{ marginTop: 6, fontSize: 11, color: "#9CA3AF" }}>Leg-bye runs are counted as extras, not batter runs.</div>}
              </div>

              {/* Over / Ball */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={S.label}>Over Number</label>
                  <input type="number" min={0} max={49} value={over} onChange={(e) => setOver(Number(e.target.value))} style={S.input} />
                </div>
                <div>
                  <label style={S.label}>Ball Number (1–6)</label>
                  <input type="number" min={1} max={6} value={ball} onChange={(e) => setBallN(Number(e.target.value))} style={S.input} />
                </div>
              </div>

              {/* Delivery extras */}
              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>Delivery Type</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <Toggle label="Wide"    on={isWide}   onChange={setIsWide} />
                  <Toggle label="No Ball" on={isNoBall} onChange={setIsNoBall} />
                  <Toggle label="Leg Bye" on={isLegBye} onChange={(v) => { setIsLegBye(v); if (v) { setIsFour(false); setIsSix(false); } }} />
                  <Toggle label="Four" on={isFour}   onChange={(v) => { if (isLegBye) return; setIsFour(v); if (v) setRuns(4); }} />
                  <Toggle label="Six"  on={isSix}    onChange={(v) => { if (isLegBye) return; setIsSix(v);  if (v) setRuns(6); }} />
                </div>
              </div>

              {/* Wicket */}
              <div style={{ marginBottom: 14 }}>
                <Toggle label="Wicket / Out" on={isOut} onChange={setIsOut} />
                {isOut && (
                  <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={S.label}>Dismissal Type</label>
                      <select value={dismissalType} onChange={(e) => setDismissalType(e.target.value)} style={{ ...S.input, appearance: "none" as any }}>
                        {DISMISSAL_TYPES.map((d) => <option key={d}>{d}</option>)}
                      </select>
                      {dismissalType === "RUN_OUT" && (
                        <div style={{ fontSize: 11, color: "#F59E0B", marginTop: 6 }}>
                          Run-out does not give wicket points to bowler.
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <div style={{ fontSize: 12, color: fielder ? "#F59E0B" : "#444", fontWeight: 600 }}>
                        Fielder: {fielder?.name ?? "Select fielder from dropdown"}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Overthrow */}
              <div style={{ marginBottom: 20 }}>
                <Toggle label="Overthrow" on={isOverthrow} onChange={setIsOverthrow} />
                {isOverthrow && (
                  <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={S.label}>Overthrow Runs</label>
                      <input type="number" min={1} value={overthrowRuns} onChange={(e) => setOverthrowRuns(Number(e.target.value))} style={S.input} />
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <Toggle label="Boundary" on={overthrowBoundary} onChange={setOverthrowBoundary} />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 12, padding: "8px 10px", background: "#0F0F0F", borderRadius: 8, fontSize: 12, color: "#9CA3AF" }}>
                <span style={{ fontWeight: 700, color: "#ddd" }}>This ball:</span>{" "}
                {runs}{isLegBye ? " Leg-bye" : " Run(s)"}
                {isWide ? " + Wide" : ""}
                {isNoBall ? " + No Ball" : ""}
                {isOverthrow ? ` + ${overthrowRuns} Overthrow` : ""}
                {isOut ? ` + Wicket (${dismissalType})` : ""}
              </div>

              <button onClick={submitBall} disabled={submitting || !batter || !bowler}
                style={{ width: "100%", height: 52, border: "none", borderRadius: 10, background: (!batter || !bowler) ? "#1A1A1A" : submitting ? "#5A2D00" : "linear-gradient(135deg,#EA4800,#FF5A1A)", color: (!batter || !bowler) ? "#333" : "#fff", fontWeight: 900, fontSize: 16, cursor: (!batter || !bowler) ? "not-allowed" : "pointer" }}>
                {submitting ? "Submitting..." : (!batter || !bowler) ? "Select batter + bowler first" : `Submit Ball (${runs}${isLegBye ? " LB" : ""}${isWide ? " +WD" : ""}${isNoBall ? " +NB" : ""}${isOut ? " WKT" : ""})`}
              </button>
            </div>

            {/* ── Confirm Match ── */}
            <div style={{ ...S.section, borderTop: "3px solid #10B981" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#aaa", marginBottom: 8 }}>④ Confirm Scores</div>
              <p style={{ color: "#555", fontSize: 12, marginBottom: 12 }}>Use this only after match end.</p>
              <button onClick={confirmScores} disabled={confirming} style={{ width: "100%", height: 44, border: "none", borderRadius: 10, background: confirming ? "#064E3B" : "#10B981", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                {confirming ? "Confirming..." : "Confirm Match Scores"}
              </button>
            </div>

            {/* ── Ball Log ── */}
            {log.length > 0 && (
              <div style={{ ...S.section, maxHeight: 200, overflowY: "auto" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#555", marginBottom: 8 }}>Ball Log</div>
                {log.map((entry, i) => (
                  <div key={i} style={{ fontSize: 11, color: "#444", borderBottom: "1px solid #1A1A1A", padding: "4px 0" }}>
                    {entry}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
