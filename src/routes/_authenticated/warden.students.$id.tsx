import { createFileRoute } from "@tanstack/react-router";
import { WardenStudentDetailPage } from "@/components/students/WardenStudentDetail";

export const Route = createFileRoute("/_authenticated/warden/students/$id")({
  head: () => ({ meta: [{ title: "Student — Hostylia" }] }),
  component: WardenStudentDetailPage,
});
