import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Imported on demand: route definitions ship in the entry bundle of every
    // page, so a static import would load the Supabase SDK on the marketing site too.
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/login" });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
