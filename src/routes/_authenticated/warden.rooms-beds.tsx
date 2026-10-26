import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";
import { RoomsBedsBoard } from "@/components/hostel/RoomsBedsBoard";
import { useWardenPermissions } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/warden/rooms-beds")({
  head: () => ({ meta: [{ title: "Rooms & Beds — Hostylia" }] }),
  component: () => (
    <StaffModuleGuard role="WARDEN" module="rooms_beds_view">
      <WardenRoomsBedsPage />
    </StaffModuleGuard>
  ),
});

function WardenRoomsBedsPage() {
  const { propertyId, can, isLoading } = useWardenPermissions();
  if (isLoading) return null;
  if (!propertyId)
    return (
      <p className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-sm text-muted-foreground">
        No property assigned to your account yet — contact your Hostel Admin.
      </p>
    );

  return <RoomsBedsBoard propertyId={propertyId} canCreate={can("rooms_beds_create")} />;
}
