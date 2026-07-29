import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for /admin/properties/*.
 *
 * The list itself lives in admin.properties.index.tsx. This file must render an
 * <Outlet /> — without it the child routes ($id/setup, $id/structure) resolve but
 * display this component instead, which silently hid the setup wizard and the
 * structure builder. Same pattern as admin.finance.tsx.
 */
export const Route = createFileRoute("/_authenticated/admin/properties")({
  component: () => <Outlet />,
});
