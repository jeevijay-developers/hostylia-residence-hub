import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getGuardianPermissions, updateGuardianPermissions } from "@/lib/guardian.functions";
import { getErrorMessage } from "@/lib/utils";

type Flag =
  | "can_view_child_profile"
  | "can_view_attendance"
  | "can_view_finance"
  | "can_pay_fees"
  | "can_view_complaints"
  | "can_create_complaints"
  | "can_edit_own_complaints"
  | "can_view_notices"
  | "can_view_gate_events"
  | "can_approve_gate_pass"
  | "can_view_room_allocation"
  | "can_view_documents";

type Permissions = Partial<Record<Flag, boolean>>;

interface Tier {
  value: string;
  label: string;
  /** Cumulative — every flag true at and below this tier. */
  flags: Flag[];
}

interface Row {
  id: string;
  label: string;
  tiers: Tier[];
}

// Each row's tiers are cumulative (a higher tier implies every flag below
// it) — e.g. Complaints' "Edit own" tier sets view+create+edit_own all
// true. "Leave Requests" is Gate Pass under another name (no separate
// leave-request feature exists in the product — see
// 20260821104351_parent_module_permissions.sql); parents approve gate
// passes, they don't create them (students do), so its top tier is
// "Approve" not "Create".
const ROWS: Row[] = [
  {
    id: "child_profile",
    label: "Child Profile",
    tiers: [
      { value: "no_access", label: "No Access", flags: [] },
      { value: "read", label: "Read", flags: ["can_view_child_profile"] },
    ],
  },
  {
    id: "attendance",
    label: "Attendance",
    tiers: [
      { value: "no_access", label: "No Access", flags: [] },
      { value: "read", label: "Read", flags: ["can_view_attendance"] },
    ],
  },
  {
    id: "finance",
    label: "Fees / Invoices / Payments History",
    tiers: [
      { value: "no_access", label: "No Access", flags: [] },
      { value: "read", label: "Read", flags: ["can_view_finance"] },
    ],
  },
  {
    id: "payments",
    label: "Payments",
    tiers: [
      { value: "no_access", label: "No Access", flags: [] },
      { value: "read", label: "Read", flags: ["can_view_finance"] },
      { value: "pay", label: "Create (Pay)", flags: ["can_view_finance", "can_pay_fees"] },
    ],
  },
  {
    id: "complaints",
    label: "Complaints",
    tiers: [
      { value: "no_access", label: "No Access", flags: [] },
      { value: "read", label: "Read", flags: ["can_view_complaints"] },
      {
        value: "create",
        label: "Create",
        flags: ["can_view_complaints", "can_create_complaints"],
      },
      {
        value: "edit",
        label: "Edit (own)",
        flags: ["can_view_complaints", "can_create_complaints", "can_edit_own_complaints"],
      },
    ],
  },
  {
    id: "notices",
    label: "Notices / Announcements",
    tiers: [
      { value: "no_access", label: "No Access", flags: [] },
      { value: "read", label: "Read", flags: ["can_view_notices"] },
    ],
  },
  {
    id: "leave_requests",
    label: "Leave Requests (Gate Pass)",
    tiers: [
      { value: "no_access", label: "No Access", flags: [] },
      { value: "read", label: "Read", flags: ["can_view_gate_events"] },
      {
        value: "approve",
        label: "Approve",
        flags: ["can_view_gate_events", "can_approve_gate_pass"],
      },
    ],
  },
  {
    id: "room_allocation",
    label: "Room / Allocation Information",
    tiers: [
      { value: "no_access", label: "No Access", flags: [] },
      { value: "read", label: "Read", flags: ["can_view_room_allocation"] },
    ],
  },
  {
    id: "documents",
    label: "Documents",
    tiers: [
      { value: "no_access", label: "No Access", flags: [] },
      { value: "read", label: "Read", flags: ["can_view_documents"] },
    ],
  },
];

const ALL_FLAGS: Flag[] = Array.from(new Set(ROWS.flatMap((r) => r.tiers.flatMap((t) => t.flags))));

