import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuthStore } from "@/admin/adminAuthStore";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const login    = useAdminAuthStore((s) => s.login);
  const admin    = useAdminAuthStore((s) => s.admin);
  const token    = useAdminAuthStore((s) => s.token);

  const [mobile,  setMobile]  = useState("");
  const [pass,    setPass]    = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  // If already logged in as admin, redirect immediately
  useEffect(() => {
    if (token && admin?.role === "ADMIN") navigate("/admin", { replace: true });
  }, [token, admin]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!mobile || !pass) { setError("Mobile and password are required."); return; }
    setLoading(true);
    try {
      await login(mobile, pass);
      navigate("/admin", { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Inter', sans-serif" }}>
      {/* Background glow */}
      <div style={{ position: "fixed", width: 400, height: 400, borderRadius: "50%", background: "rgba(234,72,0,.12)", filter: "blur(80px)", top: "10%", left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }} />

      <div style={{ background: "#141414", border: "1px solid #1E1E1E", borderRadius: 16, padding: "40px 36px", width: "100%", maxWidth: 420, position: "relative" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: "-1px" }}>
            King<span style={{ color: "#EA4800" }}>XI</span>Pro
          </div>
          <div style={{ fontSize: 12, color: "#555", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", marginTop: 4 }}>Admin Dashboard</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Mobile Number</label>
            <input value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
              inputMode="numeric" placeholder="10-digit mobile"
              style={{ width: "100%", height: 46, padding: "0 14px", borderRadius: 10, border: `1px solid ${error ? "#F87171" : "#1E1E1E"}`, background: "#0F0F0F", color: "#fff", fontSize: 15, boxSizing: "border-box", outline: "none" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Password</label>
            <input value={pass} onChange={(e) => setPass(e.target.value)} type="password" placeholder="••••••••"
              style={{ width: "100%", height: 46, padding: "0 14px", borderRadius: 10, border: `1px solid ${error ? "#F87171" : "#1E1E1E"}`, background: "#0F0F0F", color: "#fff", fontSize: 15, boxSizing: "border-box", outline: "none" }} />
          </div>

          {error && (
            <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#FCA5A5", fontWeight: 600 }}>
              ⚠️ {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{ height: 48, borderRadius: 10, border: "none", background: loading ? "#5A2D00" : "linear-gradient(135deg,#EA4800,#FF5A1A)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", marginTop: 4 }}>
            {loading ? "Signing in..." : "Sign In →"}
          </button>
        </form>
      </div>
    </div>
  );
}