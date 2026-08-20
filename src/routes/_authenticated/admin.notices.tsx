import { createFileRoute } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";

import { NoticeComposer } from "@/components/notifications/NoticeComposer";
import { usePropertyStore } from "@/stores/property-store";

export const Route = createFileRoute("/_authenticated/admin/notices")({
  component: AdminNoticesPage,
});

function AdminNoticesPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId);
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
