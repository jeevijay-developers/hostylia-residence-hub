import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, Pencil, Send, Trash2, UserPlus, UserX } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
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
  head: () => ({ meta: [{ title: "Staff — Hostylia" }] }),
  component: AdminStaffPage,
});

type PermissionKey =
  | "fee_plans"
  | "payments"
  | "refunds"
  | "invoices_view"
  | "invoices_create"
  | "invoices_edit"
  | "invoices_delete"
  | "attendance"
  | "complaints"
  | "gate_passes"
  | "gate_events"
  | "visitors"
  | "notices"
  | "mess_menus"
  | "feedback"
  | "students_create"
  | "students_edit"
  | "students_delete";

type StaffPermissions = Partial<Record<PermissionKey, boolean>>;

interface StaffRow {
  id: string;
  role: string;
  is_active: boolean;
  revoked_at: string | null;
  permissions?: StaffPermissions | null;
  profile?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
}

// The independently-RLS'd finance resources an Accountant has by default and
// a Warden can be individually granted — mirrors can_manage_*() in
// 20260814070000_warden_granular_finance_permissions.sql. Invoices is fully
// granular per-verb (pilot — see can_view_invoices() etc. in
// 20260814110000_granular_crud_pilot_students_invoices.sql): View also
// covers receipts and aging/DSO reports; Edit also covers GST invoicing
// fields and discounts/waivers — neither is a separate RLS-gated resource.
const FINANCE_PERMISSION_ITEMS: { key: PermissionKey; label: string; helper?: string }[] = [
  { key: "fee_plans", label: "Fee Plans" },
  {
    key: "invoices_view",
    label: "View Invoices",
    helper: "Also covers viewing receipts and aging/DSO reports.",
  },
  { key: "invoices_create", label: "Create Invoices" },
  {
    key: "invoices_edit",
    label: "Edit Invoices",
    helper: "Also covers GST invoicing fields and discounts/waivers.",
  },
  { key: "invoices_delete", label: "Delete Invoices" },
  { key: "payments", label: "Cash/Cheque Payments" },
  { key: "refunds", label: "Refunds" },
];

// The independently-RLS'd operational resources a Warden has by default and
// an Accountant can be individually granted — mirrors can_manage_*() in
// 20260814090000_accountant_granular_operational_permissions.sql.
// `mess_menus` also covers mess menu items and headcount recording; those
// aren't separate RLS-gated resources. `feedback` is the staff-authored
// survey tool, not the per-meal mess rating (staff can only view that one —
// there's nothing to "manage").
const OPERATIONAL_PERMISSION_ITEMS: { key: PermissionKey; label: string; helper?: string }[] = [
  { key: "attendance", label: "Manage Attendance" },
  { key: "complaints", label: "Manage Complaints" },
  { key: "gate_passes", label: "Manage Gate Pass/Out-Pass" },
  { key: "gate_events", label: "Manage Gate Events" },
  { key: "visitors", label: "Manage Visitors" },
  { key: "notices", label: "Manage Notices" },
  { key: "mess_menus", label: "Manage Mess Menu", helper: "Also covers menu items and headcount." },
  { key: "feedback", label: "Manage Feedback" },
];

// Students (pilot — see can_create_students() etc. in the same migration as
// the invoice split): Admin has View/Create/Edit/Delete. Read off the actual
// current RLS, not the PRD table (whose "Warden: VE" undersells what the
// real policies already grant) — Warden already has View/Create/Edit by
// default via separate pre-existing policies, so only Delete is a gap for
// them. Accountant already has View by default; Create/Edit/Delete are all
// gaps. Neither role gets a "View Students" item since neither lacks it.
const STUDENT_PERMISSION_ITEMS_FOR_WARDEN: { key: PermissionKey; label: string }[] = [
  { key: "students_delete", label: "Delete Students" },
];
const STUDENT_PERMISSION_ITEMS_FOR_ACCOUNTANT: { key: PermissionKey; label: string }[] = [
  { key: "students_create", label: "Create Students" },
  { key: "students_edit", label: "Edit Students" },
  { key: "students_delete", label: "Delete Students" },
];

const ALL_PERMISSION_ITEMS = [
  ...FINANCE_PERMISSION_ITEMS,
  ...OPERATIONAL_PERMISSION_ITEMS,
  ...STUDENT_PERMISSION_ITEMS_FOR_ACCOUNTANT,
];

// The checklist to show for "Customize Permissions": the *other* role's
// permissions — the ones this role doesn't have by default and an Admin can
// individually grant.
function permissionItemsForRole(role: "WARDEN" | "ACCOUNTANT") {
  return role === "WARDEN"
    ? [...FINANCE_PERMISSION_ITEMS, ...STUDENT_PERMISSION_ITEMS_FOR_WARDEN]
    : [...OPERATIONAL_PERMISSION_ITEMS, ...STUDENT_PERMISSION_ITEMS_FOR_ACCOUNTANT];
}

