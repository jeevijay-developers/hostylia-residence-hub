import { createFileRoute } from "@tanstack/react-router";

import { AllocationBoard } from "@/components/hostel/AllocationBoard";

export const Route = createFileRoute("/_authenticated/admin/allocations")({
  head: () => ({ meta: [{ title: "Allocations — Hostylia" }] }),
  component: AllocationBoard,
});
