import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { NoticeComposer } from "@/components/notifications/NoticeComposer";
import { usePropertyStore } from "@/stores/property-store";

export const Route = createFileRoute("/_authenticated/admin/notices")({
  component: AdminNoticesPage,
});

function AdminNoticesPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notices"
        description="Manage and publish announcements for the active property."
      />
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