function otherRoleLabel(role: "WARDEN" | "ACCOUNTANT"): string {
  return role === "WARDEN" ? "Accountant" : "Warden";
}

// Every item in permissionItemsForRole(role) is, by construction, something
// this role does not have by default — so the checklist always starts
// unchecked.
function defaultPermissions(role: "WARDEN" | "ACCOUNTANT"): StaffPermissions {
  return Object.fromEntries(permissionItemsForRole(role).map((item) => [item.key, false]));
}

/** Roles are stored as enum values; never show the raw token to a user. */
const ROLE_LABEL: Record<string, string> = {
  HOSTEL_ADMIN: "Hostel admin",
  ACCOUNTANT: "Accountant",
  WARDEN: "Warden",
};

/** Matches the tint-and-token vocabulary of StudentStatusBadge. */
function StaffStatusBadge({ row }: { row: StaffRow }) {
  if (row.revoked_at) {
    return (
      <Badge variant="outline" className="bg-bed-blocked/15 text-bed-blocked">
        Revoked
      </Badge>
    );
  }
  if (row.is_active) {
    return (
      <Badge variant="outline" className="bg-bed-occupied/15 text-bed-occupied">
        Active
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-bed-maintenance/15 text-bed-maintenance">
      Invited
    </Badge>
  );
}

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
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
  const [addCustomizePerms, setAddCustomizePerms] = useState(false);
  const [addPermissions, setAddPermissions] = useState<StaffPermissions>(
    defaultPermissions("WARDEN"),
  );
  const [pendingRevoke, setPendingRevoke] = useState<StaffRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StaffRow | null>(null);
  const [editRow, setEditRow] = useState<StaffRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCustomizePerms, setEditCustomizePerms] = useState(false);
  const [editPermissions, setEditPermissions] = useState<StaffPermissions>(
    defaultPermissions("WARDEN"),
  );
  const [duplicateContact, setDuplicateContact] = useState<string | null>(null);

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

  // Check as soon as typing settles, instead of only surfacing the conflict
  // after a round trip to "Add" fails.
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
        <PageHeader title="Staff" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Staff"
        description="Add Wardens and Accountants; revoke access when they leave."
        actions={
          <Button
            onClick={() => {
              setAddRole(null);
              setAddCustomizePerms(false);
              setAddPermissions(defaultPermissions("WARDEN"));
              setAddOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4" /> Add
          </Button>
        }
      />

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
            setAddCustomizePerms(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add {addRole ? STAFF_ROLE_LABEL[addRole] : "staff"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="add-staff-role">Role</Label>
              <Select
                value={addRole ?? undefined}
                onValueChange={(v) => {
                  const role = v as "WARDEN" | "ACCOUNTANT";
                  setAddRole(role);
                  if (addCustomizePerms) setAddPermissions(defaultPermissions(role));
                }}
              >
                <SelectTrigger id="add-staff-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACCOUNTANT">Accountant</SelectItem>
                  <SelectItem value="WARDEN">Warden</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-staff-name">Name</Label>
              <Input
                id="add-staff-name"
                autoComplete="off"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Full name"
              />
            </div>

            <Tabs value={addMode} onValueChange={(v) => setAddMode(v as "phone" | "email")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="phone">Phone</TabsTrigger>
                <TabsTrigger value="email">Email</TabsTrigger>
              </TabsList>
              <TabsContent value="phone" className="space-y-1.5 pt-3">
                <Label htmlFor="add-staff-phone">Phone</Label>
                <Input
                  id="add-staff-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                />
                <p className="text-xs text-muted-foreground">
                  They sign in with this phone number and a one-time code — no password.
                </p>
              </TabsContent>
              <TabsContent value="email" className="space-y-1.5 pt-3">
                <Label htmlFor="add-staff-email">Email</Label>
                <Input
                  id="add-staff-email"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@example.com"
                />
                <p className="text-xs text-muted-foreground">
                  They'll get an invite email — ask them to use "Forgot password" on first sign-in
                  to set one.
                </p>
              </TabsContent>
            </Tabs>

            {duplicateContact && <p className="text-sm text-destructive">{duplicateContact}</p>}

            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="add-customize-perms" className="text-sm">
                    Customize Permissions
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {addRole
                      ? `By default a ${STAFF_ROLE_LABEL[addRole]} does not have ${otherRoleLabel(addRole)} permissions — grant specific ones below.`
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
                <div className="space-y-2">
                  {permissionItemsForRole(addRole).map((item) => (
                    <label key={item.key} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        className="mt-0.5"
                        checked={addPermissions[item.key]}
                        onCheckedChange={(v) =>
                          setAddPermissions((prev) => ({ ...prev, [item.key]: v === true }))
                        }
                      />
                      <span>
                        {item.label}
                        {item.helper && (
                          <span className="block text-xs text-muted-foreground">{item.helper}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!canInvite} onClick={() => invite.mutate()}>
              {invite.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {invite.isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staffQ.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-5 w-full" />
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
                    className="mt-3"
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
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.profile?.full_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.profile?.email ??
                        (s.profile?.phone ? displayIndianPhone(s.profile.phone) : null) ??
                        "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {ROLE_LABEL[s.role] ?? s.role}
                        {s.role !== "HOSTEL_ADMIN" &&
                          ALL_PERMISSION_ITEMS.map((item) => {
                            const override = s.permissions?.[item.key];
                            if (override === undefined) return null;
                            const granted = override === true;
                            return (
                              <Badge
                                key={item.key}
                                variant="outline"
                                className={
                                  granted
                                    ? "bg-bed-occupied/15 text-bed-occupied"
                                    : "bg-bed-blocked/15 text-bed-blocked"
                                }
                              >
                                {granted ? "+" : "−"} {item.label}
                              </Badge>
                            );
                          })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StaffStatusBadge row={s} />
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Icon-only actions; title= carries the label for a11y/hover. */}
                      {isOwner ? (
                        <span className="text-xs text-muted-foreground">
                          Account owner — cannot be revoked
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          {isPending && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Resend invitation"
                                aria-label="Resend invitation"
                                disabled={resend.isPending}
                                onClick={() => resend.mutate(s.id)}
                              >
                                {resend.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Mail className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Cancel invitation"
                                aria-label="Cancel invitation"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setPendingRevoke(s)}
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
                                  const role = s.role as "WARDEN" | "ACCOUNTANT";
                                  const items = permissionItemsForRole(role);
                                  const hasOverride = items.some(
                                    (item) => s.permissions?.[item.key] !== undefined,
                                  );
                                  setEditCustomizePerms(hasOverride);
                                  const defaults = defaultPermissions(role);
                                  setEditPermissions(
                                    Object.fromEntries(
                                      items.map((item) => [
                                        item.key,
                                        s.permissions?.[item.key] ?? defaults[item.key],
                                      ]),
                                    ),
                                  );
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Revoke access"
                                aria-label="Revoke access"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setPendingRevoke(s)}
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
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setPendingDelete(s)}
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

      <AlertDialog open={!!pendingRevoke} onOpenChange={(open) => !open && setPendingRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRevoke && !pendingRevoke.is_active
                ? `Cancel invitation for ${pendingRevoke.profile?.full_name ?? "this person"}?`
                : `Revoke access for ${pendingRevoke?.profile?.full_name ?? "this person"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRevoke && !pendingRevoke.is_active
                ? "They haven't accepted this invitation yet — cancelling it means they can no longer accept and get access. You can invite them again later."
                : "They lose access to this hostel immediately and their sign-in stops working. Their past activity stays on the record. You can invite them again later."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {pendingRevoke && !pendingRevoke.is_active ? "Keep invitation" : "Keep access"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingRevoke) revoke.mutate(pendingRevoke.id);
              }}
              disabled={revoke.isPending}
            >
              {revoke.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pendingRevoke && !pendingRevoke.is_active ? "Cancel invitation" : "Revoke access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDelete?.profile?.full_name ?? "this person"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes them from the staff list entirely — unlike Revoke, this can't be undone.
              You'd need to add them again from scratch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) del.mutate(pendingDelete.id);
              }}
              disabled={del.isPending}
            >
              {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editRow} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Edit {editRow ? (ROLE_LABEL[editRow.role] ?? editRow.role) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-staff-name">Name</Label>
              <Input
                id="edit-staff-name"
                autoComplete="off"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-staff-phone">Phone</Label>
              <Input
                id="edit-staff-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>

            {editRow && editRow.role !== "HOSTEL_ADMIN" && (
              <div className="space-y-3 rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label htmlFor="edit-customize-perms" className="text-sm">
                      Customize Permissions
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {`By default a ${ROLE_LABEL[editRow.role] ?? editRow.role} does not have ${otherRoleLabel(
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
                  <div className="space-y-2">
                    {permissionItemsForRole(editRow.role as "WARDEN" | "ACCOUNTANT").map((item) => (
                      <label key={item.key} className="flex items-start gap-2 text-sm">
                        <Checkbox
                          className="mt-0.5"
                          checked={editPermissions[item.key]}
                          onCheckedChange={(v) =>
                            setEditPermissions((prev) => ({ ...prev, [item.key]: v === true }))
                          }
                        />
                        <span>
                          {item.label}
                          {item.helper && (
                            <span className="block text-xs text-muted-foreground">
                              {item.helper}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditRow(null)}>
              Cancel
            </Button>
            <Button disabled={!canUpdate} onClick={() => update.mutate()}>
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
