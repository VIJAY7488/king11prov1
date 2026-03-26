import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useApp } from "@/context/AppContext";
import { AddMoneyModal } from "../wallet/AddMoneyModal";

const Navbar = () => {

  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;


  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);
  const isAuthed = !!token;

  const { wallet, addMoney, toast } = useApp();
  const [showAddMoney, setShowAddMoney] = useState(false);

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  const displayBalance = isAuthed
    ? `₹${(wallet.balance ?? 0).toLocaleString("en-IN")}`
    : null;

  function handleLogout() {
    void logout().finally(() => {
      navigate("/");
    });
  };

  const mobileNavItems = [
    {
      to: "/",
      icon: "🏠",
      label: "Home",
      isActive: pathname === "/",
    },
    {
      to: "/matches",
      icon: "🏏",
      label: "My Matches",
      isActive: pathname === "/matches" || pathname.startsWith("/matches/"),
    },
    {
      to: isAuthed ? "/profile" : "/login",
      icon: "👤",
      label: "Profile",
      isActive: pathname === "/profile" || pathname.startsWith("/profile/"),
    },
  ];

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white md:bg-white/90 md:backdrop-blur-xl border-b-[1.5px] border-[#E8E0D4]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">

          {/* Logo */}
          <Link
            to="/"
            className="shrink-0 font-display font-black lg:text-[1.625rem] tracking-tight text-[#1A1208] hover:opacity-90 transition-opacity"
          >
            King<span className="text-[#EA4800]">XI</span>Pro
          </Link>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-1 ml-6">
            <Link to="/" className="px-3 py-1.5 rounded-lg text-sm font-semibold text-[#7A6A55] hover:text-[#EA4800] hover:bg-[#FFF0EA] transition-all">🏠 Home</Link>
            <Link to="/contests" className="px-3 py-1.5 rounded-lg text-sm font-semibold text-[#7A6A55] hover:text-[#EA4800] hover:bg-[#FFF0EA] transition-all">🏆 Contests</Link>
            {isAuthed && (
              <>
                <Link to="/teams" className="px-3 py-1.5 rounded-lg text-sm font-semibold text-[#7A6A55] hover:text-[#EA4800] hover:bg-[#FFF0EA] transition-all">👕 My Teams</Link>
                <Link to="/joined-contests" className="px-3 py-1.5 rounded-lg text-sm font-semibold text-[#7A6A55] hover:text-[#EA4800] hover:bg-[#FFF0EA] transition-all">🎯 Joined</Link>
              </>
            )}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2.5 ml-auto shrink-0">
            {isAuthed ? (
              <>
                {/* Wallet balance */}
                <button
                  onClick={() => setShowAddMoney(true)}
                  className="flex items-center gap-2 bg-white border-[1.5px] border-[#E8E0D4] rounded-xl px-3 py-1.5 text-sm font-bold shadow-sm cursor-pointer hover:border-[#EA4800] transition-all"
                >
                  <span className="w-2 h-2 rounded-full bg-[#EA4800] animate-pulse" />
                  {displayBalance}
                </button>

                {/* Add Cash */}
                <button
                  onClick={() => setShowAddMoney(true)}
                  className="hidden md:flex items-center gap-1.5 bg-[#EA4800] text-white px-4 py-2 rounded-xl text-sm font-bold shadow-[0_4px_16px_rgba(234,72,0,.25)] hover:bg-[#FF5A1A] hover:-translate-y-px transition-all"
                >
                  + Add Cash
                </button>

                {/* Profile avatar → navigates to /profile */}
                <button
                  onClick={() => navigate("/profile")}
                  className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#EA4800] to-[#FF7A3D] text-white font-black text-sm flex items-center justify-center hover:opacity-90 transition-opacity"
                  title={user?.name ?? "Profile"}
                >
                  {initials}
                </button>

                {/* Logout */}
                <button
                  onClick={handleLogout}
                  className="hidden md:block px-3 py-1.5 rounded-xl border-[1.5px] border-[#E8E0D4] text-xs font-bold text-[#7A6A55] hover:border-red-400 hover:text-red-500 transition-all"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-4 py-2 rounded-xl bg-white border-[1.5px] border-[#E8E0D4] text-[0.875rem] font-bold text-[#1A1208] hover:border-[#EA4800] hover:text-[#EA4800] transition-all"
                >
                  🔑 Login
                </Link>
                <Link
                  to="/signup"
                  className="px-4 py-2 rounded-xl bg-[#EA4800] text-white text-[0.875rem] font-bold shadow-[0_4px_16px_rgba(234,72,0,.28)] hover:bg-[#FF5A1A] hover:-translate-y-px transition-all"
                >
                  ✨ Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile-only sticky Fantasy quick-action strip — home page only */}
      {pathname === "/" && (
        <div className="md:hidden sticky top-16 z-40 bg-white border-b-[1.5px] border-[#E8E0D4] shadow-[0_4px_12px_rgba(26,18,8,0.06)]">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none px-3 py-2">
            <Link
              to="/fantasy"
              className="shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-extrabold transition-all bg-[#FFF0EA] text-[#EA4800] border-[1.5px] border-[#EA4800]/30"
            >
              🏏 Fantasy
            </Link>
          </div>
        </div>
      )}

      {/* ── Mobile bottom navigation ── */}
      <div
        className="md:hidden fixed inset-x-0 bottom-0 z-50 border-t-[1.5px] border-[#E8E0D4] bg-white shadow-[0_-8px_24px_rgba(26,18,8,0.08)]"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.35rem)" }}
      >
        <div className="mx-auto flex h-16 max-w-[560px] items-center justify-around px-2">
          {mobileNavItems.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={`flex flex-1 min-w-0 flex-col items-center rounded-xl px-1 py-1 transition-all ${item.isActive ? "text-[#EA4800]" : "text-[#7A6A55]"
                }`}
            >
              <span className={`mb-0.5 flex h-7 w-10 items-center justify-center rounded-xl text-[1.15rem] ${item.isActive ? "bg-[#FFF0EA]" : ""}`}>
                {item.icon}
              </span>
              <span className="text-[0.8rem] font-extrabold leading-none">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <AddMoneyModal
        show={showAddMoney}
        onClose={() => setShowAddMoney(false)}
        onAdded={(amt) => {
          addMoney(amt);
          setShowAddMoney(false);
          toast({ type: "success", icon: "✅", msg: `₹${amt.toLocaleString("en-IN")} added to wallet!` });
        }}
        addToast={toast}
      />
    </>
  );
};

export default Navbar;
