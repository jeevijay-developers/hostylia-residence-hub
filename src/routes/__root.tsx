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
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Toaster } from "@/components/ui/sonner";
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
      { name: "description", content: "Hostylia is the smart residential operating system for hostels, boarding schools, student housing, PGs and co-living." },
      { property: "og:title", content: "Hostylia — Smart Residential Management" },
      { property: "og:description", content: "Hostylia is the smart residential operating system for hostels, boarding schools, student housing, PGs and co-living." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Hostylia" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Hostylia — Smart Residential Management" },
      { name: "twitter:description", content: "Hostylia is the smart residential operating system for hostels, boarding schools, student housing, PGs and co-living." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/jniP1INDbGeWUnFtlV1iyCqRoJV2/social-images/social-1782193576198-AE800E6D-1A63-4728-845D-C99D6882A527.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/jniP1INDbGeWUnFtlV1iyCqRoJV2/social-images/social-1782193576198-AE800E6D-1A63-4728-845D-C99D6882A527.webp" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@400;500;600;700;800&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
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
// WITHOUT the marketing chrome and WITHOUT the `dark` wrapper — they're the
// product surface, styled with the light-mode semantic tokens by default.
const APP_ROUTE_PREFIXES = [
  "/login",
  "/verify-otp",
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
  return APP_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const appRoute = isAppRoute(pathname);

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
