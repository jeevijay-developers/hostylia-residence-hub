import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Loader2, Mail, Pencil, Send, Trash2, UserPlus, UserX } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { TableSkeleton } from "@/components/dashboard/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

interface StaffRow {
  id: string;
  role: string;
  is_active: boolean;
  revoked_at: string | null;
  profile?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
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

  const [addRole, setAddRole] = useState<"WARDEN" | "ACCOUNTANT" | null>(null);
  const [addMode, setAddMode] = useState<"phone" | "email">("phone");
  const [staffName, setStaffName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pendingRevoke, setPendingRevoke] = useState<StaffRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StaffRow | null>(null);
  const [editRow, setEditRow] = useState<StaffRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
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
      setAddRole(null);
      setStaffName("");
      setPhone("");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["staff", tenantId] });
    },
    onError: (e) => toast.error(errorMessage(e, "Could not add them")),
  });

  const resend = useMutation({
    mutationFn: (id: string) =>
      resendFn({ data: { tenant_id: tenantId!, role_assignment_id: id } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message ?? "Could not resend invitation");
        return;
      }
      toast.success("Invitation resent");
    },
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4" /> Add <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setAddRole("WARDEN")}>Warden</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAddRole("ACCOUNTANT")}>
                Accountant
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <Dialog
        open={!!addRole}
        onOpenChange={(open) => {
          if (!open) {
            setAddRole(null);
            setAddMode("phone");
            setStaffName("");
            setPhone("");
            setEmail("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add {addRole ? STAFF_ROLE_LABEL[addRole] : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddRole(null)}>
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
          {staffQ.isLoading ? (
            <TableSkeleton columns={5} rows={5} widths={["w-24", "w-32", "w-20", "w-16", "w-12"]} />
          ) : staffQ.isError ? (
            <TableBody>
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
            </TableBody>
          ) : (
            <TableBody>
              {staff.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center">
                    <p className="text-sm text-muted-foreground">No staff members yet.</p>
                  </TableCell>
                </TableRow>
              ) : (
                staff.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.profile?.full_name || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {s.profile?.phone && displayIndianPhone(s.profile.phone)}
                      {s.profile?.phone && s.profile?.email && " / "}
                      {s.profile?.email}
                    </TableCell>
                    <TableCell>{ROLE_LABEL[s.role] || s.role}</TableCell>
                    <TableCell>
                      <StaffStatusBadge row={s} />
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost">
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {s.revoked_at ? (
                            <DropdownMenuItem disabled>Revoked account</DropdownMenuItem>
                          ) : (
                            <>
                              {s.is_active && (
                                <>
                                  <DropdownMenuItem onClick={() => setEditRow(s)}>
                                    <Pencil className="mr-2 h-4 w-4" /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setPendingRevoke(s)}>
                                    <UserX className="mr-2 h-4 w-4" /> Revoke access
                                  </DropdownMenuItem>
                                </>
                              )}
                              {!s.is_active && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    resendFn({ data: { staff_id: s.id } })
                                      .then(() => {
                                        toast.success("Invite resent");
                                        staffQ.refetch();
                                      })
                                      .catch((e) =>
                                        toast.error(errorMessage(e, "Could not resend invite")),
                                      )
                                  }
                                >
                                  <Send className="mr-2 h-4 w-4" /> Resend invite
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => setPendingDelete(s)}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
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
