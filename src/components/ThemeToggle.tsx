import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/stores/theme-store";

/**
 * Toggles the app between light and dark mode (Design.md Sec 4.4).
 * Persists via zustand (localStorage) and flips the `.dark` class read by
 * every semantic Tailwind token in styles.css.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const isDark = theme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      onClick={toggleTheme}
      aria-label={isDark ? t("common.switchToLightMode") : t("common.switchToDarkMode")}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
