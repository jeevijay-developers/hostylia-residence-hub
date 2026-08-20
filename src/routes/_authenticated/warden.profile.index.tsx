import type { ReactNode } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Lock, UserRoundPen } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";

export const Route = createFileRoute("/_authenticated/warden/profile/")({
  head: () => ({ meta: [{ title: "My Profile — Hostylia" }] }),
  component: WardenProfilePage,
});

interface WardenAssignment {
  id: string;
  employee_id: string | null;
  property_id: string | null;
  block_id: string | null;
  granted_at: string;
  property_name: string | null;
  block_name: string | null;
}

function useWardenProfile(userId: string | null) {
  const profileQ = useQuery({
    queryKey: ["warden-profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const assignmentsQ = useQuery({
    queryKey: ["warden-assignments", userId],
    enabled: !!userId,
    queryFn: async (): Promise<WardenAssignment[]> => {
      const { data: assignments, error } = await supabase
        .from("role_assignments")
        .select("id, employee_id, property_id, block_id, granted_at, properties(name)")
        .eq("user_id", userId!)
        .eq("role", "WARDEN")
        .eq("is_active", true)
        .order("granted_at", { ascending: false });
      if (error) throw error;

      const blockIds = Array.from(
        new Set((assignments ?? []).map((a) => a.block_id).filter((v): v is string => !!v)),
      );
      const blockNames = new Map<string, string>();
      if (blockIds.length > 0) {
        const { data: blocks } = await supabase
          .from("blocks")
          .select("id, name")
          .in("id", blockIds);
        for (const b of blocks ?? []) blockNames.set(b.id, b.name);
      }

      return (assignments ?? []).map((a) => ({
        id: a.id,
        employee_id: a.employee_id,
        property_id: a.property_id,
        block_id: a.block_id,
        granted_at: a.granted_at,
        property_name: (a.properties as { name: string } | null)?.name ?? null,
        block_name: a.block_id ? (blockNames.get(a.block_id) ?? null) : null,
      }));
    },
  });

  return { profileQ, assignmentsQ };
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-md bg-muted/50 p-2">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" /> {label}
      </p>
      <p className="text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

function WardenProfilePage() {
  const { data: resolved } = useResolvedRole();
  const userId = resolved?.userId ?? null;
  const { profileQ, assignmentsQ } = useWardenProfile(userId);

  if (profileQ.isLoading || assignmentsQ.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!profileQ.data) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">Could not load your profile.</p>
      </div>
    );
  }

  const p = profileQ.data;
  const assignments = assignmentsQ.data ?? [];
  const primary = assignments[0];
  const properties = Array.from(new Set(assignments.map((a) => a.property_name).filter(Boolean)));
  const blocks = Array.from(new Set(assignments.map((a) => a.block_name).filter(Boolean)));
  const initial = (p.preferred_name ?? p.full_name).trim()[0]?.toUpperCase() ?? "W";
  const avatarUrl = p.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl
    : undefined;
  const address = (p.address ?? null) as {
    line1?: string;
    city?: string;
    state?: string;
    pincode?: string;
  } | null;
  const addressText = address
    ? [address.line1, address.city, address.state, address.pincode].filter(Boolean).join(", ")
    : "";

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/warden/profile/change-password">
                <KeyRound className="h-4 w-4" /> Change Password
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/warden/profile/edit">
                <UserRoundPen className="h-4 w-4" /> Edit Profile
              </Link>
            </Button>
          </div>
        }
      />

      <Card className="gap-3 py-4">
        <CardContent className="flex items-center gap-4 px-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={avatarUrl} alt={p.full_name} />
            <AvatarFallback className="text-lg">{initial}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-lg font-semibold text-foreground">{p.full_name}</p>
            <p className="text-sm text-muted-foreground">{primary?.employee_id ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">Contact & identity</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-3 gap-y-3 px-4 sm:grid-cols-2">
          <ReadOnlyField label="Employee ID" value={primary?.employee_id} />
          <ReadOnlyField label="Role" value="Warden" />
          <Field label="Mobile Number" value={p.phone} />
          <Field label="Email" value={p.email} />
          <ReadOnlyField
            label="Assigned Property"
            value={properties.join(", ") || "All properties"}
          />
          <ReadOnlyField label="Assigned Block(s)" value={blocks.join(", ") || "All blocks"} />
          <Field label="Emergency Contact Name" value={p.emergency_contact_name} />
          <Field label="Emergency Contact Number" value={p.emergency_contact_number} />
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">Additional details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-3 gap-y-3 px-4 sm:grid-cols-2">
          <Field label="Alternate Mobile Number" value={p.alternate_phone} />
          <Field label="Date of Birth" value={p.date_of_birth} />
          <Field label="Gender" value={p.gender} />
          <Field label="Blood Group" value={p.blood_group} />
          <Field label="Address" value={addressText} />
          <ReadOnlyField
            label="Joining Date"
            value={
              primary?.granted_at ? new Date(primary.granted_at).toLocaleDateString() : undefined
            }
          />
          <ReadOnlyField
            label="Account Status"
            value={
              <Badge variant={p.status === "ACTIVE" ? "default" : "secondary"}>{p.status}</Badge>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
