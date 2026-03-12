import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ToastItem, ToastType } from "@/types";
import { useAuthStore } from "@/store/authStore";
import { api } from "@/lib/api";

let _toastId = 0;

interface WalletState {
  balance: number;
  won: number;
  contests: number;
  bonus: number;
}

interface AppContextValue {
  wallet: WalletState;
  toasts: ToastItem[];
  toast: (opts: { type: ToastType; icon?: string; msg: string }) => void;
  removeToast: (id: number) => void;
  refreshWallet: () => Promise<void>;
  addMoney: (amount: number) => void;
  setWalletBalance: (amount: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: React.ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const token = useAuthStore((s) => s.token);

  const [wallet, setWallet] = useState<WalletState>({
    balance: 0,
    won: 0,
    contests: 0,
    bonus: 0,
  });
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((opts: { type: ToastType; icon?: string; msg: string }) => {
    const id = ++_toastId;
    setToasts((prev) => [...prev, { ...opts, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshWallet = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get("/users/wallet/balance");
      const data = res.data?.data;
      setWallet({
        balance:  data?.balance  ?? 0,
        won:      data?.totalWon ?? 0,
        contests: data?.totalContests ?? 0,
        bonus:    data?.bonus    ?? 0,
      });
    } catch {
      // fail silently — balance just stays at 0
    }
  }, [token]);

  const addMoney = useCallback((amount: number) => {
    setWallet((prev) => ({ ...prev, balance: prev.balance + amount }));
  }, []);

  const setWalletBalance = useCallback((amount: number) => {
    setWallet((prev) => ({ ...prev, balance: amount }));
  }, []);

  // Fetch wallet whenever the user logs in or out
  useEffect(() => {
    if (token) {
      refreshWallet();
    } else {
      setWallet({ balance: 0, won: 0, contests: 0, bonus: 0 });
    }
  }, [token, refreshWallet]);

  return (
    <AppContext.Provider
      value={{ wallet, toasts, toast, removeToast, refreshWallet, addMoney, setWalletBalance }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}