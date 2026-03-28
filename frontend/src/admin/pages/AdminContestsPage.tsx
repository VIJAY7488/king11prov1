import { useEffect, useState } from "react";
import { api } from "@/admin/api";

interface Contest {
  id: string;
  name: string;
  contestType: string;
  description?: string;
  entryFee: number;
  prizePool: number;
  totalSpots: number;
  filledSpots: number;
  maxEntriesPerUser: number;
  status: string;
  isGuaranteed: boolean;
  matchId: string;
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "#6B7280", OPEN: "#10B981", FULL: "#3B82F6", CLOSED: "#F59E0B", COMPLETED: "#8B5CF6", CANCELLED: "#EF4444",
};

const INPUT_STYLE: React.CSSProperties = { width: "100%", height: 42, padding: "0 12px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#0F0F0F", color: "#ddd", fontSize: 13, boxSizing: "border-box", outline: "none" };
const LABEL_STYLE: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" };

export default function AdminContestsPage() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    matchId: "", name: "", contestType: "MEGA_LEAGUE",
    entryFee: "", prizePool: "", maxEntriesPerUser: "1",
    isGuaranteed: false, status: "DRAFT", description: "",
  });
  const [saving, setSaving] = useState(false);
  const isFreeContest = form.contestType === "FREE_LEAGUE";
  const isHeadToHead = form.contestType === "HEAD_TO_HEAD";

  // Patch status
  const [patchId,     setPatchId]     = useState("");
  const [patchStatus, setPatchStatus] = useState("OPEN");
  const [patching,    setPatching]    = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/admin/contests?limit=100");
      setContests(res.data?.data?.contests ?? []);
    } catch { setError("Failed to load contests"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!isHeadToHead) return;
    const entry = Number(form.entryFee || 0);
    const autoPrizePool = entry > 0 ? Math.floor(entry * 2 * 0.9) : 0;
    setForm((prev) => {
      const nextPrizePool = autoPrizePool ? String(autoPrizePool) : "";
      if (prev.prizePool === nextPrizePool) return prev;
      return { ...prev, prizePool: nextPrizePool };
    });
  }, [isHeadToHead, form.entryFee]);

  function setF(k: string, v: unknown) { setForm((p) => ({ ...p, [k]: v })); }
  function resetFormState() {
    setForm({
      matchId: "",
      name: "",
      contestType: "MEGA_LEAGUE",
      entryFee: "",
      prizePool: "",
      maxEntriesPerUser: "1",
      isGuaranteed: false,
      status: "DRAFT",
      description: "",
    });
    setEditingId(null);
  }

  async function createContest() {
    if (!form.matchId || (!isFreeContest && !form.entryFee) || !form.prizePool) {
      setError("Fill all required fields."); return;
    }
    setSaving(true); setError("");
    try {
      await api.post("/contest", {
        ...form,
        entryFee: isFreeContest ? 0 : Number(form.entryFee),
        prizePool: Number(form.prizePool),
        maxEntriesPerUser: isHeadToHead ? 1 : Number(form.maxEntriesPerUser),
      });
      setShowForm(false);
      resetFormState();
      load();
    } catch (e: any) { setError(e?.response?.data?.message ?? "Error creating contest"); }
    finally { setSaving(false); }
  }

  async function updateContest() {
    if (!editingId) return;
    setSaving(true); setError("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name?.trim() || undefined,
        description: form.description?.trim() || "",
        entryFee: isFreeContest ? 0 : Number(form.entryFee),
        prizePool: Number(form.prizePool),
        maxEntriesPerUser: isHeadToHead ? 1 : Number(form.maxEntriesPerUser),
        isGuaranteed: form.isGuaranteed,
        status: form.status,
      };
      await api.patch(`/update-contest/${editingId}`, payload);
      setShowForm(false);
      resetFormState();
      load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Error updating contest");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(contest: Contest) {
    setEditingId(contest.id);
    setForm({
      matchId: contest.matchId ?? "",
      name: contest.name ?? "",
      contestType: contest.contestType ?? "MEGA_LEAGUE",
      entryFee: String(contest.entryFee ?? ""),
      prizePool: String(contest.prizePool ?? ""),
      maxEntriesPerUser: String(contest.maxEntriesPerUser ?? 1),
      isGuaranteed: Boolean(contest.isGuaranteed),
      status: contest.status ?? "DRAFT",
      description: contest.description ?? "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleUpdateStatus() {
    if (!patchId) { setError("Enter a Contest ID."); return; }
    setPatching(true); setError("");
    try {
      await api.patch(`/update-contest/${patchId}`, { status: patchStatus });
      load();
    } catch (e: any) { setError(e?.response?.data?.message ?? "Error updating contest"); }
    finally { setPatching(false); }
  }

  return (
    <div style={{ padding: "32px 36px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 4 }}>Contests</h1>
          <p style={{ color: "#555", fontSize: 14 }}>Create and manage contests. totalSpots is auto-calculated by the backend.</p>
        </div>
        <button onClick={() => {
          if (showForm) {
            setShowForm(false);
            resetFormState();
          } else {
            setShowForm(true);
            setEditingId(null);
          }
        }}
          style={{ padding: "10px 20px", border: "none", borderRadius: 8, background: "#10B981", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          {showForm ? "Cancel" : "+ Create Contest"}
        </button>
      </div>

      {error && <ErrBanner msg={error} />}

      {/* Create Form */}
      {showForm && (
        <div style={{ background: "#141414", border: "1px solid #2A2A2A", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#ddd", marginBottom: 16 }}>
            {editingId ? "Edit Contest" : "New Contest"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "span 2" }}>
              <label style={LABEL_STYLE}>Match ID * <span style={{ color: "#444", fontWeight: 400 }}>(copy from Matches page)</span></label>
              <input
                value={form.matchId}
                onChange={(e) => setF("matchId", e.target.value)}
                placeholder="ObjectId..."
                disabled={!!editingId}
                style={{ ...INPUT_STYLE, opacity: editingId ? 0.7 : 1 }}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Contest Name <span style={{ color: "#444", fontWeight: 400 }}>(Optional - Auto-generated if left blank)</span></label>
              <input value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder="e.g. Mega League ₹1 Cr" style={INPUT_STYLE} />
            </div>
            <div>
              <label style={LABEL_STYLE}>Contest Type *</label>
              <select 
                value={form.contestType}
                onChange={(e) => {
                  const type = e.target.value;
                  setF("contestType", type);
                  if (type === "FREE_LEAGUE") setF("entryFee", "0");
                  if (type === "HEAD_TO_HEAD") setF("maxEntriesPerUser", "1");
                }}
                disabled={!!editingId}
                style={{...INPUT_STYLE, appearance: "none", opacity: editingId ? 0.7 : 1}}>
                  {["MEGA_LEAGUE", "HEAD_TO_HEAD", "SMALL_LEAGUE", "FREE_LEAGUE"].map((t) => 
                <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL_STYLE}>Entry Fee (₹) *</label>
              <input
                type="number"
                value={isFreeContest ? "0" : form.entryFee}
                onChange={(e) => setF("entryFee", e.target.value)}
                placeholder={isFreeContest ? "0 (free entry)" : "50"}
                disabled={isFreeContest}
                style={{ ...INPUT_STYLE, opacity: isFreeContest ? 0.7 : 1 }}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Prize Pool (₹) *</label>
              <input
                type="number"
                value={isHeadToHead ? (form.prizePool || "0") : form.prizePool}
                onChange={(e) => setF("prizePool", e.target.value)}
                placeholder={isHeadToHead ? "Auto-calculated from entry fee" : isFreeContest ? "e.g. 5000" : "e.g. 50000"}
                disabled={isHeadToHead}
                style={{ ...INPUT_STYLE, opacity: isHeadToHead ? 0.7 : 1 }}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Max Entries / User</label>
              <input
                type="number"
                value={isHeadToHead ? "1" : form.maxEntriesPerUser}
                onChange={(e) => setF("maxEntriesPerUser", e.target.value)}
                placeholder="1"
                disabled={isHeadToHead}
                style={{ ...INPUT_STYLE, opacity: isHeadToHead ? 0.7 : 1 }}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Initial Status</label>
              <select value={form.status} onChange={(e) => setF("status", e.target.value)} style={{ ...INPUT_STYLE, appearance: "none" }}>
                <option value="DRAFT">DRAFT (hidden from users)</option>
                <option value="OPEN">OPEN (visible immediately)</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" id="guar" checked={form.isGuaranteed} onChange={(e) => setF("isGuaranteed", e.target.checked)} style={{ width: 16, height: 16 }} />
              <label htmlFor="guar" style={{ color: "#aaa", fontSize: 13, fontWeight: 600 }}>Guaranteed Prize Pool</label>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={LABEL_STYLE}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setF("description", e.target.value)}
                placeholder="Optional contest description"
                style={{ ...INPUT_STYLE, height: 84, padding: "10px 12px", resize: "vertical" }}
              />
            </div>
          </div>
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#1A1A1A", borderRadius: 8, fontSize: 12, color: "#555" }}>
            💡 {isHeadToHead
              ? "HEAD_TO_HEAD: total spots are fixed to 2, max entries per user is fixed to 1, platform fee is 10%, and prize pool is auto-calculated from entry fee."
              : isFreeContest
              ? "FREE_LEAGUE: entry fee stays ₹0, wallet is not deducted on join, and winners are computed from joined users."
              : "totalSpots = floor((prizePool × 1.20) ÷ entryFee) — auto-calculated by backend"}
          </div>
          <button onClick={editingId ? updateContest : createContest} disabled={saving}
            style={{ marginTop: 16, padding: "10px 24px", border: "none", borderRadius: 8, background: saving ? "#064E3B" : "#10B981", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            {saving ? (editingId ? "Updating..." : "Creating...") : (editingId ? "Update Contest →" : "Create Contest →")}
          </button>
        </div>
      )}

      {/* Patch Status */}
      <div style={{ background: "#141414", border: "1px solid #2A2A2A", borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#666", marginBottom: 12 }}>Update Contest Status</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={LABEL_STYLE}>Contest ID</label>
            <input value={patchId} onChange={(e) => setPatchId(e.target.value)} placeholder="ObjectId..." style={INPUT_STYLE} />
          </div>
          <div>
            <label style={LABEL_STYLE}>New Status</label>
            <select value={patchStatus} onChange={(e) => setPatchStatus(e.target.value)} style={{ ...INPUT_STYLE, width: 160 }}>
              {["DRAFT", "OPEN", "CLOSED", "COMPLETED", "CANCELLED"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={handleUpdateStatus} disabled={patching}
            style={{ height: 42, padding: "0 20px", border: "none", borderRadius: 8, background: "#1E1E1E", color: "#ddd", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {patching ? "Updating..." : "Update →"}
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? <div style={{ color: "#555" }}>Loading...</div> : (
        <div style={{ background: "#141414", border: "1px solid #1E1E1E", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1E1E1E" }}>
                {["Name", "Type", "Entry", "Prize Pool", "Spots", "Status", "ID", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#444", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contests.length === 0 && <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#444" }}>No contests yet</td></tr>}
              {contests.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #111" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 700, color: "#ddd", fontSize: 13 }}>{c.name}</div>
                    {c.isGuaranteed && <div style={{ fontSize: 11, color: "#10B981" }}>✅ Guaranteed</div>}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#888", fontSize: 12 }}>{c.contestType}</td>
                  <td style={{ padding: "12px 16px", color: "#EA4800", fontWeight: 700 }}>₹{c.entryFee}</td>
                  <td style={{ padding: "12px 16px", color: "#ddd", fontWeight: 700 }}>₹{c.prizePool?.toLocaleString("en-IN")}</td>
                  <td style={{ padding: "12px 16px", color: "#888", fontSize: 13 }}>{c.filledSpots}/{c.totalSpots}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${STATUS_COLOR[c.status] ?? "#666"}18`, color: STATUS_COLOR[c.status] ?? "#aaa" }}>
                      {c.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "monospace", color: "#444", fontSize: 11, cursor: "pointer" }}
                    onClick={() => navigator.clipboard.writeText(c.id ?? "")}>
                    {(c.id ?? "").slice(-8)} 📋
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      onClick={() => startEdit(c)}
                      disabled={c.status === "COMPLETED" || c.status === "CANCELLED"}
                      style={{
                        padding: "6px 12px",
                        border: "1px solid #2A2A2A",
                        borderRadius: 8,
                        background: (c.status === "COMPLETED" || c.status === "CANCELLED") ? "#121212" : "#1A1A1A",
                        color: (c.status === "COMPLETED" || c.status === "CANCELLED") ? "#555" : "#ddd",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: (c.status === "COMPLETED" || c.status === "CANCELLED") ? "not-allowed" : "pointer",
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

function ErrBanner({ msg }: { msg: string }) {
  return <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#FCA5A5", fontWeight: 600, marginBottom: 16 }}>⚠️ {msg}</div>;
}
