import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, UserX } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useResolvedRole } from "@/lib/user-role";
import { usePropertyStore } from "@/stores/property-store";
import { inviteStaff, listStaff, revokeStaff } from "@/lib/admin-staff.functions";

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

  const staffQ = useQuery({
    queryKey: ["staff", tenantId],
    queryFn: () => listFn({ data: { tenant_id: tenantId! } }),
    enabled: !!tenantId,
  });
  const staff = (staffQ.data ?? []) as StaffRow[];

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [staffRole, setStaffRole] = useState<"WARDEN" | "ACCOUNTANT">("WARDEN");
  const [pendingRevoke, setPendingRevoke] = useState<StaffRow | null>(null);

  const invite = useMutation({
    mutationFn: () =>
      inviteFn({
        data: {
          tenant_id: tenantId!,
          property_id: propertyId,
          email: email || null,
          phone: phone || null,
          role: staffRole,
        },
      }),
    onSuccess: () => {
      toast.success("Invite sent");
      setEmail("");
      setPhone("");
      qc.invalidateQueries({ queryKey: ["staff", tenantId] });
    },
    onError: (e) => toast.error(errorMessage(e, "Could not send the invite")),
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

  const canInvite = !invite.isPending && (email.trim() !== "" || phone.trim() !== "");

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
        description="Invite Wardens and Accountants; revoke access when they leave."
      />

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">Invite staff</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Send to an email address or a phone number. They pick their own password on first sign-in.
        </p>

        <div className="mt-5 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-phone">Phone</Label>
            <Input
              id="invite-phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={staffRole}
              onValueChange={(v) => setStaffRole(v as "WARDEN" | "ACCOUNTANT")}
            >
              <SelectTrigger id="invite-role" className="lg:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WARDEN">Warden</SelectItem>
                <SelectItem value="ACCOUNTANT">Accountant</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button disabled={!canInvite} onClick={() => invite.mutate()}>
            {invite.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {invite.isPending ? "Sending…" : "Send invite"}
          </Button>
        </div>
      </section>

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
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.profile?.full_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.profile?.email ?? s.profile?.phone ?? "—"}
                    </TableCell>
                    <TableCell>{ROLE_LABEL[s.role] ?? s.role}</TableCell>
                    <TableCell>
                      <StaffStatusBadge row={s} />
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Never leave this cell blank: say why an action is unavailable. */}
                      {isRevoked ? (
                        <span className="text-xs text-muted-foreground">No longer has access</span>
                      ) : isOwner ? (
                        <span className="text-xs text-muted-foreground">
                          Account owner — cannot be revoked
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setPendingRevoke(s)}
                        >
                          <UserX className="h-4 w-4" /> Revoke
                        </Button>
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
              Revoke access for {pendingRevoke?.profile?.full_name ?? "this person"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to this hostel immediately and their sign-in stops working. Their
              past activity stays on the record. You can invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep access</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingRevoke) revoke.mutate(pendingRevoke.id);
              }}
              disabled={revoke.isPending}
            >
              {revoke.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Revoke access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
