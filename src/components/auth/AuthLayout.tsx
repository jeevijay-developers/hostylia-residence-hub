import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import logoAsset from "@/assets/hostylia-logo.png.asset.json";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

/**
 * Shared shell for /login, /verify-otp, /access-pending.
 * Mobile-first, centered card on larger screens. Light mode only.
 */
export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-center px-4 pt-8 pb-4 sm:pt-12">
        <Link to="/" className="inline-flex items-center gap-2" aria-label="Hostylia home">
          <img src={logoAsset.url} alt="Hostylia" className="h-8 w-auto" />
        </Link>
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
            By continuing, you agree to Hostylia's{" "}
            <Link to="/terms" className="underline hover:text-foreground">Terms</Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}
