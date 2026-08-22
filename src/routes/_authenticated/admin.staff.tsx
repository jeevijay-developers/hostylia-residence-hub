import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  Check,
  Loader2,
  Mail,
  Pencil,
  Send,
  Settings,
  Shield,
  Trash2,
  User,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useResolvedRole } from "@/lib/user-role";
import { usePropertyStore } from "@/stores/property-store";
import { supabase } from "@/integrations/supabase/client";
import { displayIndianPhone, normalizeIndianPhone } from "@/schemas/auth";
import {
  deleteStaff,
  inviteStaff,
  listStaff,
  resendStaffInvite,
  revokeStaff,
  updateStaff,
} from "@/lib/admin-staff.functions";

const STAFF_ROLE_LABEL = { WARDEN: "Warden", ACCOUNTANT: "Accountant" } as const;

export const Route = createFileRoute("/_authenticated/admin/staff")({
  head: () => ({ meta: [{ title: "Users — Hostylia" }] }),
  component: AdminStaffPage,
});

type PermissionKey =
  | "fee_plans_view"
  | "fee_plans_create"
  | "fee_plans_edit"
  | "fee_plans_delete"
  | "payments_view"
  | "payments_create"
  | "payments_edit"
  | "payments_delete"
  | "refunds"
  | "invoices_view"
  | "invoices_create"
  | "invoices_edit"
  | "invoices_delete"
  | "complaints"
  | "gate_events"
  | "notices"
  | "mess_menus"
  | "feedback"
  | "students_view"
  | "students_create"
  | "students_edit"
  | "students_delete"
  | "allocations_view"
  | "allocations_create"
  | "allocations_edit"
  | "rooms_beds_view"
  | "rooms_beds_edit"
  | "rooms_beds_create"
  | "rooms_beds_delete"
  | "attendance_view"
  | "attendance_create"
  | "attendance_edit"
  | "attendance_delete"
  | "gate_passes_view"
  | "gate_passes_create"
  | "gate_passes_edit"
  | "gate_passes_delete"
  | "visitors_view"
  | "visitors_create"
  | "visitors_edit"
  | "visitors_delete"
  | "reports_view";

type StaffPermissions = Partial<Record<PermissionKey, boolean>>;

interface StaffRow {
  id: string;
  role: string;
  is_active: boolean;
  revoked_at: string | null;
  property_id?: string | null;
  block_id?: string | null;
  permissions?: StaffPermissions | null;
  profile?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
}

const FINANCE_PERMISSION_ITEMS: { keys: PermissionKey[]; label: string; helper?: string }[] = [
  { keys: ["fee_plans_view"], label: "View Fee Plans" },
  { keys: ["fee_plans_create"], label: "Create Fee Plans" },
  { keys: ["fee_plans_edit"], label: "Edit Fee Plans" },
  { keys: ["fee_plans_delete"], label: "Delete Fee Plans" },
  {
    keys: ["invoices_view"],
    label: "View Invoices",
    helper: "Also covers viewing receipts and aging/DSO reports.",
  },
  { keys: ["invoices_create"], label: "Create Invoices" },
  {
    keys: ["invoices_edit"],
    label: "Edit Invoices",
    helper: "Also covers GST invoicing fields and discounts/waivers.",
  },
  { keys: ["invoices_delete"], label: "Delete Invoices" },
  { keys: ["payments_view"], label: "View Payments" },
  { keys: ["payments_create"], label: "Record Cash/Cheque Payments" },
  { keys: ["payments_edit"], label: "Edit Payments" },
  { keys: ["payments_delete"], label: "Delete Payments" },
  { keys: ["refunds"], label: "Refunds" },
];

// One checkbox = full manage (all 4 verbs together) for these — matches the
// "one flag covered every verb" shape these resources always had for the
// role that already owns them by default (Warden); an Accountant opting in
// gets the same all-or-nothing grant a Warden already has unconditionally.
const OPERATIONAL_PERMISSION_ITEMS: { keys: PermissionKey[]; label: string; helper?: string }[] = [
  {
    keys: ["attendance_view", "attendance_create", "attendance_edit", "attendance_delete"],
    label: "Manage Attendance",
  },
  { keys: ["complaints"], label: "Manage Complaints" },
  {
    keys: ["gate_passes_view", "gate_passes_create", "gate_passes_edit", "gate_passes_delete"],
    label: "Manage Gate Pass/Out-Pass",
  },
  { keys: ["gate_events"], label: "Manage Gate Events" },
  {
    keys: ["visitors_view", "visitors_create", "visitors_edit", "visitors_delete"],
    label: "Manage Visitors",
  },
  { keys: ["notices"], label: "Manage Notices" },
  { keys: ["mess_menus"], label: "Manage Mess Menu", helper: "Also covers menu items and headcount." },
  { keys: ["feedback"], label: "Manage Feedback" },
];

