import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { getStudentPermissions, updateStudentPermissions } from "@/lib/admin-staff.functions";
import { getErrorMessage } from "@/lib/utils";

type Tier = "no_access" | "read" | "edit";

interface ModuleRow {
  key: "profile" | "attendance" | "complaints" | "notices" | "finance" | "gate_passes" | "mess";
  label: string;
  /** No write action exists for students in this module — only Read/No Access. */
  viewOnly?: boolean;
}

const MODULES: ModuleRow[] = [
  { key: "profile", label: "Profile" },
  { key: "attendance", label: "Attendance", viewOnly: true },
  { key: "complaints", label: "Complaints" },
  { key: "notices", label: "Notices", viewOnly: true },
  { key: "finance", label: "Finance" },
  { key: "gate_passes", label: "Gate Pass" },
  { key: "mess", label: "Mess" },
];

function tierFromPermissions(permissions: Record<string, boolean>, moduleKey: string): Tier {
  const view = permissions[`student_${moduleKey}_view`];
  const edit = permissions[`student_${moduleKey}_edit`];
  if (view === false) return "no_access";
  if (edit === true) return "edit";
  if (edit === false) return "read";
  // Absent keys default to Edit (both view+edit true) — see the migration's
  // role_assignments.permissions column comment.
  return "edit";
}

/**
 * Admin-facing per-module Read/Edit/No-Access control for one student,
 * backed by the same role_assignments.permissions JSONB Warden/Accountant
 * already use (see 20260821060645_student_module_permissions.sql) — just a
 * 3-tier UI over `student_<module>_view/_edit` boolean pairs instead of a
 * 4-verb checkbox grid, since students only ever need these 3 tiers.
 */
export function StudentPermissionCard({
  tenantId,
  studentId,
}: {
  tenantId: string;
  studentId: string;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getStudentPermissions);
  const updateFn = useServerFn(updateStudentPermissions);

  const q = useQuery({
    queryKey: ["student-permissions", studentId],
    queryFn: () => getFn({ data: { tenant_id: tenantId, student_id: studentId } }),
  });

  const [pending, setPending] = useState<Record<string, Tier>>({});

  const permissions = (q.data?.permissions ?? {}) as Record<string, boolean>;
  const tiers = useMemo(() => {
    const map: Record<string, Tier> = {};
    for (const m of MODULES) map[m.key] = pending[m.key] ?? tierFromPermissions(permissions, m.key);
    return map;
  }, [permissions, pending]);

  const save = useMutation({
    mutationFn: async (next: Record<string, Tier>) => {
      const patch: Record<string, boolean> = {};
      for (const m of MODULES) {
        const tier = next[m.key];
        patch[`student_${m.key}_view`] = tier !== "no_access";
        if (!m.viewOnly) patch[`student_${m.key}_edit`] = tier === "edit";
      }
      await updateFn({ data: { tenant_id: tenantId, student_id: studentId, permissions: patch } });
    },
    onSuccess: () => {
      toast.success("Module access updated");
      setPending({});
      qc.invalidateQueries({ queryKey: ["student-permissions", studentId] });
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not update module access")),
  });

  function setTier(moduleKey: string, tier: Tier) {
    const next = { ...tiers, [moduleKey]: tier };
    setPending((p) => ({ ...p, [moduleKey]: tier }));
    save.mutate(next);
  }

  if (q.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Module Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (q.data?.linked === false) {
    return (
      <Card>
        <CardHeader className="flex-col items-start gap-1 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Module Access
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Module access can be configured once the student's portal account is linked
            ("Confirm & link account" above).
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Module Access
        </CardTitle>
        {save.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </CardHeader>
      <CardContent className="space-y-3">
        {MODULES.map((m) => (
          <div key={m.key} className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">{m.label}</span>
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={tiers[m.key]}
              onValueChange={(v) => v && setTier(m.key, v as Tier)}
              disabled={save.isPending}
            >
              <ToggleGroupItem value="no_access" className="text-xs">
                No Access
              </ToggleGroupItem>
              <ToggleGroupItem value="read" className="text-xs">
                Read
              </ToggleGroupItem>
              {!m.viewOnly && (
                <ToggleGroupItem value="edit" className="text-xs">
                  Edit
                </ToggleGroupItem>
              )}
            </ToggleGroup>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
