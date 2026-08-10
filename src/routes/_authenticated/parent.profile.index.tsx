import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Lock, UserRoundPen } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { displayIndianPhone } from "@/schemas/auth";

export const Route = createFileRoute("/_authenticated/parent/profile/")({
  head: () => ({ meta: [{ title: "My Profile — Hostylia" }] }),
  component: ParentProfilePage,
});

function useOwnGuardian(userId: string | null) {
  const guardianQ = useQuery({
    queryKey: ["own-guardian", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guardians")
        .select("*")
        .eq("profile_id", userId!)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // PRD 5.2: Guardian/Parent key fields include "relation" — relationship is
  // recorded per student_guardians link (a guardian can be linked to more
  // than one child, potentially with different relationships), not on the
  // guardians row itself.
  const relationsQ = useQuery({
    queryKey: ["own-guardian-relations", guardianQ.data?.id],
    enabled: !!guardianQ.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_guardians")
        .select("relationship, students(full_name)")
        .eq("guardian_id", guardianQ.data!.id)
        .is("unlinked_at", null);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        relationship: string | null;
        students: { full_name: string } | null;
      }>;
    },
  });

  return { guardianQ, relationsQ };
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

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

function ParentProfilePage() {
  const { data: resolved } = useResolvedRole();
  const userId = resolved?.userId ?? null;
  const { guardianQ, relationsQ } = useOwnGuardian(userId);

  if (guardianQ.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!guardianQ.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Profile" />
        <p className="text-sm text-muted-foreground">Could not load your profile.</p>
      </div>
    );
  }

  const g = guardianQ.data;
  const initial = g.full_name.trim()[0]?.toUpperCase() ?? "P";
  const relationText = (relationsQ.data ?? [])
    .map((r) => {
      const rel = r.relationship ?? "Guardian";
      const child = r.students?.full_name;
      return child ? `${rel} of ${child}` : rel;
    })
    .join(", ");

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title="My Profile"
        description="Your personal details"
        actions={
          <Button size="sm" asChild>
            <Link to="/parent/profile/edit">
              <UserRoundPen className="h-4 w-4" /> Edit Profile
            </Link>
          </Button>
        }
      />

      <Card className="gap-3 py-4">
        <CardContent className="flex items-center gap-4 px-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg">{initial}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-lg font-semibold text-foreground">{g.full_name}</p>
            <p className="text-sm text-muted-foreground">Parent / Guardian</p>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">Contact & identity</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-3 gap-y-3 px-4 sm:grid-cols-2">
          <ReadOnlyField
            label="Mobile Number"
            value={g.phone ? displayIndianPhone(g.phone) : undefined}
          />
          <Field label="Email" value={g.email} />
          <ReadOnlyField label="Relation" value={relationText} />
          <ReadOnlyField
            label="Portal Access"
            value={
              <Badge variant={g.portal_access_enabled ? "default" : "secondary"}>
                {g.portal_access_enabled ? "Enabled" : "Disabled"}
              </Badge>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