const STUDENT_PERMISSION_ITEMS_FOR_ACCOUNTANT: { keys: PermissionKey[]; label: string }[] = [
  { keys: ["students_create"], label: "Create Students" },
  { keys: ["students_edit"], label: "Edit Students" },
  { keys: ["students_delete"], label: "Delete Students" },
];

const ALL_PERMISSION_ITEMS = [
  ...FINANCE_PERMISSION_ITEMS,
  ...OPERATIONAL_PERMISSION_ITEMS,
  ...STUDENT_PERMISSION_ITEMS_FOR_ACCOUNTANT,
];

type Verb = "view" | "create" | "edit" | "delete";
const VERB_LABEL: Record<Verb, string> = {
  view: "Read",
  create: "Create",
  edit: "Update",
  delete: "Delete",
};

interface ModuleGridRow {
  id: string;
  label: string;
  helper?: string;
  verbs: Partial<Record<Verb, PermissionKey>>;
}

/** The Warden per-module Read/Create/Update/Delete grid — only verbs with a
 * real corresponding RLS-enforced action get a column filled in for a given
 * module (e.g. Complaints has no Create for staff, Notices has no Delete —
 * no phantom checkboxes for capabilities that don't exist). */
const WARDEN_MODULE_GRID: ModuleGridRow[] = [
  {
    id: "students",
    label: "Students",
    verbs: {
      view: "students_view",
      create: "students_create",
      edit: "students_edit",
      delete: "students_delete",
    },
  },
  {
    id: "allocations",
    label: "Allocations",
    helper: "No Delete — allocations are closed via status change, never deleted.",
    verbs: { view: "allocations_view", create: "allocations_create", edit: "allocations_edit" },
  },
  {
    id: "attendance",
    label: "Attendance",
    verbs: {
      view: "attendance_view",
      create: "attendance_create",
      edit: "attendance_edit",
      delete: "attendance_delete",
    },
  },
  {
    id: "complaints",
    label: "Complaints",
    helper: "Read and Update share one permission — students raise complaints, staff never create or delete them.",
    verbs: { view: "complaints", edit: "complaints" },
  },
  {
    id: "rooms_beds",
    label: "Rooms / Beds",
    helper: "Also covers Blocks and Floors.",
    verbs: {
      view: "rooms_beds_view",
      create: "rooms_beds_create",
      edit: "rooms_beds_edit",
      delete: "rooms_beds_delete",
    },
  },
  {
    id: "gate_passes",
    label: "Gate Pass",
    verbs: {
      view: "gate_passes_view",
      create: "gate_passes_create",
      edit: "gate_passes_edit",
      delete: "gate_passes_delete",
    },
  },
  {
    id: "visitors",
    label: "Visitors",
    verbs: {
      view: "visitors_view",
      create: "visitors_create",
      edit: "visitors_edit",
      delete: "visitors_delete",
    },
  },
  {
    id: "notices",
    label: "Notices",
    helper: "Read and Create share one permission — Update/Delete aren't staff-manage actions.",
    verbs: { view: "notices", create: "notices" },
  },
  {
    id: "reports",
    label: "Reports",
    helper: "Controls whether the Reports section is shown at all.",
    verbs: { view: "reports_view" },
  },
];

const WARDEN_GRID_KEYS: PermissionKey[] = Array.from(
  new Set(WARDEN_MODULE_GRID.flatMap((row) => Object.values(row.verbs))),
);

// Keys a Warden already has unconditionally today (see the migration this
// UI was built for) — "Customize Permissions" must seed these true, not
// blanket-false, or turning it on would look like revoking everything.
const WARDEN_GRID_DEFAULT_FALSE = new Set<PermissionKey>([
  "students_delete",
  "rooms_beds_create",
  "rooms_beds_delete",
]);

function wardenGridDefault(key: PermissionKey): boolean {
  return !WARDEN_GRID_DEFAULT_FALSE.has(key);
}

function permissionItemsForRole(role: "WARDEN" | "ACCOUNTANT") {
  return role === "WARDEN"
    ? FINANCE_PERMISSION_ITEMS
    : [...OPERATIONAL_PERMISSION_ITEMS, ...STUDENT_PERMISSION_ITEMS_FOR_ACCOUNTANT];
}

function otherRoleLabel(role: "WARDEN" | "ACCOUNTANT"): string {
  return role === "WARDEN" ? "Accountant" : "Warden";
}

