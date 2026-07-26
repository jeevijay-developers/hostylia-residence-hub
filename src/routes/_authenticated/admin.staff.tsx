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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useResolvedRole } from "@/lib/user-role";
import { usePropertyStore } from "@/stores/property-store";
import { inviteStaff, listStaff, revokeStaff } from "@/lib/admin-staff.functions";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  component: AdminStaffPage,
});

function AdminStaffPage() {
  const { data: role } = useResolvedRole();
  const tenantId = role?.tenantId ?? null;
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  const qc = useQueryClient();
  const listFn = useServerFn(listStaff);
  const inviteFn = useServerFn(inviteStaff);
  const revokeFn = useServerFn(revokeStaff);

  const { data: staff = [] } = useQuery({
    queryKey: ["staff", tenantId],
    queryFn: () => listFn({ data: { tenant_id: tenantId! } }),
    enabled: !!tenantId,
  });

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [staffRole, setStaffRole] = useState<"WARDEN" | "ACCOUNTANT">("WARDEN");

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
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { tenant_id: tenantId!, role_assignment_id: id } }),
    onSuccess: () => {
      toast.success("Access revoked");
      qc.invalidateQueries({ queryKey: ["staff", tenantId] });
    },
  });

  if (!tenantId) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <PageHeader title="Staff" description="Invite Wardens and Accountants; revoke access when they leave." />
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="text-sm font-semibold">Invite staff</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@example.com" />
          </div>
          <div className="space-y-1">
            <Label>Phone (E.164)</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={staffRole} onValueChange={(v) => setStaffRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="WARDEN">Warden</SelectItem>
                <SelectItem value="ACCOUNTANT">Accountant</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              disabled={invite.isPending || (!email && !phone)}
              onClick={() => invite.mutate()}
              className="w-full"
            >
              {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {invite.isPending ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Contact</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s: any) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{s.profile?.full_name ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{s.profile?.email ?? s.profile?.phone ?? "—"}</td>
                <td className="px-4 py-2">{s.role}</td>
                <td className="px-4 py-2">
                  {s.revoked_at ? (
                    <Badge variant="destructive">Revoked</Badge>
                  ) : s.is_active ? (
                    <Badge>Active</Badge>
                  ) : (
                    <Badge variant="secondary">Invited</Badge>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {!s.revoked_at && s.role !== "HOSTEL_ADMIN" && (
                    <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id)}>
                      <UserX className="h-4 w-4" /> Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!staff.length && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  No staff yet — invite your first Warden or Accountant above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
