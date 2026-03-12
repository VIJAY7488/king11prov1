import { useCallback, useEffect, useState } from "react";
import { api } from "@/admin/api";

type Status = "PENDING" | "APPROVED" | "REJECTED";

interface Deposit {
  id: string;
  userId: string;
  userName?: string;
  userMobile?: string;
  amount: number;
  refNumber: string;
  status: Status;
  reviewedAt?: string;
  createdAt: string;
}

const STATUS_COLOR: Record<Status, string> = {
  PENDING:  "#F59E0B",
  APPROVED: "#10B981",
  REJECTED: "#EF4444",
};



function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function AdminDepositsPage() {
  const [deposits,    setDeposits]    = useState<Deposit[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [doing,       setDoing]       = useState<string | null>(null);
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState("");
  const [filter,      setFilter]      = useState<"ALL" | Status>("PENDING");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = filter === "ALL" ? "" : `?status=${filter}`;
      const res = await api.get(`/users/deposits/admin/all${params}`);
      const fetched: Deposit[] = res.data?.data?.deposits ?? [];
      setDeposits(fetched);
      setLastUpdated(new Date());
    } catch (e: any) {
      if (!silent) setError(e?.response?.data?.message ?? "Failed to load deposits");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filter]);

  // Load on mount and whenever filter changes
  useEffect(() => {
    load();
  }, [load]);

  async function review(depositId: string, status: "APPROVED" | "REJECTED") {
    setDoing(depositId); setError(""); setSuccess("");
    try {
      await api.patch(`/users/deposits/admin/${depositId}/review`, { status });
      setSuccess(`✅ Deposit ${status.toLowerCase()} successfully!`);
      setDeposits((prev) => prev.map((d) => d.id === depositId ? { ...d, status } : d));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Failed to process deposit");
    } finally {
      setDoing(null);
    }
  }

  const pending   = deposits.filter((d) => d.status === "PENDING");
  const displayed = filter === "ALL" ? deposits : deposits.filter((d) => d.status === filter);

  return (
    <div style={{ padding: "32px 36px", fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 2 }}>
            Deposits
            {pending.length > 0 && (
              <span style={{ marginLeft: 10, fontSize: 13, background: "#F59E0B", color: "#000", borderRadius: 20, padding: "2px 10px", fontWeight: 800 }}>
                {pending.length} pending
              </span>
            )}
          </h1>
          <p style={{ color: "#555", fontSize: 13 }}>
            Last synced: <span style={{ color: "#888" }}>{lastUpdated ? lastUpdated.toLocaleTimeString("en-IN") : "—"}</span>
          </p>
        </div>
        <button onClick={() => load()}
          style={{ padding: "8px 18px", border: "1px solid #2A2A2A", borderRadius: 8, background: "#1A1A1A", color: "#aaa", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          🔄 Refresh
        </button>
      </div>

      {/* Errors / Success */}
      {error   && <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#FCA5A5", fontWeight: 600, marginBottom: 14 }}>⚠️ {error}</div>}
      {success && <div style={{ background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#6EE7B7", fontWeight: 600, marginBottom: 14 }}>{success}</div>}

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["PENDING", "APPROVED", "REJECTED", "ALL"] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ padding: "6px 16px", borderRadius: 20, border: `1px solid ${filter === s ? (STATUS_COLOR[s as Status] ?? "#555") : "#2A2A2A"}`, background: filter === s ? `${STATUS_COLOR[s as Status] ?? "#555"}18` : "transparent", color: filter === s ? (STATUS_COLOR[s as Status] ?? "#aaa") : "#555", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {s === "ALL" ? "All" : s[0] + s.slice(1).toLowerCase()}
            {s === "PENDING" && pending.length > 0 && <span style={{ marginLeft: 6, background: "#F59E0B", color: "#000", borderRadius: 10, padding: "0 6px", fontSize: 11 }}>{pending.length}</span>}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ color: "#555", padding: 24 }}>Loading deposits...</div>
      ) : displayed.length === 0 ? (
        <div style={{ background: "#141414", border: "1px solid #1E1E1E", borderRadius: 12, padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>💳</div>
          <div style={{ color: "#444", fontWeight: 700 }}>
            {filter === "PENDING" ? "No pending deposits right now. Queue is empty 🎉" : `No ${filter.toLowerCase()} deposits`}
          </div>
        </div>
      ) : (
        <div style={{ background: "#141414", border: "1px solid #1E1E1E", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1E1E1E" }}>
                {["User", "Amount", "Reference No.", "Time", "Status", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#444", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((dep) => (
                <tr key={dep.id} style={{ borderBottom: "1px solid #111", background: dep.status === "PENDING" ? "rgba(245,158,11,.04)" : "transparent" }}>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ fontWeight: 700, color: "#ddd", fontSize: 13 }}>{dep.userName ?? "—"}</div>
                    <div style={{ color: "#555", fontSize: 12 }}>{dep.userMobile ?? dep.userId.slice(-6)}</div>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ fontWeight: 900, color: "#EA4800", fontSize: 18 }}>₹{dep.amount.toLocaleString("en-IN")}</span>
                  </td>
                  <td style={{ padding: "14px 16px", fontFamily: "monospace", color: "#aaa", fontSize: 13 }}>
                    {dep.refNumber}
                  </td>
                  <td style={{ padding: "14px 16px", color: "#555", fontSize: 12 }}>
                    {timeAgo(dep.createdAt)}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${STATUS_COLOR[dep.status]}18`, color: STATUS_COLOR[dep.status], border: `1px solid ${STATUS_COLOR[dep.status]}30` }}>
                      {dep.status}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    {dep.status === "PENDING" ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => review(dep.id, "APPROVED")} disabled={doing === dep.id}
                          style={{ padding: "7px 16px", border: "none", borderRadius: 7, background: doing === dep.id ? "#065F46" : "#10B981", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                          {doing === dep.id ? "…" : "✓ Approve"}
                        </button>
                        <button onClick={() => review(dep.id, "REJECTED")} disabled={doing === dep.id}
                          style={{ padding: "7px 14px", border: "1px solid #333", borderRadius: 7, background: "transparent", color: "#EF4444", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                          ✕ Reject
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: "#333", fontSize: 12 }}>{dep.reviewedAt ? `Done ${timeAgo(dep.reviewedAt)}` : "Reviewed"}</span>
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