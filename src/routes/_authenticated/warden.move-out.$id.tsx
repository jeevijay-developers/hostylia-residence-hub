import { createFileRoute } from "@tanstack/react-router";

import { MoveOutWizard } from "@/components/students/MoveOutWizard";
import { useWardenPermissions } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/warden/move-out/$id")({
  head: () => ({ meta: [{ title: "Move out — Hostylia" }] }),
  component: WardenMoveOutPage,
});

/**
 * Same wizard Admin uses (shared component, not a copy). Access is gated on
 * the Warden's allocations_edit grant here for UX; the real authorization is
 * inside complete_move_out() (tenant/property/block scope + allocations_edit).
 */
function WardenMoveOutPage() {
  const { id } = Route.useParams();
  const { can, isLoading } = useWardenPermissions();

  if (isLoading) return null;
  if (!can("allocations_edit")) {
    return (
      <p className="text-sm text-destructive">
        Access denied — you don't have permission to move students out.
      </p>
    );
  }
  return <MoveOutWizard studentId={id} area="warden" canInitiateRefund={can("refunds")} />;
}
