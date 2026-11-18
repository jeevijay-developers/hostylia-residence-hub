import { createFileRoute } from "@tanstack/react-router";

import { MoveOutWizard } from "@/components/students/MoveOutWizard";

export const Route = createFileRoute("/_authenticated/admin/students/$id/move-out")({
  head: () => ({ meta: [{ title: "Move out — Hostylia" }] }),
  component: AdminMoveOutPage,
});

function AdminMoveOutPage() {
  const { id } = Route.useParams();
  return <MoveOutWizard studentId={id} area="admin" canInitiateRefund />;
}
