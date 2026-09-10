import { useEffect } from "react";
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
 * Light mode (the original teal palette) is still fully supported — every
 * surface but Super Admin picks it up automatically via useAutoTheme() below
 * (OS/browser color-scheme preference); Super Admin keeps the manual
 * ThemeToggle.
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

/**
 * Keeps `theme` in sync with the OS/browser `prefers-color-scheme` while
 * `enabled` is true — applies it immediately and reacts to a live OS theme
 * change. Used by every surface that no longer offers a manual toggle
 * (dashboards, auth pages, the marketing site).
 */
export function useAutoTheme(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => useThemeStore.getState().setTheme(mql.matches ? "dark" : "light");
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [enabled]);
}
