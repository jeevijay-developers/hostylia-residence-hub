import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

function applyThemeClass(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/**
 * Cross-screen client-only state — light/dark preference persists across
 * navigation and reloads.
 *
 * Default is dark, deviating from Design.md Sec 4.4's documented light
 * default: the `.dark` tokens were re-pointed to match the marketing site's
 * navy/gold palette (see styles.css) specifically so the authenticated app
 * — including the Super Admin console — reads as the same product as the
 * public site by default, not just when a user happens to toggle dark.
 * Light mode (the original teal palette) is still fully supported and one
 * click away via ThemeToggle.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      setTheme: (theme) => {
        applyThemeClass(theme);
        set({ theme });
      },
      toggleTheme: () => {
        const next: Theme = get().theme === "dark" ? "light" : "dark";
        applyThemeClass(next);
        set({ theme: next });
      },
    }),
    {
      name: "hostylia_theme",
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeClass(state.theme);
      },
    },
  ),
);
