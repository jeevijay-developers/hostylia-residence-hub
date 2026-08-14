import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for /warden/students/*.
 *
 * The list itself lives in warden.students.index.tsx. This file must render an
 * <Outlet /> — without it the $id child route resolves but displays this component
 * instead, hiding the student detail page. Same pattern as admin.students.tsx.
 */
export const Route = createFileRoute("/_authenticated/warden/students")({
  component: () => <Outlet />,
});
