import { useEffect, useState } from "react";
import { api } from "@/admin/api";

interface Match {
  id: string;
  _id?: string;
  name?: string;
  team1Name: string;
  team2Name: string;
  format: string;
  status: string;
  matchDate: string;
  venue: string;
}

interface PlayerEntry {
  _id: string;
  name: string;
  role: string;
}

const PLAYER_ROLES = ["WICKET_KEEPER", "BATSMAN", "ALL_ROUNDER", "BOWLER"];

const STATUS_COLOR: Record<string, string> = {
  UPCOMING: "#F59E0B", LIVE: "#EF4444", COMPLETED: "#10B981", CANCELLED: "#6B7280",
};

const INPUT: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 10px", borderRadius: 8,
  border: "1px solid #2A2A2A", background: "#0F0F0F", color: "#ddd",
  fontSize: 13, boxSizing: "border-box", outline: "none",
};
const LABEL: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: "#555",
  marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.5px",
};

// ── Player Squad Editor ─────────────────────────────────────────────────────

function emptyPlayer(): PlayerEntry { return { _id: "", name: "", role: "BATSMAN" }; }

function slugifyPlayerId(name: string, idx: number): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `p_${slug || `player_${idx + 1}`}`;
}

function normalizeRole(raw: string): string {
  const v = raw.trim().toUpperCase();
  if (["WK", "WICKET_KEEPER", "WICKETKEEPER", "KEEPER"].includes(v)) return "WICKET_KEEPER";
  if (["BAT", "BATSMAN", "BATTER"].includes(v)) return "BATSMAN";
  if (["AR", "ALL_ROUNDER", "ALLROUNDER", "ALL-ROUNDER"].includes(v)) return "ALL_ROUNDER";
  if (["BOWL", "BOWLER"].includes(v)) return "BOWLER";
  return "BATSMAN";
}

function extractApiError(err: any, fallback: string): string {
  const data = err?.response?.data;
  if (typeof data?.message === "string" && data.message.trim()) return data.message;
  if (typeof data?.error === "string" && data.error.trim()) return data.error;
  if (typeof data === "string") {
    const text = data.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (text) return text.slice(0, 180);
  }
  if (typeof err?.message === "string" && err.message.trim()) return err.message;
  return fallback;
}

function toPlayerEntries(list: unknown): PlayerEntry[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((p: any, idx: number) => ({
      _id: String(p?._id ?? p?.id ?? p?.playerId ?? p?.name ?? `player_${idx + 1}`),
      name: String(p?.name ?? "").trim(),
      role: normalizeRole(String(p?.role ?? "BATSMAN")),
    }))
    .filter((p) => p.name);
}