const DEFAULT_PERMISSIONS: Permissions = Object.fromEntries(ALL_FLAGS.map((f) => [f, true]));

function tierValueFor(row: Row, permissions: Permissions): string {
  for (let i = row.tiers.length - 1; i >= 0; i--) {
    const tier = row.tiers[i];
    if (tier.flags.every((f) => permissions[f] === true)) return tier.value;
  }
  return row.tiers[0].value;
}

function patchFor(row: Row, tierValue: string): Permissions {
  const tier = row.tiers.find((t) => t.value === tierValue) ?? row.tiers[0];
  const rowFlags = Array.from(new Set(row.tiers.flatMap((t) => t.flags)));
  const patch: Permissions = {};
  for (const flag of rowFlags) patch[flag] = tier.flags.includes(flag);
  return patch;
}

/**
 * Admin/Super-Admin-only Parent Permission Matrix for one guardian's link
 * to this student — student_guardians is per-relationship (a guardian can
 * have different access per child), so this card is rendered once per
 * linked guardian, same place StudentPermissionCard sits for the Student
 * matrix. Backed by getGuardianPermissions/updateGuardianPermissions
 * (src/lib/guardian.functions.ts), which PATCH the specific
 * student_guardians row — same admin-gated shape as updateStudentPermissions.
 */
export function ParentPermissionCard({
  tenantId,
  studentId,
  guardianId,
  guardianName,
}: {
  tenantId: string;
  studentId: string;
  guardianId: string;
  guardianName: string;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getGuardianPermissions);
  const updateFn = useServerFn(updateGuardianPermissions);
  const [pendingSave, setPendingSave] = useState<Permissions | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const q = useQuery({
    queryKey: ["guardian-permissions", studentId, guardianId],
    queryFn: () =>
      getFn({ data: { tenant_id: tenantId, student_id: studentId, guardian_id: guardianId } }),
  });

  const permissions = (q.data?.permissions ?? {}) as Permissions;

  const save = useMutation({
    mutationFn: async (patch: Permissions) => {
      await updateFn({
        data: { tenant_id: tenantId, student_id: studentId, guardian_id: guardianId, permissions: patch },
      });
    },
    onSuccess: () => {
      toast.success("Parent permissions updated");
      qc.invalidateQueries({ queryKey: ["guardian-permissions", studentId, guardianId] });
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not update parent permissions")),
  });

  function commit(next: Permissions) {
    const changedCount = ALL_FLAGS.filter((f) => (permissions[f] ?? true) !== next[f]).length;
    if (changedCount > 1) {
      setPendingSave(next);
      setConfirmOpen(true);
      return;
    }
    save.mutate({ ...permissions, ...next });
  }

  function setRowTier(row: Row, tierValue: string) {
    commit(patchFor(row, tierValue));
  }

  function setAllReadOnly() {
    const next: Permissions = {};
    for (const row of ROWS) {
      const readTier = row.tiers.find((t) => t.value === "read") ?? row.tiers[0];
      Object.assign(next, patchFor(row, readTier.value));
    }
    commit(next);
  }

  function resetToDefault() {
    commit(DEFAULT_PERMISSIONS);
  }

  const merged = useMemo(() => ({ ...DEFAULT_PERMISSIONS, ...permissions }), [permissions]);

  if (q.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Parent Permissions — {guardianName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Parent Permissions — {guardianName}
        </CardTitle>
        {save.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={setAllReadOnly}>
            Read Only
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={resetToDefault}>
            Reset to Default
          </Button>
        </div>
        <div className="space-y-3">
          {ROWS.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-foreground">{row.label}</span>
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={tierValueFor(row, merged)}
                onValueChange={(v) => v && setRowTier(row, v)}
                disabled={save.isPending}
              >
                {row.tiers.map((tier) => (
                  <ToggleGroupItem key={tier.value} value={tier.value} className="text-xs">
                    {tier.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          ))}
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save multiple permission changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You changed more than one permission for {guardianName}. Save these changes?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSave(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingSave) save.mutate({ ...permissions, ...pendingSave });
                setPendingSave(null);
              }}
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
