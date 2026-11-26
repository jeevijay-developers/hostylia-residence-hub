import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AllocationBoard } from "@/components/hostel/AllocationBoard";

const searchSchema = z.object({
  /** Preselects a student (e.g. "Change room" on the property overview). */
  student: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/admin/allocations")({
  head: () => ({ meta: [{ title: "Allocations — Hostylia" }] }),
  validateSearch: searchSchema,
  component: AdminAllocationsPage,
});

function AdminAllocationsPage() {
  const { student } = Route.useSearch();
  // Keyed by student so following a second "Change room" link re-seeds the board.
  return <AllocationBoard key={student ?? "none"} initialStudentId={student} />;
}