function SquadEditor({ label, players, onChange }: {
  label: string;
  players: PlayerEntry[];
  onChange: (p: PlayerEntry[]) => void;
}) {
  const [bulkText, setBulkText] = useState("");

  function update(i: number, k: keyof PlayerEntry, v: string) {
    const next = players.map((p, idx) => idx === i ? { ...p, [k]: v } : p);
    onChange(next);
  }
  function add()    { onChange([...players, emptyPlayer()]); }
  function remove(i: number) { onChange(players.filter((_, idx) => idx !== i)); }
  function addElevenSlots() {
    if (players.length >= 11) return;
    const needed = Math.min(11 - players.length, 15 - players.length);
    onChange([...players, ...Array.from({ length: needed }, () => emptyPlayer())]);
  }
  function autofillIds() {
    const next = players.map((p, idx) => ({
      ...p,
      _id: p._id.trim() || slugifyPlayerId(p.name, idx),
    }));
    onChange(next);
  }
  function clearSquad() {
    onChange([]);
    setBulkText("");
  }
  function importBulk() {
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;

    const next: PlayerEntry[] = [...players];
    for (const line of lines) {
      if (next.length >= 15) break;

      const parts = line.split(/[,\t|]/).map((p) => p.trim()).filter(Boolean);
      if (!parts.length) continue;

      let _id = "";
      let name = "";
      let role = "BATSMAN";

      if (parts.length >= 3) {
        _id = parts[0];
        name = parts[1];
        role = normalizeRole(parts[2]);
      } else if (parts.length === 2) {
        name = parts[0];
        role = normalizeRole(parts[1]);
        _id = slugifyPlayerId(name, next.length);
      } else {
        name = parts[0];
        role = "BATSMAN";
        _id = slugifyPlayerId(name, next.length);
      }

      next.push({ _id, name, role });
    }

    onChange(next.slice(0, 15));
    setBulkText("");
  }

  return (
    <div style={{ background: "#0F0F0F", border: "1px solid #2A2A2A", borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#aaa" }}>
          {label} <span style={{ color: players.length >= 11 ? "#10B981" : "#EF4444", fontSize: 11, marginLeft: 6 }}>({players.length}/11–15 players)</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={addElevenSlots} disabled={players.length >= 11}
            style={{ padding: "4px 10px", border: "1px solid #2A2A2A", borderRadius: 6, background: "#141414", color: "#bbb", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            +11 Slots
          </button>
          <button onClick={add} disabled={players.length >= 15}
            style={{ padding: "4px 12px", border: "none", borderRadius: 6, background: "#EA4800", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            + Add
          </button>
        </div>
      </div>

      <div style={{ background: "#141414", border: "1px solid #2A2A2A", borderRadius: 8, padding: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#777", marginBottom: 6 }}>
          Quick Paste (one player per line): <code>id,name,role</code> or <code>name,role</code> or <code>name</code>
        </div>
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder={`virat_kohli,Virat Kohli,BATSMAN\np_bumrah,Jasprit Bumrah,BOWLER\nRishabh Pant,WK`}
          style={{ width: "100%", minHeight: 84, borderRadius: 8, border: "1px solid #2A2A2A", background: "#0F0F0F", color: "#ddd", padding: 10, fontSize: 12, resize: "vertical", boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button onClick={importBulk}
            style={{ padding: "6px 12px", border: "none", borderRadius: 6, background: "#EA4800", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Import Players
          </button>
          <button onClick={autofillIds}
            style={{ padding: "6px 12px", border: "1px solid #2A2A2A", borderRadius: 6, background: "#141414", color: "#bbb", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Auto-fill IDs
          </button>
          <button onClick={clearSquad}
            style={{ padding: "6px 12px", border: "1px solid rgba(239,68,68,.35)", borderRadius: 6, background: "rgba(239,68,68,.1)", color: "#F87171", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Clear Squad
          </button>
        </div>
      </div>

      {players.length === 0 && (
        <div style={{ color: "#444", fontSize: 12, textAlign: "center", padding: 12 }}>No players yet. Add at least 11.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {players.map((p, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "center" }}>
            <input value={p._id}  onChange={(e) => update(i, "_id",  e.target.value)} placeholder="Player ID / ObjectId" style={INPUT} />
            <input value={p.name} onChange={(e) => update(i, "name", e.target.value)} placeholder="Player name" style={INPUT} />
            <select value={p.role} onChange={(e) => update(i, "role", e.target.value)} style={{ ...INPUT, appearance: "none" }}>
              {PLAYER_ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
            <button onClick={() => remove(i)}
              style={{ height: 36, width: 36, border: "none", borderRadius: 6, background: "rgba(239,68,68,.15)", color: "#EF4444", cursor: "pointer", fontSize: 16 }}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function AdminMatchesPage() {
  const [matches,  setMatches]  = useState<Match[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({ team1Name: "", team2Name: "", matchDate: "", venue: "" });
  const [team1Players, setTeam1Players] = useState<PlayerEntry[]>([]);
  const [team2Players, setTeam2Players] = useState<PlayerEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const [patchId,     setPatchId]     = useState("");
  const [patchStatus, setPatchStatus] = useState("LIVE");
  const [patching,    setPatching]    = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/matches?limit=100");
      setMatches(res.data?.data?.matches ?? []);
    } catch { setError("Failed to load matches"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function setF(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }
  function resetFormState() {
    setForm({ team1Name: "", team2Name: "", matchDate: "", venue: "" });
    setTeam1Players([]);
    setTeam2Players([]);
    setEditingId(null);
  }

  async function saveMatch() {
    if (!form.team1Name || !form.team2Name || !form.matchDate) {
      setError("Team names and match date are required."); return;
    }
    if (team1Players.length < 11 || team2Players.length < 11) {
      setError("Each team needs at least 11 players."); return;
    }
    const missingId = [...team1Players, ...team2Players].some((p) => !p._id || !p.name);
    if (missingId) { setError("Every player must have an ID and name."); return; }

    setSaving(true); setError("");
    try {
      const parsedMatchDate = new Date(form.matchDate);
      if (Number.isNaN(parsedMatchDate.getTime())) {
        setError("Invalid match date/time.");
        setSaving(false);
        return;
      }

      // `datetime-local` has no timezone; convert to explicit UTC ISO
      // so backend parses the same instant regardless of server timezone.
      const payload = {
        ...form,
        matchDate: parsedMatchDate.toISOString(),
        team1Players,
        team2Players,
      };
      if (editingId) {
        await api.patch(`/matches/${editingId}`, payload);
      } else {
        await api.post("/matches", payload);
      }
      setShowForm(false);
      resetFormState();
      load();
    } catch (e: any) {
      setError(extractApiError(e, editingId ? "Error updating match" : "Error creating match"));
    }
    finally { setSaving(false); }
  }

  async function startEdit(matchId: string) {
    if (!matchId) {
      setError("Invalid match ID.");
      return;
    }
    setError("");
    try {
      const res = await api.get(`/matches/${matchId}`);
      const m = res.data?.data?.match ?? res.data?.data;
      if (!m) {
        setError("Match details not found.");
        return;
      }
      if (m.status !== "UPCOMING") {
        setError(`Only UPCOMING matches can be edited. Current status: ${m.status}.`);
        return;
      }

      const dt = m.matchDate ? new Date(m.matchDate) : null;
      const matchDateLocal = dt && !Number.isNaN(dt.getTime())
        ? new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
        : "";

      setEditingId(m.id ?? m._id ?? matchId);
      setForm({
        team1Name: m.team1Name ?? "",
        team2Name: m.team2Name ?? "",
        matchDate: matchDateLocal,
        venue: m.venue ?? "",
      });
      setTeam1Players(toPlayerEntries(m.team1Players));
      setTeam2Players(toPlayerEntries(m.team2Players));
      setShowForm(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setError(extractApiError(e, "Failed to load match for editing"));
    }
  }

  async function updateStatus() {
    if (!patchId) { setError("Enter a Match ID."); return; }
    setPatching(true); setError("");
    try {
      await api.patch(`/matches/${patchId}`, { status: patchStatus });
      load();
    } catch (e: any) { setError(extractApiError(e, "Error updating match")); }
    finally { setPatching(false); }
  }

  return (
    <div style={{ padding: "32px 36px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 4 }}>Matches</h1>
          <p style={{ color: "#555", fontSize: 14 }}>Create matches with player squads. Update status to go LIVE.</p>
        </div>
        <button
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              resetFormState();
            } else {
              setShowForm(true);
              setEditingId(null);
            }
          }}
          style={{ padding: "10px 20px", border: "none", borderRadius: 8, background: "#EA4800", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          {showForm ? "Cancel" : "+ Create Match"}
        </button>
      </div>

      {error && <ErrBanner msg={error} />}

      {/* ── Create Form ── */}
      {showForm && (
        <div style={{ background: "#141414", border: "1px solid #2A2A2A", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#ddd", marginBottom: 20 }}>
            {editingId ? "Edit Match" : "New Match"}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <Field label="Team 1 Name *"  value={form.team1Name} onChange={(v) => setF("team1Name", v)} placeholder="India" />
            <Field label="Team 2 Name *"  value={form.team2Name} onChange={(v) => setF("team2Name", v)} placeholder="Australia" />
            <Field label="Match Date & Time *" value={form.matchDate} onChange={(v) => setF("matchDate", v)} type="datetime-local" />
            <Field label="Venue" value={form.venue} onChange={(v) => setF("venue", v)} placeholder="Wankhede Stadium, Mumbai" />
          </div>

          <SquadEditor label="Team 1 Squad" players={team1Players} onChange={setTeam1Players} />
          <SquadEditor label="Team 2 Squad" players={team2Players} onChange={setTeam2Players} />

          <div style={{ padding: "10px 14px", background: "#1A1A1A", borderRadius: 8, fontSize: 12, color: "#555", marginBottom: 14 }}>
            💡 <strong style={{ color: "#666" }}>Player ID</strong> — use any unique string (e.g. <code style={{ color: "#EA4800" }}>p_virat</code>) or a MongoDB ObjectId if your player collection is set up. The backend stores it as-is.
          </div>

          <button onClick={saveMatch} disabled={saving}
            style={{ padding: "11px 28px", border: "none", borderRadius: 8, background: saving ? "#5A2D00" : "#EA4800", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            {saving ? (editingId ? "Updating..." : "Creating...") : (editingId ? "Update Match →" : "Create Match →")}
          </button>
        </div>
      )}

      {/* ── Patch Status ── */}
      <div style={{ background: "#141414", border: "1px solid #2A2A2A", borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#666", marginBottom: 12 }}>Update Match Status</div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={LABEL}>Match ID (click 📋 in table to copy)</label>
            <input value={patchId} onChange={(e) => setPatchId(e.target.value)} placeholder="ObjectId..." style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>New Status</label>
            <select value={patchStatus} onChange={(e) => setPatchStatus(e.target.value)} style={{ ...INPUT, width: 140 }}>
              {["UPCOMING", "LIVE", "COMPLETED", "CANCELLED"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={updateStatus} disabled={patching}
            style={{ height: 40, padding: "0 20px", border: "none", borderRadius: 8, background: "#1E1E1E", color: "#ddd", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {patching ? "Updating..." : "Update →"}
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      {loading ? <div style={{ color: "#555" }}>Loading...</div> : (
        <div style={{ background: "#141414", border: "1px solid #1E1E1E", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1E1E1E" }}>
                {["Match", "Date", "Venue", "Status", "ID", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#444", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matches.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#444" }}>No matches yet</td></tr>}
              {matches.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid #111" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 700, color: "#ddd", fontSize: 13 }}>{m.team1Name} vs {m.team2Name}</div>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#888", fontSize: 12 }}>{new Date(m.matchDate).toLocaleString("en-IN")}</td>
                  <td style={{ padding: "12px 16px", color: "#888", fontSize: 12 }}>{m.venue || "—"}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${STATUS_COLOR[m.status] ?? "#666"}18`, color: STATUS_COLOR[m.status] ?? "#aaa", border: `1px solid ${STATUS_COLOR[m.status] ?? "#666"}30` }}>
                      {m.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "monospace", color: "#444", fontSize: 11, cursor: "pointer" }}
                    title="Click to copy ID"
                    onClick={() => { navigator.clipboard.writeText(m.id ?? ""); }}>
                    {(m.id ?? "").slice(-8)} 📋
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      onClick={() => startEdit(m.id ?? m._id ?? "")}
                      disabled={m.status !== "UPCOMING"}
                      title={m.status !== "UPCOMING" ? "Only UPCOMING matches can be edited" : "Edit match"}
                      style={{
                        padding: "6px 12px",
                        border: "1px solid #2A2A2A",
                        borderRadius: 8,
                        background: m.status === "UPCOMING" ? "#1A1A1A" : "#121212",
                        color: m.status === "UPCOMING" ? "#ddd" : "#555",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: m.status === "UPCOMING" ? "pointer" : "not-allowed",
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label style={LABEL}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={INPUT} />
    </div>
  );
}

function ErrBanner({ msg }: { msg: string }) {
  return <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#FCA5A5", fontWeight: 600, marginBottom: 16 }}>⚠️ {msg}</div>;
}
