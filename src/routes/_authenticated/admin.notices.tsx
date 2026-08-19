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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-warning/10 text-warning">
          <Megaphone className="h-6 w-6" />
        </span>
        <div>
          <p className="font-display text-xl font-semibold text-foreground sm:text-2xl">Notices</p>
          <p className="text-sm text-muted-foreground">
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
