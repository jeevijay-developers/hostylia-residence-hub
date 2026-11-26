import { createFileRoute, Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { z } from "zod";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth";

const accessPendingSearchSchema = z.object({
  as: z.enum(["student", "parent"]).optional(),
});

export const Route = createFileRoute("/access-pending")({
  validateSearch: accessPendingSearchSchema,
  head: () => ({
    meta: [{ title: "Access pending — Hostylia" }, { name: "robots", content: "noindex" }],
  }),
  component: AccessPendingPage,
});

const NEXT_STEPS = {
  student: [
    "Tell your hostel admin the phone number or email you signed up with.",
    "They confirm your admission and link it to this account.",
    "Sign in again — you'll land on your student home.",
  ],
  parent: [
    "Tell your hostel admin the phone number you signed in with.",
    "They link it to your child's profile.",
    "Sign in again with the same number.",
  ],
} as const;

function AccessPendingPage() {
  const { as } = Route.useSearch();
  const isStudent = as === "student";
  const steps = isStudent ? NEXT_STEPS.student : NEXT_STEPS.parent;

  return (
    <AuthLayout
      title="You're almost in"
      subtitle={
        isStudent
          ? "Your hostel just needs to link your admission to this account."
          : "Your hostel just needs to link your number to your child's profile."
      }
    >
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={step} className="flex items-start gap-3 text-sm text-foreground">
            <span
              aria-hidden
              className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
            >
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      <Button
        type="button"
        variant="outline"
        className="mt-6 min-h-11 w-full"
        onClick={async () => {
          await signOut();
          window.location.href = "/login";
        }}
      >
        <LogOut className="h-4 w-4" aria-hidden />
        Sign out
      </Button>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Need help?{" "}
        <a
          href="mailto:support@hostylia.com"
          className="text-primary underline-offset-4 hover:underline"
        >
          support@hostylia.com
        </a>
        <span aria-hidden> · </span>
        <Link to="/" className="underline-offset-4 hover:text-foreground hover:underline">
          Home
        </Link>
      </p>
    </AuthLayout>
  );
}
