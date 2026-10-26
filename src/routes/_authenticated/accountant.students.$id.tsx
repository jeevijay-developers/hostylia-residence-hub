import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAccountantPermissions } from "@/lib/staff-scope";
import { WardenStudentDetailPage } from "./warden.students.$id";

// Student detail for an Accountant granted a student permission — reuses the
// existing Warden detail page; Edit is gated on students_edit inside it.
export const Route = createFileRoute("/_authenticated/accountant/students/$id")({
  head: () => ({ meta: [{ title: "Student — Hostylia" }] }),
  component: AccStudentDetailRoute,
});

function AccStudentDetailRoute() {
  const { can, isLoading } = useAccountantPermissions();
  if (isLoading) return null;
  if (!(can("students_create") || can("students_edit") || can("students_delete"))) {
    return <Navigate to="/403" />;
  }
  return <WardenStudentDetailPage />;
}
