import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * /admin/properties/$id has no page of its own — every in-app link goes
 * straight to /setup or /structure (admin.properties.index.tsx). Without
 * this route, visiting the bare id URL (e.g. a bookmark, a pasted link, or
 * clicking a property row before either sub-page loads) 404s instead of
 * landing somewhere useful. Setup is the canonical default — it's what the
 * property list's own row-click already navigates to.
 */
export const Route = createFileRoute("/_authenticated/admin/properties/$id/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/admin/properties/$id/setup", params: { id: params.id } });
  },
});
