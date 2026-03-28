import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { useAuthStore } from "./store/authStore";
import { AnalyticsPageTracker } from "./components/analytics/AnalyticsPageTracker";
import { RouteSeo } from "./components/seo/RouteSeo";
import Navbar from "./components/layout/Navbar";
import ToastContainer from "./components/ui/ToastContainer";
import { useAdminAuthStore } from "./admin/adminAuthStore";
import { api } from "./admin/api";

const HomePage = lazy(() => import("./pages/HomePage"));
const AuthPage = lazy(async () => {
  const mod = await import("./pages/AuthPage");
  return { default: mod.AuthPage };
});
const ProfilePage = lazy(async () => {
  const mod = await import("./pages/ProfilePage");
  return { default: mod.ProfilePage };
});
const TeamsPage = lazy(async () => {
  const mod = await import("./pages/TeamsPage");
  return { default: mod.TeamsPage };
});
const JoinedContestsPage = lazy(async () => {
  const mod = await import("./pages/JoinedContestsPage");
  return { default: mod.JoinedContestsPage };
});
const MatchesPage = lazy(async () => {
  const mod = await import("./pages/MatchesPage");
  return { default: mod.MatchesPage };
});
const MatchDetailPage = lazy(async () => {
  const mod = await import("./pages/MatchDetailPage");
  return { default: mod.MatchDetailPage };
});
const ContestsPage = lazy(async () => {
  const mod = await import("./pages/ContestsPage");
  return { default: mod.ContestsPage };
});
const ContestLivePage = lazy(async () => {
  const mod = await import("./pages/ContestLivePage");
  return { default: mod.ContestLivePage };
});
const TransactionsPage = lazy(async () => {
  const mod = await import("./pages/TransactionsPage");
  return { default: mod.TransactionsPage };
});
const DownloadPage = lazy(() => import("./pages/DownloadPage"));
const PredictPage = lazy(() => import("./pages/PredictPage"));

const AdminLayout = lazy(() => import("./admin/components/AdminLayout"));
const AdminLoginPage = lazy(() => import("./admin/pages/AdminLoginPage"));
const AdminDashboard = lazy(() => import("./admin/pages/AdminDashboard"));
const AdminMatchesPage = lazy(() => import("./admin/pages/AdminMatchesPage"));
const AdminContestsPage = lazy(() => import("./admin/pages/AdminContestsPage"));
const AdminDepositsPage = lazy(() => import("./admin/pages/AdminDepositsPage"));
const AdminWithdrawalsPage = lazy(() => import("./admin/pages/AdminWithdrawalsPage"));
const AdminScoringPage = lazy(() => import("./admin/pages/AdminScoringPage"));

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
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            {/* Public */}
            <Route path="/"          element={<HomePage />} />
            <Route path="/login"     element={<AuthPage initialMode="login"  />} />
            <Route path="/signup"    element={<AuthPage initialMode="signup" />} />
            <Route path="/contests"  element={<ContestsPage />} />
            <Route path="/matches"   element={<MatchesPage />} />
            <Route path="/matches/:matchId" element={<MatchDetailPage />} />
            <Route path="/predict" element={<PredictPage />} />

            {/* Protected (user) */}
            <Route path="/profile" element={<AuthRequired><ProfilePage /></AuthRequired>} />
            <Route path="/teams"   element={<AuthRequired><TeamsPage   /></AuthRequired>} />
            <Route path="/joined-contests" element={<AuthRequired><JoinedContestsPage /></AuthRequired>} />
            <Route path="/transactions" element={<AuthRequired><TransactionsPage /></AuthRequired>} />
            <Route path="/contests/:contestId/live" element={<AuthRequired><ContestLivePage /></AuthRequired>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

function RouteLoader() {
  return <div className="h-[50vh]" aria-busy="true" aria-live="polite" />;
}

// ── Root App ──────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <RouteSeo />
      <AnalyticsPageTracker />
      <AppProvider>
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/download" element={<DownloadPage />} />

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
        </Suspense>
        <ToastContainer />
      </AppProvider>
    </BrowserRouter>
  );
}
