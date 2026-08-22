import { createFileRoute } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { useEffect } from "react";

import { NoticeComposer } from "@/components/notifications/NoticeComposer";
import { usePropertyStore } from "@/stores/property-store";

export const Route = createFileRoute("/_authenticated/admin/notices")({
  component: AdminNoticesPage,
});

function AdminNoticesPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId);

  // Lock html/body scroll on this page so only DesktopShell's main content
  // area scrolls (matches the accountant layout's scroll-lock pattern);
  // restore on unmount so other admin pages are unaffected.
  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  return (
    <div className="w-full max-w-full space-y-6 overflow-x-hidden">
      <div className="flex items-center gap-3 sm:gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-warning/10 text-warning sm:h-14 sm:w-14">
          <Megaphone className="h-5 w-5 sm:h-6 sm:w-6" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold text-foreground sm:text-2xl">Notices</p>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Manage and publish announcements across channels
          </p>
        </div>
      </div>

      {propertyId ? (
        <NoticeComposer propertyId={propertyId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a property from the switcher to compose notices.
        </p>
      )}
    </div>
  );
}
