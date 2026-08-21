import type { ReactNode } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Lock, Mail, Phone, ShieldCheck, UserRoundPen, Users, type LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WaveMark } from "@/components/parent/WaveMark";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { cn } from "@/lib/utils";
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

function ProfileField({
  icon: Icon,
  label,
  value,
  locked,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  locked?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-3.5">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-info/10 text-info">
        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {label}
          {locked && <Lock className="h-3 w-3" aria-hidden="true" />}
        </p>
        <div className="mt-0.5 text-sm font-semibold text-foreground">{value || "—"}</div>
      </div>
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
    <div className="flex h-full flex-col gap-6">
      <PageHeader
        title="My Profile"
        description="Your personal details"
        actions={
          <Button asChild className="rounded-full">
            <Link to="/parent/profile/edit">
              <UserRoundPen className="h-4 w-4" /> Edit Profile
            </Link>
          </Button>
        }
      />

      <Card className="relative overflow-hidden rounded-2xl border-info/20 bg-gradient-to-br from-info/5 via-card to-card shadow-card-ambient">
        <WaveMark className="pointer-events-none absolute -bottom-4 -right-4 h-28 w-40 text-info/10" />
        <CardContent className="relative flex items-center gap-4 p-5">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-primary/15 text-2xl font-semibold text-primary shadow-tone-glow ring-1 ring-primary/20">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-semibold text-foreground">
              {g.full_name}
            </p>
            <p className="text-sm text-muted-foreground">Parent / Guardian</p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="font-display text-lg">Contact &amp; identity</CardTitle>
          <span aria-hidden="true" className="mt-1 block h-1 w-10 rounded-full bg-primary" />
        </CardHeader>
        <CardContent className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2")}>
          <ProfileField
            icon={Phone}
            label="Mobile Number"
            value={g.phone ? displayIndianPhone(g.phone) : undefined}
            locked
          />
          <ProfileField icon={Mail} label="Email" value={g.email} />
          <ProfileField icon={Users} label="Relation" value={relationText} locked />
          <ProfileField
            icon={ShieldCheck}
            label="Portal Access"
            locked
            value={
              <Badge
                variant={g.portal_access_enabled ? "default" : "secondary"}
                className="rounded-full"
              >
                {g.portal_access_enabled ? "Enabled" : "Disabled"}
              </Badge>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
