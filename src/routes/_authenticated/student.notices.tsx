import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { NoticeFeed } from "@/components/notifications/NoticeFeed";
import { StudentModuleGuard } from "@/components/dashboard/RoleGuard";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/student/notices")({
  component: StudentNoticesPage,
});

function StudentNoticesPage() {
  const { data } = useQuery({
    queryKey: ["student-scope"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data: s } = await supabase
        .from("students")
        .select("tenant_id, property_id")
        .eq("profile_id", u.user.id)
        .is("deleted_at", null)
        .maybeSingle();
      return s;
    },
  });

  return (
    <StudentModuleGuard module="notices">
      <div className="space-y-6">
        <PageHeader title="Notices" description="Announcements from your hostel." />
        <NoticeFeed
          tenantId={data?.tenant_id}
          propertyId={data?.property_id}
          audienceFilter={["ALL", "STUDENTS"]}
          emptyLabel="No notices posted yet."
        />
      </div>
    </StudentModuleGuard>
  );
}
