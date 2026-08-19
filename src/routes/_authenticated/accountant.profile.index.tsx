import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Lock, UserRoundPen } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";

export const Route = createFileRoute("/_authenticated/accountant/profile/")({
  head: () => ({ meta: [{ title: "My Profile — Hostylia" }] }),
  component: AccountantProfilePage,
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
    <div className="space-y-1 rounded-md bg-muted/50 p-2">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" /> {label}
      </p>
      <p className="text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

function AccountantProfilePage() {
  const { data: resolved } = useResolvedRole();
  const userId = resolved?.userId ?? null;

  const profileQ = useQuery({
    queryKey: ["accountant-profile", userId],
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
    queryKey: ["accountant-assignment", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_assignments")
        .select("property_id, properties(name)")
        .eq("user_id", userId!)
        .eq("role", "ACCOUNTANT")
        .eq("is_active", true)
        .order("granted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (profileQ.isLoading) return <Skeleton className="h-96 w-full" />;

  if (!profileQ.data) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">Could not load your profile.</p>
      </div>
    );
  }

  const p = profileQ.data;
  const propertyName = (assignmentQ.data?.properties as { name: string } | null)?.name;
  const initial = p.full_name.trim()[0]?.toUpperCase() ?? "A";
  const avatarUrl = p.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl
    : undefined;

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/accountant/profile/change-password">
                <KeyRound className="h-4 w-4" /> Change Password
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/accountant/profile/edit">
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
            <p className="text-sm text-muted-foreground">Accountant</p>
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
          <ReadOnlyField label="Role" value="Accountant" />
          <ReadOnlyField label="Assigned Property" value={propertyName ?? "All properties"} />
        </CardContent>
      </Card>
    </div>
  );
}
