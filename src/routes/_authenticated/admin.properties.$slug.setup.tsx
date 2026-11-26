import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * A property's "setup" is its structure (blocks → floors → rooms → beds), so
 * /setup is the same page as /structure. Kept as a redirect so older links
 * and bookmarks still land somewhere useful. Property details are edited at
 * /admin/properties/$slug/edit.
 */
export const Route = createFileRoute("/_authenticated/admin/properties/$slug/setup")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/admin/properties/$slug/structure",
      params: { slug: params.slug },
      replace: true,
    });
  },
});
