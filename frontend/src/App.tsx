import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { useAuthStore } from "./store/authStore";
import { AnalyticsPageTracker } from "./components/analytics/AnalyticsPageTracker";
import Navbar from "./components/layout/Navbar";
import ToastContainer from "./components/ui/ToastContainer";
import { AuthPage } from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import { ProfilePage } from "./pages/ProfilePage";
import { TeamsPage } from "./pages/TeamsPage";
import { JoinedContestsPage } from "./pages/JoinedContestsPage";
import { MatchesPage } from "./pages/MatchesPage";
import { MatchDetailPage } from "./pages/MatchDetailPage";
import { ContestsPage } from "./pages/ContestsPage";
import { ContestLivePage } from "./pages/ContestLivePage";
import { TransactionsPage } from "./pages/TransactionsPage";

// Admin
import AdminLayout from "./admin/components/AdminLayout";
import AdminLoginPage    from "./admin/pages/AdminLoginPage";
import AdminDashboard    from "./admin/pages/AdminDashboard";
import AdminMatchesPage  from "./admin/pages/AdminMatchesPage";
import AdminContestsPage from "./admin/pages/AdminContestsPage";
import AdminDepositsPage from "./admin/pages/AdminDepositsPage";
import AdminWithdrawalsPage from "./admin/pages/AdminWithdrawalsPage";
import AdminScoringPage  from "./admin/pages/AdminScoringPage";
import { useAdminAuthStore } from "./admin/adminAuthStore";
import { api } from "./admin/api";

// ── Guards ────────────────────────────────────────────────────────────────────

function AuthRequired({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRequired({ children }: { children: React.ReactNode }) {
  const admin = useAdminAuthStore((s) => s.admin);
  const token = useAdminAuthStore((s) => s.token);
  const logout = useAdminAuthStore((s) => s.logout);
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let active = true;

    async function verifyAdmin() {
      if (!token || admin?.role !== "ADMIN") {
        if (active) {
          setAuthorized(false);
          setChecking(false);
        }
        return;
      }

      try {
        const res = await api.get("/users/me", { cache: false });
        const user = res.data?.data?.user;
        const isValidAdmin = !!user && user.role === "ADMIN" && user.isActive !== false;
        if (!isValidAdmin) {
          await logout();
        }
        if (active) {
          setAuthorized(isValidAdmin);
          setChecking(false);
        }
      } catch {
        await logout();
        if (active) {
          setAuthorized(false);
          setChecking(false);
        }
      }
    }

    void verifyAdmin();

    return () => {
      active = false;
    };
  }, [token, admin?.role, logout]);

  if (checking) return <div />;
  if (!authorized) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

// ── User App Layout (with Navbar) ─────────────────────────────────────────────

function AppLayout() {
  return (
    <div className="min-h-screen" style={{ background: "#FAFAF8" }}>
      <Navbar />
      <main className="pb-24 md:pb-0">
        <Routes>
          {/* Public */}
          <Route path="/"          element={<HomePage />} />
          <Route path="/login"     element={<AuthPage initialMode="login"  />} />
          <Route path="/signup"    element={<AuthPage initialMode="signup" />} />
          <Route path="/contests"  element={<ContestsPage />} />
          <Route path="/matches"   element={<MatchesPage />} />
          <Route path="/matches/:matchId" element={<MatchDetailPage />} />

          {/* Protected (user) */}
          <Route path="/profile" element={<AuthRequired><ProfilePage /></AuthRequired>} />
          <Route path="/teams"   element={<AuthRequired><TeamsPage   /></AuthRequired>} />
          <Route path="/joined-contests" element={<AuthRequired><JoinedContestsPage /></AuthRequired>} />
          <Route path="/transactions" element={<AuthRequired><TransactionsPage /></AuthRequired>} />
          <Route path="/contests/:contestId/live" element={<AuthRequired><ContestLivePage /></AuthRequired>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AnalyticsPageTracker />
      <AppProvider>
        <Routes>
          {/* ── Admin section — no Navbar, dark layout ── */}
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminRequired><AdminLayout /></AdminRequired>}>
            <Route index          element={<AdminDashboard    />} />
            <Route path="matches"  element={<AdminMatchesPage  />} />
            <Route path="contests" element={<AdminContestsPage />} />
            <Route path="deposits" element={<AdminDepositsPage />} />
            <Route path="withdrawals" element={<AdminWithdrawalsPage />} />
            <Route path="scoring"  element={<AdminScoringPage  />} />
          </Route>

          {/* ── User section — light layout with Navbar ── */}
          <Route path="/*" element={<AppLayout />} />
        </Routes>
        <ToastContainer />
      </AppProvider>
    </BrowserRouter>
  );
}
