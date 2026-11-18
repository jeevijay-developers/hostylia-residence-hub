import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for /accountant/students/*. The finance lookup (and, when
 * granted, student management) lives in accountant.students.index.tsx; this
 * must render an <Outlet /> so the $id detail child route can display.
 */
export const Route = createFileRoute("/_authenticated/accountant/students")({
  component: () => <Outlet />,
});