const GRID_KEY_LABELS: Partial<Record<PermissionKey, string>> = Object.fromEntries(
  WARDEN_MODULE_GRID.flatMap((row) =>
    (Object.entries(row.verbs) as [Verb, PermissionKey | undefined][])
      .filter((e): e is [Verb, PermissionKey] => !!e[1])
      .map(([verb, key]) => [key, `${row.label} ${VERB_LABEL[verb]}`]),
  ),
);
const FLAT_KEY_LABELS: Partial<Record<PermissionKey, string>> = Object.fromEntries(
  ALL_PERMISSION_ITEMS.flatMap((item) => item.keys.map((k) => [k, item.label])),
);
function permissionKeyLabel(key: PermissionKey): string {
  return FLAT_KEY_LABELS[key] ?? GRID_KEY_LABELS[key] ?? key;
}

function defaultPermissions(role: "WARDEN" | "ACCOUNTANT"): StaffPermissions {
  const flat = Object.fromEntries(
    permissionItemsForRole(role).flatMap((item) => item.keys.map((k) => [k, false])),
  );
  if (role !== "WARDEN") return flat;
  const grid = Object.fromEntries(WARDEN_GRID_KEYS.map((k) => [k, wardenGridDefault(k)]));
  return { ...flat, ...grid };
}

const ROLE_LABEL: Record<string, string> = {
  HOSTEL_ADMIN: "Hostel admin",
  ACCOUNTANT: "Accountant",
  WARDEN: "Warden",
};

