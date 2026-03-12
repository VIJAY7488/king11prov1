import { NavLink, useNavigate, Outlet } from "react-router-dom";
import { useAdminAuthStore } from "@/admin/adminAuthStore";

const NAV = [
  { to: "/admin",          icon: "🏠", label: "Dashboard",     end: true },
  { to: "/admin/matches",  icon: "🏏", label: "Matches"                  },
  { to: "/admin/contests", icon: "🏆", label: "Contests"                 },
  { to: "/admin/deposits", icon: "💳", label: "Deposits"                 },
  { to: "/admin/withdrawals", icon: "💸", label: "Withdrawals"            },
  { to: "/admin/scoring",  icon: "📊", label: "Live Scoring"             },
];

export default function AdminLayout() {
  const logout   = useAdminAuthStore((s) => s.logout);
  const admin    = useAdminAuthStore((s) => s.admin);
  const navigate = useNavigate();

  function handleLogout() {
    void logout().finally(() => {
      navigate("/admin/login");
    });
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0F0F0F", fontFamily: "'Inter', sans-serif" }}>
      {/* ── Sidebar ── */}
      <aside style={{ width: 240, background: "#141414", borderRight: "1px solid #1E1E1E", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid #1E1E1E" }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px" }}>
            King<span style={{ color: "#EA4800" }}>XI</span>Pro
          </div>
          <div style={{ fontSize: 11, color: "#444", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", marginTop: 2 }}>
            Admin Panel
          </div>
        </div>

        {/* Nav Links */}
        <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map(({ to, icon, label, end }) => (
            <NavLink key={to} to={to} end={end as boolean}
              style={({ isActive }) => ({
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: 8, textDecoration: "none", fontSize: 14, fontWeight: 600,
                color: isActive ? "#fff" : "#555",
                background: isActive ? "#EA4800" : "transparent",
                transition: "all 0.15s",
              })}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Admin info + Logout */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid #1E1E1E" }}>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 2 }}>{admin?.mobileNumber}</div>
          <div style={{ fontSize: 13, color: "#aaa", fontWeight: 600, marginBottom: 10 }}>{admin?.name ?? "Admin"}</div>
          <button onClick={handleLogout}
            style={{ width: "100%", padding: "8px 0", border: "1px solid #2A2A2A", borderRadius: 8, background: "transparent", color: "#666", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, overflow: "auto", color: "#E0E0E0" }}>
        <Outlet />
      </main>
    </div>
  );
}