import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { api, registerAdminTokenGetter } from "@/admin/api";
import type { AuthUser } from "@/store/authStore";

interface AdminAuthState {
  admin: AuthUser | null;
  token: string | null;
  loading: boolean;

  login:  (mobile: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Completely separate auth store for the admin panel.
 * Uses its own localStorage key ("king11pro-admin-auth") so it never
 * shares state with the user-facing authStore ("king11pro-auth").
 */
export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      admin:   null,
      token:   null,
      loading: false,

      login: async (mobile, password) => {
        set({ loading: true });
        try {
          const res = await api.post("/users/login", {
            mobileNumber: mobile,
            password,
          });
          const { user, tokens } = res.data.data;

          if (user.role !== "ADMIN") {
            set({ loading: false });
            throw new Error("Access denied. Admin credentials only.");
          }

          set({ admin: user, token: tokens.accessToken, loading: false });
        } catch (err) {
          set({ loading: false });
          throw err;
        }
      },

      logout: async () => {
        try {
          await api.post("/users/logout");
        } catch {
          // Ignore logout API failures and always clear local state.
        }
        set({ admin: null, token: null });
      },
    }),
    {
      name: "king11pro-admin-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ admin: s.admin, token: s.token }),
    }
  )
);

// Register the admin token getter AFTER the store is created.
// The api interceptor will pick this up on every request.
registerAdminTokenGetter(() => useAdminAuthStore.getState().token);