import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import logoAsset from "@/assets/hostylia-logo.png";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

/**
 * Shared shell for /login, /signup, /verify-otp, /access-pending, /403.
 * Mobile-first, centered card on larger screens. Always dark (matches the
 * marketing/landing page palette) — same `dark` class-forcing pattern as
 * the non-app route wrapper in __root.tsx, not tied to the theme store.
 */
export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  const { t, i18n } = useTranslation();
  const langAttr = i18n.language?.startsWith("hi") ? "hi" : "en";
  return (
    <div className="dark flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground" lang={langAttr}>
      <header className="relative flex items-center justify-center px-4 pt-8 pb-4 sm:pt-12">
        <Link to="/" className="inline-flex items-center gap-2" aria-label="Hostylia home">
          <img src={logoAsset} alt="Hostylia" className="h-6 w-auto sm:h-7" />
        </Link>
        <div className="absolute right-3 top-6 flex items-center gap-1 sm:top-10">
          <LanguageSwitcher />
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-12 sm:items-center">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="mb-6 text-center">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            {children}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            {t("auth.termsPrefix")}{" "}
            <Link to="/terms" className="underline hover:text-foreground">{t("auth.terms")}</Link>{" "}
            {t("auth.and")}{" "}
            <Link to="/privacy" className="underline hover:text-foreground">{t("auth.privacy")}</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}

