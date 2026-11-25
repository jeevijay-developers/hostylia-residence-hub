import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Building2 } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useAutoTheme } from "@/stores/theme-store";
import { CheckList, SectionChip } from "@/components/site/marketing/MarketingPrimitives";
import { marketingAssets } from "@/components/site/marketing/marketing-assets";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  hideLanguageSwitcher?: boolean;
}

const showcaseImage = marketingAssets.devices;

/**
 * Shared shell for /login, /signup, /verify-otp, /verify-email, /forgot-password,
 * /reset-password, /access-pending, /post-login and /403, in the marketing-site
 * style: form card on the left, emerald brand panel on the right (lg+).
 * `auth-brand` re-points the primary/ring tokens at the brand emerald for the
 * forms inside. Supports light and dark mode.
 */
export function AuthLayout({ children, title, subtitle, hideLanguageSwitcher }: AuthLayoutProps) {
  const { t, i18n } = useTranslation();
  const langAttr = i18n.language?.startsWith("hi") ? "hi" : "en";
  useAutoTheme();
  return (
    <div
      className="landing-type auth-brand grid min-h-screen overflow-x-hidden bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]"
      lang={langAttr}
    >
      <div className="flex min-h-screen flex-col bg-linear-to-b from-mint/60 via-background to-background lg:bg-none">
        {!hideLanguageSwitcher && (
          <header className="flex justify-end px-4 pt-6 sm:px-8 sm:pt-8">
            <LanguageSwitcher />
          </header>
        )}

        <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-8 sm:items-center sm:px-8">
          <div className="w-full max-w-md">
            <div className="rounded-[2rem] border border-border bg-card p-6 shadow-card-ambient sm:p-8">
              <div className="mb-6 text-center">
                <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                  {title}
                </h1>
                {subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}
              </div>
              {children}
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              {t("auth.termsPrefix")}{" "}
              <Link to="/terms" className="underline hover:text-foreground">
                {t("auth.terms")}
              </Link>{" "}
              {t("auth.and")}{" "}
              <Link to="/privacy" className="underline hover:text-foreground">
                {t("auth.privacy")}
              </Link>
              .
            </p>
          </div>
        </main>
      </div>

      {/* Brand panel (lg+): stays in view while the form column scrolls. */}
      <aside className="hidden p-4 lg:block">
        <div className="bg-landing-hero sticky top-4 flex h-[calc(100vh-2rem)] flex-col justify-between overflow-hidden rounded-[2rem] border border-brand-green/10 p-10 xl:p-12">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -right-40 -top-24 h-[460px] w-[720px] -rotate-12 rounded-[50%] border-[48px] border-card/50 blur-2xl" />
            <div className="absolute -bottom-24 -left-16 size-96 rounded-full bg-brand-green/10 blur-3xl" />
          </div>

          <div className="relative max-w-md">
            <SectionChip icon={Building2}>{t("auth.showcaseChip")}</SectionChip>
            <h2 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-foreground xl:text-4xl">
              {t("auth.showcaseTitle")}
            </h2>
            <CheckList
              className="mt-6"
              items={[
                t("auth.showcasePoint1"),
                t("auth.showcasePoint2"),
                t("auth.showcasePoint3"),
                t("auth.showcasePoint4"),
              ]}
            />
          </div>

          <img
            src={showcaseImage.src}
            alt={t("auth.showcaseImageAlt")}
            width={showcaseImage.w}
            height={showcaseImage.h}
            loading="lazy"
            decoding="async"
            className="relative mx-auto mt-8 h-auto max-h-[45%] w-auto max-w-full object-contain"
          />
        </div>
      </aside>
    </div>
  );
}
