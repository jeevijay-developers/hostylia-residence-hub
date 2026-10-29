import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { KYC_LOCKED_MESSAGE, type KycStatus } from "@/lib/kyc";

const STATUS_HINT: Record<KycStatus, string> = {
  NONE: "Upload your KYC documents from My Profile to get started.",
  PENDING: "Your documents are under review. Access unlocks as soon as they are verified.",
  REJECTED: "A document was rejected. Re-upload it from My Profile to continue.",
  VERIFIED: "",
};

/** Rendered in place of a student page while KYC isn't verified. The page
 * component never mounts, so none of its queries or actions run. */
export function KycLockedPanel({ status }: { status: KycStatus }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-warning/10 text-warning">
        <Lock className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="font-display text-lg font-bold text-foreground">{KYC_LOCKED_MESSAGE}</h2>
      <p className="text-sm text-muted-foreground">{STATUS_HINT[status]}</p>
      <Button asChild className="mt-2">
        <Link to="/student/profile">Go to My Profile</Link>
      </Button>
    </div>
  );
}
