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

function permissionItemsForRole(role: "WARDEN" | "ACCOUNTANT") {
  return role === "WARDEN"
    ? [...FINANCE_PERMISSION_ITEMS, ...STUDENT_PERMISSION_ITEMS_FOR_WARDEN]
    : [...OPERATIONAL_PERMISSION_ITEMS, ...STUDENT_PERMISSION_ITEMS_FOR_ACCOUNTANT];
}

function otherRoleLabel(role: "WARDEN" | "ACCOUNTANT"): string {
  return role === "WARDEN" ? "Accountant" : "Warden";
}

function defaultPermissions(role: "WARDEN" | "ACCOUNTANT"): StaffPermissions {
  return Object.fromEntries(permissionItemsForRole(role).map((item) => [item.key, false]));
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
                <div className="space-y-2 pt-1">
                  {permissionItemsForRole(addRole).map((item) => (
                    <label key={item.key} className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
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
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] px-2 py-0.5"
                                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px] px-2 py-0.5"
                                }
                              >
                                {granted ? "+" : "−"} {item.label}
                              </Badge>
                            );
                          })}
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
                                disabled={resend.isPending}
                                onClick={() => resend.mutate(s.id)}
                                className="w-9 h-9 rounded-xl border border-border/80 bg-background/80 text-muted-foreground hover:text-amber-700 dark:hover:text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/10 transition-all"
                              >
                                {resend.isPending ? (
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

            {editRow && editRow.role !== "HOSTEL_ADMIN" && (
              <div className="space-y-3 rounded-xl border border-border/80 bg-background/50 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label htmlFor="edit-customize-perms" className="text-sm text-foreground">
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
                  <div className="space-y-2 pt-1">
                    {permissionItemsForRole(editRow.role as "WARDEN" | "ACCOUNTANT").map((item) => (
                      <label key={item.key} className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
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

