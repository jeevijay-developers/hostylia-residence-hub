import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth";

export const Route = createFileRoute("/403")({
  head: () => ({
    meta: [{ title: "Access denied — Hostylia" }, { name: "robots", content: "noindex" }],
  }),
  component: ForbiddenPage,
});

function ForbiddenPage() {
  return (
    <AuthLayout title="Access denied" subtitle="You don't have permission to view that page.">
      <div className="space-y-6 text-sm text-muted-foreground">
        <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-4 text-foreground">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <p>
            Your account role doesn't include access to that area. If you think this is a mistake,
            contact your hostel administrator.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="min-h-11 flex-1">
            <Link to="/post-login">Go to my dashboard</Link>
          </Button>
          <Button
            variant="outline"
            className="min-h-11 flex-1"
            onClick={async () => {
              await signOut();
              window.location.href = "/login";
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
