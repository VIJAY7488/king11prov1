import { useEffect, useState } from "react";
import { api } from "@/admin/api";

interface StatCard {
  icon: string;
  label: string;
  value: string | number;
  color: string;
}

function Stat({ icon, label, value, color }: StatCard) {
  return (
    <div style={{ background: "#141414", border: "1px solid #1E1E1E", borderRadius: 12, padding: "20px 24px", borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 4 }}>{label}</div>
    </div>
  );
}

interface DashData {
  liveMatches: number;
  upcomingMatches: number;
  openContests: number;
  pendingDeposits: number;
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashData>({ liveMatches: 0, upcomingMatches: 0, openContests: 0, pendingDeposits: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [matchRes, contestRes] = await Promise.all([
          api.get("/matches?limit=100"),
          api.get("/contests?limit=100"),
        ]);
        const matches  = matchRes.data?.data?.matches  ?? [];
        const contests = contestRes.data?.data?.contests ?? [];
        setData({
          liveMatches:     matches.filter((m: any) => m.status === "LIVE").length,
          upcomingMatches: matches.filter((m: any) => m.status === "UPCOMING").length,
          openContests:    contests.filter((c: any) => c.status === "OPEN").length,
          pendingDeposits: 0, // No summary endpoint — shown on Deposits page
        });
      } catch { /* silent */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  return (
    <div style={{ padding: "32px 36px" }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 4 }}>Dashboard</h1>
      <p style={{ color: "#555", fontSize: 14, marginBottom: 28 }}>Welcome back, Admin! Here's what's happening.</p>

      {loading ? (
        <div style={{ color: "#555", fontSize: 14 }}>Loading...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginBottom: 32 }}>
          <Stat icon="🔴" label="Live Matches"     value={data.liveMatches}     color="#EF4444" />
          <Stat icon="📅" label="Upcoming Matches" value={data.upcomingMatches} color="#F59E0B" />
          <Stat icon="🏆" label="Open Contests"    value={data.openContests}    color="#10B981" />
          <Stat icon="💳" label="Pending Deposits" value="–"                    color="#3B82F6" />
        </div>
      )}

      <div style={{ background: "#141414", border: "1px solid #1E1E1E", borderRadius: 12, padding: "20px 24px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#aaa", marginBottom: 16 }}>Quick Actions</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            ["/admin/matches",  "#EA4800", "🏏 Create Match"],
            ["/admin/contests", "#10B981", "🏆 Create Contest"],
            ["/admin/deposits", "#3B82F6", "💳 Review Deposits"],
            ["/admin/scoring",  "#F59E0B", "📊 Live Scoring"],
          ].map(([to, color, label]) => (
            <a key={String(to)} href={String(to)}
              style={{ padding: "10px 18px", borderRadius: 8, background: `${String(color)}18`, border: `1px solid ${String(color)}30`, color: String(color), fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
              {String(label)}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}