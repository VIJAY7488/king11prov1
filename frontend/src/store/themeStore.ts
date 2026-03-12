import { create } from 'zustand';


interface ThemeState {
    isDark: boolean;
    toggle: () => void;
}


export const useThemeStore = create<ThemeState>((set) => ({
    isDark: (() => {
        if (typeof window !== 'undefined') {
            return document.documentElement.classList.contains('dark') ||
            window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return false;
    })(),
    toggle: () =>
        set((state) => {
            const next = !state.isDark;
            document.documentElement.classList.toggle('dark', next);
            return { isDark: next };
        }),
}));