import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for /admin/students/*.
 *
 * The list itself lives in admin.students.index.tsx. This file must render an
 * <Outlet /> — without it the $id child route resolves but displays this component
 * instead, hiding the student detail page. Same pattern as admin.finance.tsx.
 */
export const Route = createFileRoute("/_authenticated/admin/students")({
  component: () => <Outlet />,
});
