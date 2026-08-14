import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import "@/i18n";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Hostylia — Smart Residential Management" },
      {
        name: "description",
        content:
          "Hostylia is the smart residential operating system for hostels, boarding schools, student housing, PGs and co-living.",
      },
      { property: "og:title", content: "Hostylia — Smart Residential Management" },
      {
        property: "og:description",
        content:
          "Hostylia is the smart residential operating system for hostels, boarding schools, student housing, PGs and co-living.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Hostylia" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Hostylia — Smart Residential Management" },
      {
        name: "twitter:description",
        content:
          "Hostylia is the smart residential operating system for hostels, boarding schools, student housing, PGs and co-living.",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/jniP1INDbGeWUnFtlV1iyCqRoJV2/social-images/social-1782193576198-AE800E6D-1A63-4728-845D-C99D6882A527.webp",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/jniP1INDbGeWUnFtlV1iyCqRoJV2/social-images/social-1782193576198-AE800E6D-1A63-4728-845D-C99D6882A527.webp",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

// Default is "dark" (matches stores/theme-store.ts) so a first-time visitor
// with no saved preference still sees the same navy/gold palette as the
// marketing site, not a flash of the old light theme.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var raw = localStorage.getItem("hostylia_theme");
    var theme = raw ? JSON.parse(raw).state.theme : "dark";
    if (theme === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: THEME_INIT_SCRIPT mutates this element's
    // class before React hydrates, so the class attribute legitimately
    // differs between the SSR markup and the client's first paint.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Reads the persisted theme before first paint to avoid a light/dark flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function ScrollToTop() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [pathname]);
  return null;
}

// Routes that belong to the app (auth flow + authenticated shells) render
// WITHOUT the marketing chrome. Auth-flow routes (login/signup/verify-otp/
// access-pending/403) force their own dark class via AuthLayout; the rest
// (dashboards) follow the user's saved preference (see stores/theme-store.ts),
// which toggles the `.dark` class on <html> — this wrapper never forces a
// class itself. Marketing routes keep their own bespoke dark theme
// unconditionally (the `dark` class below is hardcoded, not tied to the
// user's toggle), since that palette isn't part of the semantic light/dark
// token system yet.
const APP_ROUTE_PREFIXES = [
  "/login",
  "/signup",
  "/verify-otp",
  "/verify-email",
  "/access-pending",
  "/post-login",
  "/403",
  "/apply",
  "/super-admin",
  "/admin",
  "/accountant",
  "/warden",
  "/student",
  "/parent",
];

function isAppRoute(pathname: string): boolean {
  return APP_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Every cached query (including Super-Admin-gated data) is tied to whichever
// identity fetched it. Supabase persists its session to localStorage shared
// across same-origin tabs, so if a different account signs in — in this tab
// or another one sharing that storage — the in-memory React Query cache can
// keep showing/serving data fetched under the *previous* identity even
// though every new server-function call now correctly re-authenticates as
// the new one (this is what makes a stale-looking "already loaded" screen
// coexist with a fresh mutation being correctly rejected). Clearing the
// cache whenever the authenticated user id changes — not just on explicit
// sign-out — closes that gap without touching any authorization check.
function useClearQueryCacheOnIdentityChange(queryClient: QueryClient) {
  const lastUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      if (event === "SIGNED_OUT") {
        queryClient.clear();
        lastUserId.current = null;
        return;
      }
      if (lastUserId.current !== undefined && uid !== lastUserId.current) {
        queryClient.clear();
      }
      lastUserId.current = uid;
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const appRoute = isAppRoute(pathname);
  useClearQueryCacheOnIdentityChange(queryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ScrollToTop />
      {appRoute ? (
        <div className="flex min-h-screen flex-col bg-background text-foreground">
          <Outlet />
        </div>
      ) : (
        <div className="dark flex min-h-screen flex-col bg-background text-foreground">
          <SiteHeader />
          <main className="flex-1">
            <Outlet />
          </main>
          <SiteFooter />
        </div>
      )}
      <Toaster />
    </QueryClientProvider>
  );
}
