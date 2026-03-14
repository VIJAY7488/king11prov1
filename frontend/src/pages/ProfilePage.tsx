import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/error";
import { AddMoneyModal } from "@/components/wallet/AddMoneyModal";
import { WithdrawMoneyModal } from "@/components/wallet/WithdrawMoneyModal";
import { Button } from "@/components/ui/button";

export function ProfilePage() {
  const navigate = useNavigate();
  const user   = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { wallet, addMoney, refreshWallet, setWalletBalance, toast } = useApp();
  const [addMoneyModal, setAddMoneyModal] = useState(false);
  const [withdrawMoneyModal, setWithdrawMoneyModal] = useState(false);
  const [recentWithdrawals, setRecentWithdrawals] = useState<any[]>([]);

  useEffect(() => {
    refreshWallet();
    api.get("/users/withdrawals/my?limit=5")
      .then((res) => setRecentWithdrawals(res.data?.data?.withdrawals ?? []))
      .catch((err) => {
        setRecentWithdrawals([]);
        toast({ type: "error", icon: "❌", msg: getErrorMessage(err, "Failed to load recent withdrawals") });
      });
  }, []);

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  const stats = [
    ["💰", "Balance",   `₹${(wallet.balance ?? 0).toLocaleString("en-IN")}`,  "text-[#EA4800]"],
    ["🏆", "Total Won", `₹${(wallet.won ?? 0).toLocaleString("en-IN")}`,      "text-[#1A1208]"],
    ["🎮", "Contests",  String(wallet.contests ?? 0),                          "text-blue-600" ],
    ["📅", "Member",    user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—", "text-[#EA4800]"],
  ];

  function handleLogout() {
    void logout().finally(() => {
      navigate("/");
    });
  }

  const menuItems: Array<[string, string, (() => void) | null, boolean]> = [
    ["🏏", "Matches",         () => navigate("/matches"), false],
    ["👕", "My Teams",        () => navigate("/teams"),   false],
    ["📒", "Transactions",    () => navigate("/transactions"), false],
    ["💳", "Add Money",       () => setAddMoneyModal(true), false],
    ["💸", "Withdraw",        () => setWithdrawMoneyModal(true), false],
    ["❓", "Help & Support",  null, false],
    ["🚪", "Sign Out",        handleLogout, true],
  ];

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-8">

      {/* Profile card */}
      <div className="bg-hero rounded-2xl overflow-hidden relative mb-5" style={{ background: "linear-gradient(135deg,#1A1208,#2D2010)", borderTop: "3px solid #EA4800" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 500px 300px at 70% 50%, rgba(234,72,0,.2) 0%, transparent 70%)" }} />
        <div className="relative p-7 flex items-center gap-5 flex-wrap">
          <div className="w-[72px] h-[72px] rounded-2xl bg-gradient-to-br from-[#EA4800] to-[#FF7A3D] flex items-center justify-center font-black text-2xl text-white shrink-0">
            {initials}
          </div>
          <div>
            <h2 className="font-display font-black text-xl text-white">{user?.name ?? "—"}</h2>
            <p className="text-white/50 text-sm mb-1">{user?.mobileNumber ?? ""}</p>
            <div className="flex gap-2 mt-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: "rgba(234,72,0,.2)", border: "1px solid rgba(234,72,0,.35)", color: "#FF8C5A" }}>
                {user?.role === "ADMIN" ? "⭐ Admin" : "⭐ Member"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {stats.map(([icon, label, val, color]) => (
          <div key={String(label)} className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl p-4 text-center shadow-sm" style={{ borderTopWidth: 3, borderTopColor: "#EA4800" }}>
            <div className="text-2xl mb-2">{icon}</div>
            <div className={`font-display font-black text-xl leading-tight ${color}`}>{val}</div>
            <div className="text-xs font-semibold text-[#7A6A55] uppercase tracking-wide mt-0.5">{String(label)}</div>
          </div>
        ))}
      </div>

      {/* Wallet actions */}
      <div className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl overflow-hidden shadow-sm mb-5" style={{ borderTopWidth: 3, borderTopColor: "#EA4800" }}>
        <div className="bg-[#F4F1EC] border-b-[1.5px] border-[#E8E0D4] px-5 py-3.5">
          <span className="font-display font-bold text-base">💳 Wallet</span>
        </div>
        <div className="p-5 flex gap-3">
          <Button className="flex-1" onClick={() => setAddMoneyModal(true)}>💰 Add Money</Button>
          <Button variant="outline" className="flex-1" onClick={() => setWithdrawMoneyModal(true)}>💸 Withdraw</Button>
        </div>
      </div>

      {/* Recent withdrawals */}
      <div className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl overflow-hidden shadow-sm mb-5" style={{ borderTopWidth: 3, borderTopColor: "#EA4800" }}>
        <div className="bg-[#F4F1EC] border-b-[1.5px] border-[#E8E0D4] px-5 py-3.5">
          <span className="font-display font-bold text-base">📤 Recent Withdrawals</span>
        </div>
        <div className="p-4 space-y-2">
          {recentWithdrawals.length === 0 ? (
            <p className="text-sm text-[#7A6A55]">No withdrawals yet.</p>
          ) : (
            recentWithdrawals.map((w) => (
              <div key={w.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#FAFAF8] border border-[#E8E0D4]">
                <div className="text-sm">
                  <div className="font-semibold">₹{Number(w.amount).toLocaleString("en-IN")}</div>
                  <div className="text-xs text-[#7A6A55]">{new Date(w.createdAt).toLocaleString("en-IN")}</div>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                  w.status === "PENDING"
                    ? "bg-amber-100 text-amber-700"
                    : w.status === "APPROVED"
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}>
                  {w.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Menu */}
      <div className="bg-white border-[1.5px] border-[#E8E0D4] rounded-2xl overflow-hidden shadow-sm">
        {menuItems.map(([icon, label, action, danger]) => (
          <div
            key={String(label)}
            onClick={() => action?.()}
            className={`flex items-center gap-4 px-5 py-4 border-b border-[#E8E0D4] last:border-b-0 ${action ? "cursor-pointer hover:bg-[#FAFAF8]" : "cursor-default"} transition-colors ${danger ? "text-red-500" : "text-[#1A1208]"}`}
          >
            <span className="text-xl">{String(icon)}</span>
            <span className="flex-1 font-semibold text-sm">{String(label)}</span>
            {!danger && <span className="text-[#7A6A55]">›</span>}
          </div>
        ))}
      </div>

      <AddMoneyModal
        show={addMoneyModal}
        onClose={() => setAddMoneyModal(false)}
        onAdded={(amt) => { addMoney(amt); setAddMoneyModal(false); toast({ type: "success", icon: "✅", msg: `₹${amt} added to wallet!` }); }}
        addToast={toast}
      />

      <WithdrawMoneyModal
        show={withdrawMoneyModal}
        onClose={() => setWithdrawMoneyModal(false)}
        onRequested={(newBalance) => {
          setWalletBalance(newBalance);
          setWithdrawMoneyModal(false);
          api.get("/users/withdrawals/my?limit=5")
            .then((res) => setRecentWithdrawals(res.data?.data?.withdrawals ?? []))
            .catch((err) => {
              toast({ type: "error", icon: "❌", msg: getErrorMessage(err, "Failed to refresh recent withdrawals") });
            });
        }}
        addToast={toast}
      />
    </div>
  );
}
