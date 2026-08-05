import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

/** Inline nudge shown next to a disabled action when the student hasn't
 * uploaded any KYC document yet. Links to My Profile, where uploads live. */
export function KycGateNotice({
  message = "Upload your KYC documents to unlock this action.",
}: {
  message?: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
      <ShieldAlert className="h-4 w-4 shrink-0 translate-y-0.5" />
      <span>
        {message}{" "}
        <Link to="/student/profile" className="font-medium underline underline-offset-2">
          Go to My Profile
        </Link>
      </span>
    </div>
  );
}
