import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CircleAlert, Clock, LifeBuoy, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatIstDate } from "@/lib/ist";
import type { PlanExpiry } from "@/lib/admin-dashboard";

const DISMISS_PREFIX = "hostylia_plan_banner_dismissed:";

function message(expiry: PlanExpiry) {
  const noun = expiry.status === "TRIAL" ? "trial" : "plan";
  const date = formatIstDate(expiry.endDate);
  if (expiry.indicator === "ENDED") return { lead: `Your ${noun} ended on`, em: date };
  if (expiry.indicator === "ENDS_TODAY") return { lead: `Your ${noun} ends`, em: `today, ${date}` };
  const inDays = expiry.days === 1 ? "tomorrow" : `in ${expiry.days} days`;
  return { lead: `Your ${noun} ends ${inDays}, on`, em: date };
}

/**
 * Plan-end reminder shown when the tenant's subscription is inside the shared
 * "ending soon" window (subscription-expiry.ts) or has ended. There is no
 * self-serve renewal in the app — plans are changed by Hostylia — so the call
 * to action is a support ticket, with Billing for the plan details. Dismissal
 * lasts for the browser session and is tied to the specific period end, so a
 * new period (or a later reminder state) shows again.
 */
export function PlanExpiryBanner({ expiry }: { expiry: PlanExpiry }) {
  const dismissKey = `${DISMISS_PREFIX}${expiry.subscriptionId}:${expiry.endDate}:${expiry.indicator}`;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(dismissKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [dismissKey]);

  if (dismissed) return null;

  const ended = expiry.indicator === "ENDED";
  const { lead, em } = message(expiry);
  const StatusIcon = ended ? CircleAlert : Clock;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(dismissKey, "1");
    } catch {
      // Storage unavailable (private mode) — dismissal just won't persist.
    }
  };

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-2 rounded-xl border px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-3",
        ended ? "border-destructive/25 bg-destructive/5" : "border-warning/25 bg-warning/5",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:items-center">
        <StatusIcon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 sm:mt-0",
            ended ? "text-destructive" : "text-warning",
          )}
          aria-hidden="true"
        />
        <p className="min-w-0 text-foreground/90">
          {lead}{" "}
          <span className={cn("font-semibold", ended ? "text-destructive" : "text-warning")}>
            {em}
          </span>
          .{" "}
          <span className="text-muted-foreground">
            {ended
              ? "Contact Hostylia support to continue."
              : "Contact Hostylia support to continue without interruption."}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-1 self-end sm:self-auto">
        <Link
          to="/admin/settings"
          search={{ tab: "billing" }}
          className="inline-flex items-center rounded-md px-2 py-1 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View billing
        </Link>
        <Link
          to="/admin/support"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LifeBuoy className="h-4 w-4" aria-hidden="true" />
          Contact support
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss plan reminder"
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
