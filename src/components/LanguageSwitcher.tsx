import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { writeCookieLocale, type AppLocale } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

/**
 * Toggles UI language between English and Hindi.
 * Persists via cookie + profiles.locale (best-effort — silent if not signed in).
 * No localStorage per Rules.md artifact constraints.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();

  const change = async (next: AppLocale) => {
    await i18n.changeLanguage(next);
    writeCookieLocale(next);
    // Best-effort profile write — RLS will limit to own row.
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase.from("profiles").update({ locale: next }).eq("id", data.user.id);
    }
  };

  const current = (i18n.language?.startsWith("hi") ? "hi" : "en") as AppLocale;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={className} aria-label={t("language.label")}>
          <Languages className="h-4 w-4" />
          <span className="ml-1.5 text-xs uppercase">{current}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => change("en")}>{t("language.english")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => change("hi")} lang="hi">
          {t("language.hindi")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
