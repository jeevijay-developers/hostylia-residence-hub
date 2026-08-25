import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { usePropertyStore } from "@/stores/property-store";
import { StudentsListPage } from "@/components/students/StudentsListPage";

export const Route = createFileRoute("/_authenticated/admin/students/")({
  head: () => ({ meta: [{ title: "Students — Hostylia" }] }),
  component: AdminStudentsRoute,
});

function AdminStudentsRoute() {
  const { data: resolved } = useResolvedRole();
  const tenantId = resolved?.tenantId ?? null;

  const propertiesQ = useQuery({
    queryKey: ["admin-properties-min", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("id, name, slug")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("name");
      return data ?? [];
    },
  });
  const activePropertyId = usePropertyStore((s) => s.activePropertyId);
  const [localPropertyId, setLocalPropertyId] = useState<string | null>(null);
  const effectiveProperty =
    localPropertyId ?? activePropertyId ?? propertiesQ.data?.[0]?.id ?? null;

  if (!tenantId) return null;

  return (
    <StudentsListPage
      tenantId={tenantId}
      viewBasePath="/admin/students"
      properties={propertiesQ.data ?? []}
      effectiveProperty={effectiveProperty}
      onPropertyChange={setLocalPropertyId}
      canCreate
      canDelete
    />
  );
}
