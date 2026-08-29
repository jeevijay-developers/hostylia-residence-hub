import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";

import { AllocationBoard } from "@/components/hostel/AllocationBoard";
import { Button } from "@/components/ui/button";
import { useResolvedRole } from "@/lib/user-role";
import { useMyStaffProperty, useWardenPermissions } from "@/lib/staff-scope";

const searchSchema = z.object({
  student: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/warden/allocations")({
  head: () => ({ meta: [{ title: "Allocate Bed — Hostylia" }] }),
  validateSearch: searchSchema,
  component: WardenAllocationsPage,
});

/**
 * Same allocation board Admin uses (imported, not duplicated) — reused here
 * so a Warden can allocate a bed for a student with no current stay, e.g.
 * from the "Allocate Bed" button on Warden → Student details. Guarded
 * separately from /admin/allocations (which stays HOSTEL_ADMIN-only) so
 * this doesn't widen access to the rest of the Admin section.
 */
function WardenAllocationsPage() {
  const { student } = Route.useSearch();
  const { data: resolved } = useResolvedRole();
  const propQ = useMyStaffProperty(resolved?.userId);
  const { can, isLoading: permsLoading } = useWardenPermissions();

  if (permsLoading || propQ.isLoading) return null;

  if (!can("allocations_create")) {
    return (
      <div className="space-y-3">
        <BackLink studentId={student} />
        <p className="text-sm text-muted-foreground">You don't have permission to allocate beds.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BackLink studentId={student} />
      <AllocationBoard initialStudentId={student} propertyIdOverride={propQ.data ?? null} />
    </div>
  );
}

function BackLink({ studentId }: { studentId?: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      {studentId ? (
        <Link to="/warden/students/$id" params={{ id: studentId }}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      ) : (
        <Link to="/warden/students">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      )}
    </Button>
  );
}
