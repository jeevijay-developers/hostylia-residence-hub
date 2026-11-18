import { createFileRoute } from "@tanstack/react-router";
import { StudentFinancePanel } from "@/components/finance/StudentFinancePanel";
import { useAccountantPermissions, useAccountantProperty } from "@/lib/staff-scope";
import { WardenStudentsRoute } from "./warden.students.index";

export const Route = createFileRoute("/_authenticated/accountant/students/")({
  validateSearch: (search: Record<string, unknown>): { status?: string } => ({
    status: typeof search.status === "string" ? search.status : undefined,
  }),
  component: AccStudentsPage,
});

function AccStudentsPage() {
  const { propertyId, isLoading: propertyLoading } = useAccountantProperty();
  const { can } = useAccountantPermissions();
  if (propertyLoading) return null;
  if (!propertyId)
    return (
      <p className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-sm text-muted-foreground">
        No property assigned to your account yet — contact your Hostel Admin.
      </p>
    );
  // The finance lookup is unchanged; the shared student-management list (same
  // component Admin/Warden use) is added only when Admin granted at least one
  // student permission, and it gates Add/Delete per key (students_create /
  // students_delete) — Edit is gated on the detail page (students_edit).
  const canManageStudents = can("students_create") || can("students_edit") || can("students_delete");
  return (
    <div className="space-y-8">
      <StudentFinancePanel propertyId={propertyId} />
      {canManageStudents && <WardenStudentsRoute />}
    </div>
  );
}
