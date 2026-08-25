import { createFileRoute, Link } from "@tanstack/react-router";
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

export const Route = createFileRoute("/_authenticated/admin/profile")({
  head: () => ({ meta: [{ title: "My Profile — Hostylia" }] }),
  component: AdminProfilePage,
});

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
    <div className="space-y-1 rounded-xl border border-border/60 bg-muted/30 p-3">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" /> {label}
      </p>
      <p className="text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

function AdminProfilePage() {
  const { data: resolved } = useResolvedRole();
  const userId = resolved?.userId ?? null;

  const profileQ = useQuery({
    queryKey: ["admin-profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, email, avatar_path")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const assignmentQ = useQuery({
    queryKey: ["admin-assignment", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_assignments")
        .select("property_id, is_active, properties(name)")
        .eq("user_id", userId!)
        .eq("role", "HOSTEL_ADMIN")
        .eq("is_active", true)
        .order("granted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (profileQ.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;

  if (!profileQ.data) {
    return (
      <div className="space-y-6">
        <p className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-sm text-muted-foreground">
          Could not load your profile.
        </p>
      </div>
    );
  }

  const p = profileQ.data;
  const propertyName =
    (assignmentQ.data?.properties as { name: string } | null)?.name ?? "All properties";
  const initial = p.full_name.trim()[0]?.toUpperCase() ?? "A";
  const avatarUrl = p.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl
    : undefined;
  const isActive = assignmentQ.data?.is_active ?? true;

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/profile/change-password">
                <KeyRound className="h-4 w-4" /> Change Password
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/admin/profile/edit">
                <UserRoundPen className="h-4 w-4" /> Edit Profile
              </Link>
            </Button>
          </div>
        }
      />

      <Card className="gap-3 py-4">
        <CardContent className="flex items-center gap-4 px-4">
          <Avatar className="h-16 w-16 ring-2 ring-neutral-accent/20 ring-offset-2 ring-offset-card">
            <AvatarImage src={avatarUrl} alt={p.full_name} />
            <AvatarFallback className="bg-neutral-accent/15 text-lg text-neutral-accent">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-lg font-semibold text-foreground">{p.full_name}</p>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              Hostel Admin
              {isActive ? (
                <Badge
                  variant="outline"
                  className="inline-flex items-center gap-1.5 rounded-full border-emerald-500/30 bg-emerald-500/10 px-2 py-0 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                  Active
                </Badge>
              ) : null}
            </p>
            <p className="text-sm text-muted-foreground">{propertyName}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">Account details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-3 gap-y-3 px-4 sm:grid-cols-2">
          <Field label="Phone" value={p.phone} />
          <ReadOnlyField label="Email" value={p.email} />
          <ReadOnlyField label="Role" value="Hostel Admin" />
          <ReadOnlyField label="Assigned Property" value={propertyName} />
        </CardContent>
      </Card>
    </div>
  );
}
