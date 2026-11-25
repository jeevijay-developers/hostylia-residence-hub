import { createFileRoute } from "@tanstack/react-router";
import { WardenStudentsRoute } from "@/components/students/WardenStudentsPage";

export const Route = createFileRoute("/_authenticated/warden/students/")({
  head: () => ({ meta: [{ title: "Students — Hostylia" }] }),
  validateSearch: (search: Record<string, unknown>): { status?: string } => ({
    status: typeof search.status === "string" ? search.status : undefined,
  }),
  component: WardenStudentsRoute,
});
