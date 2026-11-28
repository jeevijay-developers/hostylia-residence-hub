import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old /admin/properties/$slug/residents links: the tab is now Students. */
export const Route = createFileRoute("/_authenticated/admin/properties/$slug/residents")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/admin/properties/$slug/students",
      params: { slug: params.slug },
      replace: true,
    });
  },
});