const AVATAR_COLOR_PAIRS = [
  { bg: "bg-purple-100 dark:bg-purple-950/80", text: "text-purple-600 dark:text-purple-400", border: "border-purple-300 dark:border-purple-800/50" },
  { bg: "bg-blue-100 dark:bg-blue-950/80", text: "text-blue-600 dark:text-blue-400", border: "border-blue-300 dark:border-blue-800/50" },
  { bg: "bg-teal-100 dark:bg-teal-950/80", text: "text-teal-600 dark:text-teal-400", border: "border-teal-300 dark:border-teal-800/50" },
  { bg: "bg-amber-100 dark:bg-amber-950/80", text: "text-amber-700 dark:text-amber-400", border: "border-amber-300 dark:border-amber-800/50" },
  { bg: "bg-emerald-100 dark:bg-emerald-950/80", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-300 dark:border-emerald-800/50" },
  { bg: "bg-indigo-100 dark:bg-indigo-950/80", text: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-300 dark:border-indigo-800/50" },
];

function getAvatarStyle(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return AVATAR_COLOR_PAIRS[Math.abs(hash) % AVATAR_COLOR_PAIRS.length];
}

function StaffStatusBadge({ row }: { row: StaffRow }) {
  if (row.revoked_at) {
    return (
      <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-rose-400 shadow-sm shadow-rose-400/50" />
        Revoked
      </Badge>
    );
  }
  if (row.is_active) {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse" />
        Active
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />
      Invited
    </Badge>
  );
}

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

function PermissionChecklist({
  items,
  values,
  onChange,
}: {
  items: { keys: PermissionKey[]; label: string; helper?: string }[];
  values: StaffPermissions;
  onChange: (keys: PermissionKey[], checked: boolean) => void;
}) {
  return (
    <div className="space-y-2 pt-1">
      {items.map((item) => (
        <label
          key={item.keys.join("+")}
          className="flex items-start gap-2 text-sm text-foreground cursor-pointer"
        >
          <Checkbox
            className="mt-0.5"
            checked={values[item.keys[0]]}
            onCheckedChange={(v) => onChange(item.keys, v === true)}
          />
          <span>
            {item.label}
            {item.helper && <span className="block text-xs text-muted-foreground">{item.helper}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

const GRID_VERBS: Verb[] = ["view", "create", "edit", "delete"];

/** Warden's per-module Read/Create/Update/Delete grid — a `—` cell means
 * that verb has no corresponding RLS-enforced action for this module (no
 * checkbox shown, so nothing implies a capability that doesn't exist). */
function PermissionGrid({
  values,
  onChange,
}: {
  values: StaffPermissions;
  onChange: (key: PermissionKey, checked: boolean) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-2.5 py-2">Module</th>
            {GRID_VERBS.map((v) => (
              <th key={v} className="px-2 py-2 text-center">
                {VERB_LABEL[v]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {WARDEN_MODULE_GRID.map((row) => (
            <tr key={row.id}>
              <td className="px-2.5 py-2 align-top">
                <span className="font-medium text-foreground">{row.label}</span>
                {row.helper && (
                  <span className="block text-[10px] leading-relaxed text-muted-foreground">
                    {row.helper}
                  </span>
                )}
              </td>
              {GRID_VERBS.map((v) => {
                const key = row.verbs[v];
                return (
                  <td key={v} className="px-2 py-2 text-center align-top">
                    {key ? (
                      <Checkbox
                        checked={values[key] ?? false}
                        onCheckedChange={(c) => onChange(key, c === true)}
                        aria-label={`${row.label} ${VERB_LABEL[v]}`}
                      />
                    ) : (
                      <span className="text-muted-foreground/30">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useBlocks(propertyId: string | null | undefined) {
  return useQuery({
    queryKey: ["blocks-lookup", propertyId],
    enabled: !!propertyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocks")
        .select("id, name")
        .eq("property_id", propertyId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function AdminStaffPage() {
  const { data: role } = useResolvedRole();
  const tenantId = role?.tenantId ?? null;
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  const qc = useQueryClient();
  const listFn = useServerFn(listStaff);
  const inviteFn = useServerFn(inviteStaff);
  const revokeFn = useServerFn(revokeStaff);
  const updateFn = useServerFn(updateStaff);
  const deleteFn = useServerFn(deleteStaff);
  const resendFn = useServerFn(resendStaffInvite);

  const staffQ = useQuery({
    queryKey: ["staff", tenantId],
    queryFn: () => listFn({ data: { tenant_id: tenantId! } }),
    enabled: !!tenantId,
  });
  const staff = useMemo(() => (staffQ.data ?? []) as StaffRow[], [staffQ.data]);

  const [addOpen, setAddOpen] = useState(false);
  const [addRole, setAddRole] = useState<"WARDEN" | "ACCOUNTANT" | null>(null);
  const [addMode, setAddMode] = useState<"phone" | "email">("phone");
  const [staffName, setStaffName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [addBlockId, setAddBlockId] = useState<string>("ALL");
  const [addCustomizePerms, setAddCustomizePerms] = useState(false);
  const [addPermissions, setAddPermissions] = useState<StaffPermissions>(
    defaultPermissions("WARDEN"),
  );
  const [pendingRevoke, setPendingRevoke] = useState<StaffRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StaffRow | null>(null);
  const [editRow, setEditRow] = useState<StaffRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBlockId, setEditBlockId] = useState<string>("ALL");
  const [editCustomizePerms, setEditCustomizePerms] = useState(false);
  const [editPermissions, setEditPermissions] = useState<StaffPermissions>(
    defaultPermissions("WARDEN"),
  );
  const [duplicateContact, setDuplicateContact] = useState<string | null>(null);

  // Property access = the property currently active in the picker (the same
  // scope every other Admin page/action already operates against — inviting
  // staff "for a different property" than the one you're looking at isn't a
  // flow anywhere else in the app). Block access is a real per-invite choice.
  const blocksQ = useBlocks(propertyId);
  const blocks = blocksQ.data ?? [];

  const activeContacts = useMemo(() => {
    const phones = new Set<string>();
    const emails = new Set<string>();
    for (const s of staff) {
      if (s.revoked_at) continue;
      if (s.profile?.phone) phones.add(s.profile.phone.trim());
      if (s.profile?.email) emails.add(s.profile.email.trim().toLowerCase());
    }
    return { phones, emails };
  }, [staff]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (addMode === "phone") {
        const trimmedPhone = phone.trim();
        setDuplicateContact(
          trimmedPhone && activeContacts.phones.has(normalizeIndianPhone(trimmedPhone))
            ? "Someone with this phone number already has access to this hostel."
            : null,
        );
      } else {
        const trimmedEmail = email.trim().toLowerCase();
        setDuplicateContact(
          trimmedEmail && activeContacts.emails.has(trimmedEmail)
            ? "Someone with this email already has access to this hostel."
            : null,
        );
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [phone, email, addMode, activeContacts]);

  const invite = useMutation({
    mutationFn: () =>
      inviteFn({
        data: {
          tenant_id: tenantId!,
          property_id: propertyId,
          block_id: addRole === "WARDEN" && addBlockId !== "ALL" ? addBlockId : null,
          full_name: staffName || null,
          phone: addMode === "phone" ? phone || null : null,
          email: addMode === "email" ? email || null : null,
          role: addRole!,
          permissions: addCustomizePerms ? addPermissions : undefined,
        },
      }),
    onSuccess: (out) => {
      if (out.resent) {
        toast.success("Invitation already pending — resent it.");
      } else {
        toast.success(
          addMode === "phone"
            ? "Invitation sent — they'll get access once they sign in with this phone number."
            : "Invitation sent — they'll get access once they set up sign-in via the invite email.",
        );
      }
      setAddOpen(false);
      setAddRole(null);
      setStaffName("");
      setPhone("");
      setEmail("");
      setAddBlockId("ALL");
      setAddCustomizePerms(false);
      qc.invalidateQueries({ queryKey: ["staff", tenantId] });
    },
    onError: (e) => toast.error(errorMessage(e, "Could not add them")),
  });

  const resend = useMutation({
    mutationFn: (id: string) =>
      resendFn({ data: { tenant_id: tenantId!, role_assignment_id: id } }),
    onSuccess: () => toast.success("Invitation resent"),
    onError: (e) => toast.error(errorMessage(e, "Could not resend invitation")),
  });

  const revoke = useMutation({
    mutationFn: (id: string) =>
      revokeFn({ data: { tenant_id: tenantId!, role_assignment_id: id } }),
    onSuccess: () => {
      toast.success("Access revoked");
      setPendingRevoke(null);
      qc.invalidateQueries({ queryKey: ["staff", tenantId] });
    },
    onError: (e) => toast.error(errorMessage(e, "Could not revoke access")),
  });

  const update = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          tenant_id: tenantId!,
          role_assignment_id: editRow!.id,
          full_name: editName,
          phone: editPhone,
          block_id:
            editRow?.role === "WARDEN" ? (editBlockId !== "ALL" ? editBlockId : null) : undefined,
          permissions: editCustomizePerms ? editPermissions : {},
        },
      }),
    onSuccess: () => {
      toast.success("Updated");
      setEditRow(null);
      qc.invalidateQueries({ queryKey: ["staff", tenantId] });
    },
    onError: (e) => toast.error(errorMessage(e, "Could not update")),
  });

  const del = useMutation({
    mutationFn: (id: string) =>
      deleteFn({ data: { tenant_id: tenantId!, role_assignment_id: id } }),
    onSuccess: () => {
      toast.success("Removed");
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["staff", tenantId] });
    },
    onError: (e) => toast.error(errorMessage(e, "Could not remove")),
  });

  const canUpdate = !update.isPending && editName.trim().length >= 2 && editPhone.trim() !== "";

  const canInvite =
    !invite.isPending &&
    !duplicateContact &&
    !!addRole &&
    staffName.trim().length >= 2 &&
    (addMode === "phone" ? phone.trim() !== "" : email.trim() !== "");

  if (!tenantId) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl pb-10">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-card border border-border/80 flex items-center justify-center text-amber-700 dark:text-amber-400 shadow-md shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Users</h1>
            <p className="text-sm text-muted-foreground">Manage all users and their access</p>
          </div>
        </div>

        <Button
          onClick={() => {
            setAddRole(null);
            setAddCustomizePerms(false);
            setAddPermissions(defaultPermissions("WARDEN"));
            setAddOpen(true);
          }}
          className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/90 font-bold rounded-full px-5 py-2.5 shadow-sm shadow-amber-500/10 flex items-center gap-2 self-start sm:self-center cursor-pointer transition-all"
        >
          <UserPlus className="h-4 w-4 stroke-[2.5]" />
          <span>Add</span>
        </Button>
      </div>

      {/* Add Staff Dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            setAddRole(null);
            setAddMode("phone");
            setStaffName("");
            setPhone("");
            setEmail("");
            setAddBlockId("ALL");
            setAddCustomizePerms(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md bg-card border-border rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add {addRole ? STAFF_ROLE_LABEL[addRole] : "staff"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="add-staff-role" className="text-foreground">Role</Label>
              <Select
                value={addRole ?? undefined}
                onValueChange={(v) => {
                  const role = v as "WARDEN" | "ACCOUNTANT";
                  setAddRole(role);
                  if (addCustomizePerms) setAddPermissions(defaultPermissions(role));
                }}
              >
                <SelectTrigger id="add-staff-role" className="bg-background border-border text-foreground rounded-xl">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground">
                  <SelectItem value="ACCOUNTANT">Accountant</SelectItem>
                  <SelectItem value="WARDEN">Warden</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {addRole === "WARDEN" && (
              <div className="space-y-1.5">
                <Label htmlFor="add-staff-block" className="text-foreground">Block access</Label>
                <Select value={addBlockId} onValueChange={setAddBlockId}>
                  <SelectTrigger
                    id="add-staff-block"
                    className="bg-background border-border text-foreground rounded-xl"
                  >
                    <SelectValue placeholder="All blocks" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-foreground">
                    <SelectItem value="ALL">All blocks (property-wide)</SelectItem>
                    {blocks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Property access is the property currently selected at the top of the app. Block
                  access narrows write actions (Attendance, Gate Pass, Rooms/Beds edits, etc.) to
                  just this block — leave as "All blocks" for property-wide access.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="add-staff-name" className="text-foreground">Name</Label>
              <Input
                id="add-staff-name"
                autoComplete="off"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Full name"
                className="bg-background border-border text-foreground rounded-xl"
              />
            </div>

            <Tabs value={addMode} onValueChange={(v) => setAddMode(v as "phone" | "email")}>
              <TabsList className="grid w-full grid-cols-2 bg-background border border-border rounded-xl">
                <TabsTrigger value="phone" className="rounded-lg">Phone</TabsTrigger>
                <TabsTrigger value="email" className="rounded-lg">Email</TabsTrigger>
              </TabsList>
              <TabsContent value="phone" className="space-y-1.5 pt-3">
                <Label htmlFor="add-staff-phone" className="text-foreground">Phone</Label>
                <Input
                  id="add-staff-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="bg-background border-border text-foreground rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  They sign in with this phone number and a one-time code — no password.
                </p>
              </TabsContent>
              <TabsContent value="email" className="space-y-1.5 pt-3">
                <Label htmlFor="add-staff-email" className="text-foreground">Email</Label>
                <Input
                  id="add-staff-email"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@example.com"
                  className="bg-background border-border text-foreground rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  They'll get an invite email — ask them to use "Forgot password" on first sign-in
                  to set one.
                </p>
              </TabsContent>
            </Tabs>

            {duplicateContact && <p className="text-sm text-destructive">{duplicateContact}</p>}

            <div className="space-y-3 rounded-xl border border-border/80 bg-background/50 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="add-customize-perms" className="text-sm text-foreground">
                    Customize Permissions
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {addRole === "WARDEN"
                      ? "Fine-tune what this Warden can Read/Create/Update/Delete per module below — unchecking revokes access they'd otherwise have by default."
                      : addRole
                        ? `By default an ${STAFF_ROLE_LABEL[addRole]} does not have ${otherRoleLabel(addRole)} permissions — grant specific ones below.`
                        : ""}
                  </p>
                </div>
                <Switch
                  id="add-customize-perms"
                  checked={addCustomizePerms}
                  onCheckedChange={(v) => {
                    setAddCustomizePerms(v);
                    if (v && addRole) setAddPermissions(defaultPermissions(addRole));
                  }}
                />
              </div>
              {addCustomizePerms && addRole && (
                <div className="space-y-3 pt-1">
                  {addRole === "WARDEN" && (
                    <PermissionGrid
                      values={addPermissions}
                      onChange={(key, checked) =>
                        setAddPermissions((prev) => ({ ...prev, [key]: checked }))
                      }
                    />
                  )}
                  <PermissionChecklist
                    items={permissionItemsForRole(addRole)}
                    values={addPermissions}
                    onChange={(keys, checked) =>
                      setAddPermissions((prev) => {
                        const next = { ...prev };
                        keys.forEach((k) => {
                          next[k] = checked;
                        });
                        return next;
                      })
                    }
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setAddOpen(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              disabled={!canInvite}
              onClick={() => invite.mutate()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-gradient-to-r dark:from-amber-500 dark:to-amber-600 dark:hover:from-amber-400 dark:hover:to-amber-500 dark:text-slate-950 font-bold rounded-xl"
            >
              {invite.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary-foreground dark:text-slate-950" />
              ) : (
                <Send className="h-4 w-4 text-primary-foreground dark:text-slate-950" />
              )}
              {invite.isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Users Table Card */}
      <section className="rounded-2xl border border-border/80 bg-card shadow-2xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/80 bg-background/40 hover:bg-transparent">
              <TableHead className="text-xs uppercase tracking-wider font-bold text-muted-foreground/80 py-4 px-4">
                <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 inline mr-1.5" />
                NAME
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-muted-foreground/80 py-4 px-4">
                <Mail className="w-3.5 h-3.5 text-sky-400 inline mr-1.5" />
                CONTACT
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-muted-foreground/80 py-4 px-4">
                <Shield className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 inline mr-1.5" />
                ROLE
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-muted-foreground/80 py-4 px-4">
                <Activity className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 inline mr-1.5" />
                STATUS
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-bold text-muted-foreground/80 py-4 px-4 text-right">
                <Settings className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 inline mr-1.5" />
                ACTIONS
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staffQ.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5} className="py-4">
                    <Skeleton className="h-8 w-full rounded-xl" />
                  </TableCell>
                </TableRow>
              ))
            ) : staffQ.isError ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    {errorMessage(staffQ.error, "Could not load staff.")}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 rounded-xl"
                    onClick={() => staffQ.refetch()}
                  >
                    Try again
                  </Button>
                </TableCell>
              </TableRow>
            ) : staff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No staff yet — invite your first Warden or Accountant above.
                </TableCell>
              </TableRow>
            ) : (
              staff.map((s) => {
                const isOwner = s.role === "HOSTEL_ADMIN";
                const isRevoked = !!s.revoked_at;
                const isPending = !s.is_active && !isRevoked;
                const fullName = s.profile?.full_name ?? "—";
                const initial = fullName !== "—" ? fullName.trim()[0]?.toUpperCase() ?? "?" : "?";
                const avatarStyle = getAvatarStyle(fullName);

                return (
                  <TableRow key={s.id} className="border-b border-border/60 hover:bg-accent/30 transition-colors">
                    <TableCell className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${avatarStyle.bg} ${avatarStyle.text} border ${avatarStyle.border} shrink-0 shadow-sm`}>
                          {initial}
                        </div>
                        <span className="font-semibold text-foreground text-sm">{fullName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 px-4 text-muted-foreground text-sm font-medium">
                      {s.profile?.email ??
                        (s.profile?.phone ? displayIndianPhone(s.profile.phone) : null) ??
                        "—"}
                    </TableCell>
                    <TableCell className="py-4 px-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-foreground font-semibold text-sm">{ROLE_LABEL[s.role] ?? s.role}</span>
                        {s.role !== "HOSTEL_ADMIN" &&
                          Object.entries(s.permissions ?? {}).map(([key, granted]) => (
                            <Badge
                              key={key}
                              variant="outline"
                              className={
                                granted
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] px-2 py-0.5"
                                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px] px-2 py-0.5"
                              }
                            >
                              {granted ? "+" : "−"} {permissionKeyLabel(key as PermissionKey)}
                            </Badge>
                          ))}
                      </div>
                    </TableCell>
                    <TableCell className="py-4 px-4">
                      <StaffStatusBadge row={s} />
                    </TableCell>
                    <TableCell className="py-4 px-4 text-right">
                      {isOwner ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-muted-foreground italic mr-2">
                            Account owner — cannot be revoked
                          </span>
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled
                              className="w-9 h-9 rounded-xl border border-border/40 text-muted-foreground/30 opacity-40 cursor-not-allowed"
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled
                              className="w-9 h-9 rounded-xl border border-border/40 text-muted-foreground/30 opacity-40 cursor-not-allowed"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          {isPending && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Resend invitation"
                                aria-label="Resend invitation"
                                disabled={resend.isPending && resend.variables === s.id}
                                onClick={() => resend.mutate(s.id)}
                                className="w-9 h-9 rounded-xl border border-border/80 bg-background/80 text-muted-foreground hover:text-amber-700 dark:hover:text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/10 transition-all"
                              >
                                {resend.isPending && resend.variables === s.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-amber-700 dark:text-amber-400" />
                                ) : (
                                  <Mail className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Cancel invitation"
                                aria-label="Cancel invitation"
                                onClick={() => setPendingRevoke(s)}
                                className="w-9 h-9 rounded-xl border border-border/80 bg-background/80 text-muted-foreground hover:text-rose-700 dark:hover:text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/10 transition-all"
                              >
                                <UserX className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {!isPending && !isRevoked && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Edit"
                                aria-label="Edit"
                                onClick={() => {
                                  setEditRow(s);
                                  setEditName(s.profile?.full_name ?? "");
                                  setEditPhone(
                                    s.profile?.phone ? displayIndianPhone(s.profile.phone) : "",
                                  );
                                  setEditBlockId(s.block_id ?? "ALL");
                                  const role = s.role as "WARDEN" | "ACCOUNTANT";
                                  const flatKeys = permissionItemsForRole(role).flatMap(
                                    (item) => item.keys,
                                  );
                                  const allKeys =
                                    role === "WARDEN" ? [...WARDEN_GRID_KEYS, ...flatKeys] : flatKeys;
                                  const hasOverride = allKeys.some(
                                    (key) => s.permissions?.[key] !== undefined,
                                  );
                                  setEditCustomizePerms(hasOverride);
                                  const defaults = defaultPermissions(role);
                                  setEditPermissions(
                                    Object.fromEntries(
                                      allKeys.map((key) => [key, s.permissions?.[key] ?? defaults[key]]),
                                    ),
                                  );
                                }}
                                className="w-9 h-9 rounded-xl border border-border/80 bg-background/80 text-muted-foreground hover:text-blue-700 dark:hover:text-blue-400 hover:border-blue-500/40 hover:bg-blue-500/10 transition-all"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Revoke access"
                                aria-label="Revoke access"
                                onClick={() => setPendingRevoke(s)}
                                className="w-9 h-9 rounded-xl border border-border/80 bg-background/80 text-muted-foreground hover:text-rose-700 dark:hover:text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/10 transition-all"
                              >
                                <UserX className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Delete"
                            aria-label="Delete"
                            onClick={() => setPendingDelete(s)}
                            className="w-9 h-9 rounded-xl border border-border/80 bg-background/80 text-muted-foreground hover:text-rose-500 hover:border-rose-500/40 hover:bg-rose-500/10 transition-all"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </section>

      {/* Revoke Alert Dialog */}
      <AlertDialog open={!!pendingRevoke} onOpenChange={(open) => !open && setPendingRevoke(null)}>
        <AlertDialogContent className="bg-card border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              {pendingRevoke && !pendingRevoke.is_active
                ? `Cancel invitation for ${pendingRevoke.profile?.full_name ?? "this person"}?`
                : `Revoke access for ${pendingRevoke?.profile?.full_name ?? "this person"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {pendingRevoke && !pendingRevoke.is_active
                ? "They haven't accepted this invitation yet — cancelling it means they can no longer accept and get access. You can invite them again later."
                : "They lose access to this hostel immediately and their sign-in stops working. Their past activity stays on the record. You can invite them again later."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl">
              {pendingRevoke && !pendingRevoke.is_active ? "Keep invitation" : "Keep access"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingRevoke) revoke.mutate(pendingRevoke.id);
              }}
              disabled={revoke.isPending}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revoke.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pendingRevoke && !pendingRevoke.is_active ? "Cancel invitation" : "Revoke access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Alert Dialog */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="bg-card border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              Delete {pendingDelete?.profile?.full_name ?? "this person"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This removes them from the staff list entirely — unlike Revoke, this can't be undone.
              You'd need to add them again from scratch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) del.mutate(pendingDelete.id);
              }}
              disabled={del.isPending}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Staff Dialog */}
      <Dialog open={!!editRow} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Edit {editRow ? (ROLE_LABEL[editRow.role] ?? editRow.role) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-staff-name" className="text-foreground">Name</Label>
              <Input
                id="edit-staff-name"
                autoComplete="off"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Full name"
                className="bg-background border-border text-foreground rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-staff-phone" className="text-foreground">Phone</Label>
              <Input
                id="edit-staff-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="bg-background border-border text-foreground rounded-xl"
              />
            </div>
            {editRow?.role === "WARDEN" && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-staff-block" className="text-foreground">Block access</Label>
                <Select value={editBlockId} onValueChange={setEditBlockId}>
                  <SelectTrigger
                    id="edit-staff-block"
                    className="bg-background border-border text-foreground rounded-xl"
                  >
                    <SelectValue placeholder="All blocks" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-foreground">
                    <SelectItem value="ALL">All blocks (property-wide)</SelectItem>
                    {blocks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {editRow && editRow.role !== "HOSTEL_ADMIN" && (
              <div className="space-y-3 rounded-xl border border-border/80 bg-background/50 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label htmlFor="edit-customize-perms" className="text-sm text-foreground">
                      Customize Permissions
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {editRow.role === "WARDEN"
                        ? "Fine-tune what this Warden can Read/Create/Update/Delete per module below — unchecking revokes access they'd otherwise have by default."
                        : `By default an ${ROLE_LABEL[editRow.role] ?? editRow.role} does not have ${otherRoleLabel(
                            editRow.role as "WARDEN" | "ACCOUNTANT",
                          )} permissions — grant specific ones below.`}
                    </p>
                  </div>
                  <Switch
                    id="edit-customize-perms"
                    checked={editCustomizePerms}
                    onCheckedChange={(v) => {
                      setEditCustomizePerms(v);
                      if (v) {
                        setEditPermissions(
                          defaultPermissions(editRow.role as "WARDEN" | "ACCOUNTANT"),
                        );
                      }
                    }}
                  />
                </div>
                {editCustomizePerms && (
                  <div className="space-y-3 pt-1">
                    {editRow.role === "WARDEN" && (
                      <PermissionGrid
                        values={editPermissions}
                        onChange={(key, checked) =>
                          setEditPermissions((prev) => ({ ...prev, [key]: checked }))
                        }
                      />
                    )}
                    <PermissionChecklist
                      items={permissionItemsForRole(editRow.role as "WARDEN" | "ACCOUNTANT")}
                      values={editPermissions}
                      onChange={(keys, checked) =>
                        setEditPermissions((prev) => {
                          const next = { ...prev };
                          keys.forEach((k) => {
                            next[k] = checked;
                          });
                          return next;
                        })
                      }
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setEditRow(null)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              disabled={!canUpdate}
              onClick={() => update.mutate()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-gradient-to-r dark:from-amber-500 dark:to-amber-600 dark:hover:from-amber-400 dark:hover:to-amber-500 dark:text-slate-950 font-bold rounded-xl"
            >
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin text-primary-foreground dark:text-slate-950" /> : null}
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

