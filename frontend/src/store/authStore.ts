import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { api, registerTokenGetter } from "@/lib/api";

export interface AuthUser {
  id: string;
  name: string;
  mobileNumber: string;
  role: string;
  walletBalance: number;
  isActive: boolean;
  createdAt: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  loading: boolean;

  login: (mobile: string, password: string) => Promise<void>;
  register: (data: {
    name: string;
    mobileNumber: string;
    password: string;
  }) => Promise<void>;
  fetchProfile: () => Promise<void>;
  updateWalletBalance: (balance: number) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      loading: false,

      login: async (mobile, password) => {
        set({ loading: true });
        try {
          const res = await api.post("/users/login", {
            mobileNumber: mobile,
            password,
          });
          const { user, tokens } = res.data.data;
          set({
            user,
            token: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            loading: false,
          });
        } catch (err) {
          set({ loading: false });
          throw err;
        }
      },

      register: async (data) => {
        set({ loading: true });
        try {
          const res = await api.post("/users/register", data);
          const { user, tokens } = res.data.data;
          set({
            user,
            token: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            loading: false,
          });
        } catch (err) {
          set({ loading: false });
          throw err;
        }
      },

      fetchProfile: async () => {
        try {
          const res = await api.get("/users/me");
          const user: AuthUser = res.data.data.user;
          set((s) => ({ user: { ...s.user!, ...user } }));
        } catch {
          // silent — profile fetch failure shouldn't log the user out
        }
      },

      updateWalletBalance: (balance: number) => {
        set((s) => s.user ? { user: { ...s.user, walletBalance: balance } } : {});
      },

      logout: async () => {
        try {
          await api.post("/users/logout");
        } catch {
          // Ignore logout API failures and always clear local state.
        }
        set({ user: null, token: null, refreshToken: null });
      },
    }),
    {
      name: "king11pro-auth",
      storage: createJSONStorage(() => localStorage),
      // Only persist these fields — don't persist loading state
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
      }),
    }
  )
);

// Register the token getter AFTER store is created — breaks the circular dependency
registerTokenGetter(() => useAuthStore.getState().token);
