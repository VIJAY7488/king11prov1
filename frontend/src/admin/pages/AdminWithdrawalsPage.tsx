import { useCallback, useEffect, useState } from "react";
import { api } from "@/admin/api";

type Status = "PENDING" | "APPROVED" | "REJECTED";
type Method = "UPI" | "BANK";

interface Withdrawal {
  id: string;
  userId: string;
  userName?: string;
  userMobile?: string;
  amount: number;
  method: Method;
  upiId?: string;
  accountHolderName?: string;
  accountNumberMasked?: string;
  ifscCode?: string;
  status: Status;
  createdAt: string;
  reviewedAt?: string;
}

const STATUS_COLOR: Record<Status, string> = {
  PENDING: "#F59E0B",
  APPROVED: "#10B981",
  REJECTED: "#EF4444",
};

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function AdminWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [doing, setDoing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState<"ALL" | Status>("PENDING");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = filter === "ALL" ? "" : `?status=${filter}`;
      const res = await api.get(`/users/withdrawals/admin/all${params}`);
      setWithdrawals(res.data?.data?.withdrawals ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Failed to load withdrawals");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function review(withdrawalId: string, status: "APPROVED" | "REJECTED") {
    setDoing(withdrawalId);
    setError("");
    setSuccess("");
    try {
      await api.patch(`/users/withdrawals/admin/${withdrawalId}/review`, { status });
      setSuccess(`✅ Withdrawal ${status.toLowerCase()} successfully!`);
      setWithdrawals((prev) => prev.map((w) => (w.id === withdrawalId ? { ...w, status } : w)));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Failed to process withdrawal");
    } finally {
      setDoing(null);
    }
  }

  const pending = withdrawals.filter((w) => w.status === "PENDING").length;
  const displayed = filter === "ALL" ? withdrawals : withdrawals.filter((w) => w.status === filter);

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 2 }}>
            Withdrawals
            {pending > 0 && (
              <span style={{ marginLeft: 10, fontSize: 13, background: "#F59E0B", color: "#000", borderRadius: 20, padding: "2px 10px", fontWeight: 800 }}>
                {pending} pending
              </span>
            )}
          </h1>
          <p style={{ color: "#555", fontSize: 13 }}>Review payout requests and approve or reject them.</p>
        </div>
        <button onClick={load} style={{ padding: "8px 18px", border: "1px solid #2A2A2A", borderRadius: 8, background: "#1A1A1A", color: "#aaa", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          🔄 Refresh
        </button>
      </div>

      {error && <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#FCA5A5", fontWeight: 600, marginBottom: 14 }}>⚠️ {error}</div>}
      {success && <div style={{ background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#6EE7B7", fontWeight: 600, marginBottom: 14 }}>{success}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["PENDING", "APPROVED", "REJECTED", "ALL"] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ padding: "6px 16px", borderRadius: 20, border: `1px solid ${filter === s ? (STATUS_COLOR[s as Status] ?? "#555") : "#2A2A2A"}`, background: filter === s ? `${STATUS_COLOR[s as Status] ?? "#555"}18` : "transparent", color: filter === s ? (STATUS_COLOR[s as Status] ?? "#aaa") : "#555", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {s === "ALL" ? "All" : s[0] + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: "#555", padding: 24 }}>Loading withdrawals...</div>
      ) : displayed.length === 0 ? (
        <div style={{ background: "#141414", border: "1px solid #1E1E1E", borderRadius: 12, padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>💸</div>
          <div style={{ color: "#444", fontWeight: 700 }}>No {filter === "ALL" ? "" : filter.toLowerCase()} withdrawal requests</div>
        </div>
      ) : (
        <div style={{ background: "#141414", border: "1px solid #1E1E1E", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1E1E1E" }}>
                {["User", "Amount", "Method", "Details", "Time", "Status", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#444", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((w) => (
                <tr key={w.id} style={{ borderBottom: "1px solid #111", background: w.status === "PENDING" ? "rgba(245,158,11,.04)" : "transparent" }}>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ fontWeight: 700, color: "#ddd", fontSize: 13 }}>{w.userName ?? "—"}</div>
                    <div style={{ color: "#555", fontSize: 12 }}>{w.userMobile ?? w.userId.slice(-6)}</div>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ fontWeight: 900, color: "#EA4800", fontSize: 18 }}>₹{w.amount.toLocaleString("en-IN")}</span>
                  </td>
                  <td style={{ padding: "14px 16px", color: "#aaa", fontSize: 13 }}>{w.method}</td>
                  <td style={{ padding: "14px 16px", color: "#aaa", fontSize: 12, fontFamily: "monospace" }}>
                    {w.method === "UPI" ? w.upiId : `${w.accountHolderName ?? ""} ${w.accountNumberMasked ?? ""} ${w.ifscCode ?? ""}`}
                  </td>
                  <td style={{ padding: "14px 16px", color: "#555", fontSize: 12 }}>{timeAgo(w.createdAt)}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${STATUS_COLOR[w.status]}18`, color: STATUS_COLOR[w.status], border: `1px solid ${STATUS_COLOR[w.status]}30` }}>
                      {w.status}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    {w.status === "PENDING" ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => review(w.id, "APPROVED")} disabled={doing === w.id}
                          style={{ padding: "7px 16px", border: "none", borderRadius: 7, background: doing === w.id ? "#065F46" : "#10B981", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                          {doing === w.id ? "…" : "✓ Approve"}
                        </button>
                        <button onClick={() => review(w.id, "REJECTED")} disabled={doing === w.id}
                          style={{ padding: "7px 14px", border: "1px solid #333", borderRadius: 7, background: "transparent", color: "#EF4444", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                          ✕ Reject
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: "#333", fontSize: 12 }}>{w.reviewedAt ? `Done ${timeAgo(w.reviewedAt)}` : "Reviewed"}</span>
                    )}
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