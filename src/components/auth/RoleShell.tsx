import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth";
import logoAsset from "@/assets/hostylia-logo.png.asset.json";

interface RoleShellProps {
  role: string;
  title: string;
}

/**
 * Phase 2 placeholder — a minimal authenticated shell that just shows the
 * user's resolved role. Dashboards land in Phase 3.
 */
export function RoleShell({ role, title }: RoleShellProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={logoAsset.url} alt="Hostylia" className="h-7 w-auto" />
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
        </div>
        <Button
          variant="outline"
          className="min-h-11"
          onClick={async () => {
            await signOut();
            window.location.href = "/login";
          }}
        >
          Sign out
        </Button>
      </header>
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Signed in as</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-foreground">{role}</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Your dashboard is on its way. This is a placeholder while we build Phase 3.
        </p>
      </div>
    </div>
  );
}
