import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for /admin/students/$id/*.
 *
 * The detail page itself lives in admin.students.$id.index.tsx. This file must render
 * an <Outlet /> — without it the move-out child route resolves but displays the detail
 * page instead. Same pattern as admin.finance.tsx.
 */
export const Route = createFileRoute("/_authenticated/admin/students/$id")({
  component: () => <Outlet />,
});
