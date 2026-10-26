import { createFileRoute, useRouterState, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { useMyStaffProperty, useStaffPermissions } from "@/lib/staff-scope";
import { StudentsListPage } from "@/components/students/StudentsListPage";

export const Route = createFileRoute("/_authenticated/warden/students/")({
  head: () => ({ meta: [{ title: "Students — Hostylia" }] }),
  validateSearch: (search: Record<string, unknown>): { status?: string } => ({
    status: typeof search.status === "string" ? search.status : undefined,
  }),
  component: WardenStudentsRoute,
});

/**
 * Same Students UI/logic as Admin (StudentsListPage, shared — not
 * duplicated), scoped to this warden's own assigned property and gated by
 * their real granted permissions (students_create/students_delete) instead
 * of Admin's always-on access.
 */
export function WardenStudentsRoute() {
  const { status } = useSearch({ strict: false }) as { status?: string };
  const isAccountantView = useRouterState({
    select: (s) => s.location.pathname.startsWith("/accountant/"),
  });
  const { data: resolved } = useResolvedRole();
  const tenantId = resolved?.tenantId ?? null;
  const propQ = useMyStaffProperty(resolved?.userId);
  const propertyId = propQ.data ?? null;
  const { can, isLoading: permsLoading } = useStaffPermissions();

  const propertyRowQ = useQuery({
    queryKey: ["warden-own-property-row", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, slug")
        .eq("id", propertyId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (!tenantId || permsLoading) return null;

  return (
    <StudentsListPage
      tenantId={tenantId}
      viewBasePath={isAccountantView ? "/accountant/students" : "/warden/students"}
      properties={propertyRowQ.data ? [propertyRowQ.data] : []}
      effectiveProperty={propertyId}
      canCreate={can("students_create")}
      canDelete={can("students_delete")}
      initialStatusFilter={status}
    />
  );
}
