import { useEffect, useMemo, useState } from "react";
import { api } from "@/admin/api";

type ResolutionSourceType = "ORACLE" | "ADMIN" | "AUTOMATED";

interface MarketRow {
  id?: string;
  _id?: string;
  slug?: string;
  question?: string;
  category?: string;
  status?: string;
  resolutionSource?: {
    type?: ResolutionSourceType;
    provider?: string;
    referenceId?: string;
  };
  questionPrice?: {
    amount?: number;
    currency?: string;
  };
  closeAt?: string;
  orderBookEnabled?: boolean;
  ammEnabled?: boolean;
  tags?: string[];
  createdAt?: string;
}

const CATEGORIES = ["CRICKET", "POLITICS", "ENTERTAINMENT", "CRYPTO", "FOOTBALL", "GENERAL"];
const STATUS = ["OPEN", "CLOSED"] as const;

const INPUT: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid #2A2A2A",
  background: "#0F0F0F",
  color: "#ddd",
  fontSize: 13,
  boxSizing: "border-box",
  outline: "none",
};

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#555",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const toId = (m: MarketRow): string => m.id ?? m._id ?? "";

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export default function AdminMarketsPage() {
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [editingMarketId, setEditingMarketId] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    question: "",
    slug: "",
    category: "CRICKET",
    status: "OPEN",
    questionPrice: 10,
    questionPriceCurrency: "INR",
    closeAt: "",
    sourceType: "ORACLE" as ResolutionSourceType,
    provider: "cricbuzz",
    referenceId: "",
    orderBookEnabled: true,
    ammEnabled: true,
    tags: "cricket",
  });

  const previewSlug = useMemo(() => form.slug || slugify(form.question), [form.slug, form.question]);

  const setF = (key: string, value: unknown) => setForm((p) => ({ ...p, [key]: value }));

  const resetForm = () => {
    setForm({
      question: "",
      slug: "",
      category: "CRICKET",
      status: "OPEN",
      questionPrice: 10,
      questionPriceCurrency: "INR",
      closeAt: "",
      sourceType: "ORACLE",
      provider: "cricbuzz",
      referenceId: "",
      orderBookEnabled: true,
      ammEnabled: true,
      tags: "cricket",
    });
    setEditingMarketId("");
  };

  async function loadMarkets() {
    setLoading(true);
    try {
      const res = await api.get("/markets", {
        params: { page: 1, limit: 100, sortBy: "createdAt", sortOrder: "desc" },
      });
      setMarkets(res.data?.data?.markets ?? []);
      setError("");
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Failed to load markets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMarkets();
  }, []);

  function startCreate() {
    resetForm();
    setError("");
    setShowForm(true);
  }

  function startEdit(market: MarketRow) {
    setEditingMarketId(toId(market));
    setError("");
    setShowForm(true);
    setForm({
      question: market.question ?? "",
      slug: market.slug ?? "",
      category: market.category ?? "CRICKET",
      status: market.status ?? "OPEN",
      questionPrice: market.questionPrice?.amount ?? 10,
      questionPriceCurrency: market.questionPrice?.currency ?? "INR",
      closeAt: market.closeAt ? new Date(new Date(market.closeAt).getTime() - new Date(market.closeAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "",
      sourceType: market.resolutionSource?.type ?? "ORACLE",
      provider: market.resolutionSource?.provider ?? "cricbuzz",
      referenceId: market.resolutionSource?.referenceId ?? "",
      orderBookEnabled: market.orderBookEnabled ?? true,
      ammEnabled: market.ammEnabled ?? true,
      tags: (market.tags ?? []).join(", "),
    });
  }

  async function submitMarket() {
    const question = form.question.trim();
    const slug = (form.slug.trim() || slugify(question)).toLowerCase();
    if (!Number.isFinite(form.questionPrice) || form.questionPrice < 0) {
      setError("Question price must be 0 or more.");
      return;
    }
    if (!question || !slug || !form.closeAt || !form.referenceId.trim()) {
      setError("Question, slug, close time and reference ID are required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const payload = {
        slug,
        question,
        category: form.category,
        status: form.status,
        questionPrice: {
          amount: Number(form.questionPrice),
          currency: form.questionPriceCurrency.trim().toUpperCase() || "INR",
        },
        closeAt: new Date(form.closeAt).toISOString(),
        resolutionSource: {
          type: form.sourceType,
          provider: form.provider.trim(),
          referenceId: form.referenceId.trim(),
        },
        orderBookEnabled: form.orderBookEnabled,
        ammEnabled: form.ammEnabled,
        tags,
      };

      if (editingMarketId) {
        await api.patch(`/admin/markets/${editingMarketId}`, payload);
      } else {
        await api.post("/admin/markets", payload);
      }

      setShowForm(false);
      resetForm();
      await loadMarkets();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? (editingMarketId ? "Failed to update market" : "Failed to create market"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteMarket(market: MarketRow) {
    const marketId = toId(market);
    if (!marketId) return;
    const confirmed = window.confirm(`Delete question "${market.question ?? "Untitled"}"?`);
    if (!confirmed) return;

    setDeletingId(marketId);
    setError("");
    try {
      await api.delete(`/admin/markets/${marketId}`);
      if (editingMarketId === marketId) {
        setShowForm(false);
        resetForm();
      }
      await loadMarkets();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Failed to delete market");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div style={{ padding: "32px 36px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 4 }}>Prediction Markets</h1>
          <p style={{ color: "#555", fontSize: 14 }}>Create questions and manage live prediction markets.</p>
        </div>
        <button
          onClick={() => (showForm ? setShowForm(false) : startCreate())}
          style={{ padding: "10px 20px", border: "none", borderRadius: 8, background: "#10B981", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
        >
          {showForm ? "Cancel" : "+ Add Question"}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: "10px 12px", borderRadius: 8, background: "rgba(239,68,68,0.12)", color: "#FCA5A5", border: "1px solid rgba(239,68,68,0.35)", fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {showForm && (
        <div style={{ background: "#141414", border: "1px solid #2A2A2A", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#ddd", marginBottom: 16 }}>
            {editingMarketId ? "Edit Market Question" : "New Market Question"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "span 2" }}>
              <label style={LABEL}>Question *</label>
              <input value={form.question} onChange={(e) => setF("question", e.target.value)} placeholder="Will CSK win IPL Match 14?" style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Slug *</label>
              <input value={form.slug} onChange={(e) => setF("slug", e.target.value)} placeholder="csk-win-ipl-match-14" style={INPUT} />
              <div style={{ marginTop: 6, color: "#666", fontSize: 11 }}>Preview: {previewSlug || "n/a"}</div>
            </div>
            <div>
              <label style={LABEL}>Category *</label>
              <select value={form.category} onChange={(e) => setF("category", e.target.value)} style={{ ...INPUT, appearance: "none" }}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL}>Status</label>
              <select value={form.status} onChange={(e) => setF("status", e.target.value)} style={{ ...INPUT, appearance: "none" }}>
                {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL}>Question Price</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.questionPrice}
                onChange={(e) => setF("questionPrice", Number(e.target.value))}
                style={INPUT}
              />
            </div>
            <div>
              <label style={LABEL}>Price Currency</label>
              <input
                value={form.questionPriceCurrency}
                onChange={(e) => setF("questionPriceCurrency", e.target.value.toUpperCase())}
                placeholder="INR"
                style={INPUT}
              />
            </div>
            <div>
              <label style={LABEL}>Close At *</label>
              <input
                type="datetime-local"
                value={form.closeAt}
                onChange={(e) => setF("closeAt", e.target.value)}
                style={INPUT}
              />
            </div>
            <div>
              <label style={LABEL}>Resolution Source Type</label>
              <select value={form.sourceType} onChange={(e) => setF("sourceType", e.target.value)} style={{ ...INPUT, appearance: "none" }}>
                <option value="ORACLE">ORACLE</option>
                <option value="ADMIN">ADMIN</option>
                <option value="AUTOMATED">AUTOMATED</option>
              </select>
            </div>
            <div>
              <label style={LABEL}>Provider *</label>
              <input value={form.provider} onChange={(e) => setF("provider", e.target.value)} placeholder="cricbuzz" style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Reference ID *</label>
              <input value={form.referenceId} onChange={(e) => setF("referenceId", e.target.value)} placeholder="match_14_ipl_2025" style={INPUT} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={LABEL}>Tags (comma-separated)</label>
              <input value={form.tags} onChange={(e) => setF("tags", e.target.value)} placeholder="IPL, CSK, cricket" style={INPUT} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" checked={form.orderBookEnabled} onChange={(e) => setF("orderBookEnabled", e.target.checked)} />
              <span style={{ color: "#aaa", fontSize: 13, fontWeight: 600 }}>Orderbook Enabled</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" checked={form.ammEnabled} onChange={(e) => setF("ammEnabled", e.target.checked)} />
              <span style={{ color: "#aaa", fontSize: 13, fontWeight: 600 }}>AMM Enabled</span>
            </div>
          </div>

          <button
            onClick={submitMarket}
            disabled={saving}
            style={{ marginTop: 18, padding: "10px 24px", border: "none", borderRadius: 8, background: saving ? "#064E3B" : "#10B981", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
          >
            {saving ? (editingMarketId ? "Updating..." : "Creating...") : (editingMarketId ? "Update Market →" : "Create Market →")}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ color: "#555" }}>Loading markets...</div>
      ) : (
        <div style={{ background: "#141414", border: "1px solid #1E1E1E", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1E1E1E" }}>
                {["Question", "Price", "Category", "Status", "Close At", "Tags", "Actions", "ID"].map((h) => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#444", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {markets.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#444" }}>
                    No markets yet
                  </td>
                </tr>
              )}
              {markets.map((m) => (
                <tr key={toId(m)} style={{ borderBottom: "1px solid #111" }}>
                  <td style={{ padding: "12px 16px", color: "#ddd", fontSize: 13, fontWeight: 700 }}>{m.question ?? "Untitled"}</td>
                  <td style={{ padding: "12px 16px", color: "#888", fontSize: 12 }}>
                    {typeof m.questionPrice?.amount === "number"
                      ? `${m.questionPrice.currency ?? "INR"} ${m.questionPrice.amount}`
                      : "-"}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#888", fontSize: 12 }}>{m.category ?? "-"}</td>
                  <td style={{ padding: "12px 16px", color: "#ddd", fontSize: 12 }}>{m.status ?? "-"}</td>
                  <td style={{ padding: "12px 16px", color: "#888", fontSize: 12 }}>
                    {m.closeAt ? new Date(m.closeAt).toLocaleString("en-IN") : "-"}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#888", fontSize: 12 }}>{(m.tags ?? []).join(", ") || "-"}</td>
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                    <button
                      onClick={() => startEdit(m)}
                      style={{ marginRight: 8, padding: "6px 10px", borderRadius: 8, border: "1px solid #2A2A2A", background: "#1B1B1B", color: "#ddd", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteMarket(m)}
                      disabled={deletingId === toId(m)}
                      style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.12)", color: "#FCA5A5", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: deletingId === toId(m) ? 0.7 : 1 }}
                    >
                      {deletingId === toId(m) ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                  <td
                    style={{ padding: "12px 16px", fontFamily: "monospace", color: "#444", fontSize: 11, cursor: "pointer" }}
                    onClick={() => navigator.clipboard.writeText(toId(m))}
                  >
                    {toId(m).slice(-8)} 📋
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
