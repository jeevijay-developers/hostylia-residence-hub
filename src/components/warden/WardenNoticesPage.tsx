import { NoticeComposer } from "@/components/notifications/NoticeComposer";
import { useStaffPermissions } from "@/lib/staff-scope";

export function WardenNoticesPage() {
  const { propertyId, isLoading } = useStaffPermissions();

  if (isLoading) return null;

  return (
    <div className="space-y-6">
      {propertyId ? (
        <NoticeComposer propertyId={propertyId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No property assignment found for your warden role.
        </p>
      )}
    </div>
  );
}
