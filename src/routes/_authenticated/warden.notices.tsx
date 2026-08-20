import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { NoticeComposer } from "@/components/notifications/NoticeComposer";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/warden/notices")({
  component: WardenNoticesPage,
});

function WardenNoticesPage() {
  // Wardens are scoped to a single property; resolve the first assignment.
  const { data: propertyId } = useQuery({
    queryKey: ["warden-property"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("role_assignments")
        .select("property_id")
        .eq("user_id", u.user.id)
        .eq("role", "WARDEN")
        .is("revoked_at", null)
        .limit(1)
        .maybeSingle();
      return data?.property_id ?? null;
    },
  });

  return (
    <div className="space-y-6">
      {propertyId ? (
        <NoticeComposer propertyId={propertyId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No property assignment found for your warden role.
        </p>
      )}
    </div>
  );
}
