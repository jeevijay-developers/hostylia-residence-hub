import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth";

export const Route = createFileRoute("/access-pending")({
  head: () => ({
    meta: [
      { title: "Access pending — Hostylia" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccessPendingPage,
});

function AccessPendingPage() {
  return (
    <AuthLayout
      title="You're almost in"
      subtitle="Your account is verified — we just need your hostel to finish linking it."
    >
      <div className="space-y-6 text-sm text-muted-foreground">
        <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-4 text-foreground">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <p>
            Your phone number isn't linked to a student profile yet. Once your hostel warden or
            admin adds you as a guardian, you'll be able to sign in and see everything about your
            child's stay — attendance, fees, gate events, and more.
          </p>
        </div>
        <div className="space-y-2">
          <p className="font-medium text-foreground">What to do next</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Contact your hostel administration and share the phone number you used to sign in.</li>
            <li>Ask them to link it to your child's profile in Hostylia.</li>
            <li>Once linked, sign in again with the same number.</li>
          </ul>
        </div>
        <div className="space-y-2 rounded-xl border border-border p-4">
          <p className="font-medium text-foreground">Need help?</p>
          <p>
            Reach us at{" "}
            <a href="mailto:support@hostylia.com" className="text-primary underline">
              support@hostylia.com
            </a>
            .
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          onClick={async () => {
            await signOut();
            window.location.href = "/login";
          }}
          asChild={false}
        >
          Sign out
        </Button>
        <p className="text-center text-xs">
          <Link to="/" className="underline hover:text-foreground">Back to Hostylia home</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
