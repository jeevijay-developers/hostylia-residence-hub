import { create } from "zustand";

type ThemeType = "light" | "dark";

interface ThemeState {
  theme: ThemeType;
}

interface ThemeStore extends ThemeState {
  isDark: boolean;
  toggle: () => void;
  init: () => void;
  setTheme: (theme: ThemeType) => void;
}

const STORAGE_KEY = "hostylia_theme";
const DEFAULT_THEME: ThemeType = "light";

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: DEFAULT_THEME,
  isDark: false,

  init: () => {
    // Get saved theme from localStorage or use default
    const saved = localStorage.getItem(STORAGE_KEY);
    let theme = DEFAULT_THEME;

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        theme = parsed.state?.theme || DEFAULT_THEME;
      } catch {
        theme = DEFAULT_THEME;
      }
    }

    const isDark = theme === "dark";

    // Apply theme to document
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    set({ theme, isDark });
  },

  toggle: () => {
    set((state) => {
      const newTheme: ThemeType = state.theme === "light" ? "dark" : "light";
      const isDark = newTheme === "dark";

      // Apply to document
      if (isDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }

      // Persist to localStorage in Zustand format
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { theme: newTheme } }));

      return { theme: newTheme, isDark };
    });
  },

  setTheme: (theme: ThemeType) => {
    const isDark = theme === "dark";

    // Apply to document
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    // Persist to localStorage in Zustand format
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { theme } }));

    set({ theme, isDark });
  },
}));
