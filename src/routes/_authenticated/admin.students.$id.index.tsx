import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Building2,
  Cake,
  DoorOpen,
  GraduationCap,
  Lock,
  Link2,
  Loader2,
  Mail,
  Notebook,
  ShieldCheck,
  UserRound,
  UserRoundCheck,
  Users,
} from "lucide-react";

import { DetailPageSkeleton } from "@/components/dashboard/DetailPageSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { StudentStatusBadge } from "@/components/students/StudentStatusBadge";
import { KycStatus } from "@/components/students/KycStatus";
import { AgreementViewer } from "@/components/students/AgreementViewer";
import { GuardianCard } from "@/components/students/GuardianCard";
import { StudentPermissionCard } from "@/components/students/StudentPermissionCard";
import { confirmStudentAdmission } from "@/lib/student.functions";
import { formatInr } from "@/lib/finance";
import { cn, toneClasses, type SemanticTone } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/students/$id/")({
  head: () => ({ meta: [{ title: "Student — Hostylia" }] }),
  component: StudentDetailPage,
});

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

/** Small icon-in-a-box used to lead every section's CardTitle. */
function SectionIcon({ icon: Icon, tone }: { icon: LucideIcon; tone: SemanticTone }) {
  return (
    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", toneClasses[tone])}>
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

function StudentDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const confirmAdmissionFn = useServerFn(confirmStudentAdmission);

  const studentQ = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const confirmAdmission = useMutation({
    mutationFn: () => confirmAdmissionFn({ data: { student_id: id } }),
    onSuccess: () => {
      toast.success("Account linked — the student can now sign in to their portal");
      qc.invalidateQueries({ queryKey: ["student", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not link the account"),
  });

  const allocQ = useQuery({
    queryKey: ["student-allocations", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allocations")
        .select(
          `id, status, start_date, expected_end_date, actual_end_date, bed_id,
          rent_snapshot_paise, deposit_snapshot_paise, fee_plan_id,
          bed:beds(code, room:rooms(room_number), floor:floors(name, floor_number), block:blocks(name))`,
        )
        .eq("student_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // allocations.fee_plan_id has no declared FK to fee_plans (PostgREST can't
  // embed it via `fee_plan:fee_plans(...)`), so it's resolved with a
  // separate lookup — same pattern generateFirstInvoiceForAllocation uses
  // server-side for the same column.
  const feePlanIds = [
    ...new Set((allocQ.data ?? []).map((a) => a.fee_plan_id).filter((v): v is string => !!v)),
  ];
  const feePlansQ = useQuery({
    queryKey: ["student-allocation-fee-plans", feePlanIds],
    enabled: feePlanIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_plans")
        .select("id, name, code")
        .in("id", feePlanIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const feePlanById = new Map((feePlansQ.data ?? []).map((p) => [p.id, p]));

  if (studentQ.isLoading || !studentQ.data) {
    return (
      <div className="max-w-6xl space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/students">
            <ArrowLeft className="h-4 w-4" /> Back to students
          </Link>
        </Button>
        <DetailPageSkeleton />
      </div>
    );
  }
  const s = studentQ.data;

  return (
    <div className="max-w-6xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/admin/students">
          <ArrowLeft className="h-4 w-4" /> Back to students
        </Link>
      </Button>

      <Card className="overflow-hidden rounded-2xl">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-center gap-4">
            <div
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary/15 text-lg font-semibold text-primary ring-1 ring-primary/20"
              aria-hidden="true"
            >
              {initialsOf(s.full_name)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-display text-xl font-semibold text-foreground sm:text-2xl">
                  {s.full_name}
                </h1>
                <StudentStatusBadge status={s.status} />
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                Admission #{s.admission_number} • {s.phone ?? "no phone"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!s.profile_id && s.status !== "ACTIVE" && (
              <Button
                variant="outline"
                disabled={confirmAdmission.isPending}
                onClick={() => confirmAdmission.mutate()}
              >
                {confirmAdmission.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                Confirm & link account
              </Button>
            )}
            {(s.status === "ACTIVE" || s.status === "NOTICE_GIVEN") && (
              <Button asChild variant="outline">
                <Link to="/admin/students/$id/move-out" params={{ id }}>
                  <DoorOpen className="h-4 w-4" /> Move out
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden rounded-2xl self-start">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <SectionIcon icon={UserRound} tone="primary" />
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-x-4 gap-y-5 text-sm sm:grid-cols-2">
            <Info icon={Mail} label="Email" value={s.email ?? "—"} />
            <Info icon={GraduationCap} label="Institute" value={s.academic_institute ?? "—"} />
            <Info icon={Cake} label="Date of birth" value={s.date_of_birth ?? "—"} />
            <Info icon={Notebook} label="Course" value={s.course_name ?? "—"} />
            <Info icon={UserRound} label="Gender" value={s.gender ?? "—"} />
            <Info icon={Users} label="Minor" value={s.is_minor ? "Yes" : "No"} />
            <Info
              icon={Lock}
              label="Portal access"
              value={s.profile_id ? "Linked" : "Not linked yet"}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <GuardianCard studentId={id} canEdit />

          <Card className="overflow-hidden rounded-2xl">
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <SectionIcon icon={Building2} tone="info" />
              <CardTitle>Allocation history</CardTitle>
            </CardHeader>
            <CardContent>
              {allocQ.isError ? (
                <p className="text-sm text-destructive">
                  Couldn't load allocations:{" "}
                  {allocQ.error instanceof Error ? allocQ.error.message : "unknown error"}
                </p>
              ) : (allocQ.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No allocations yet. Assign a bed from Allocations.
                </p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {(allocQ.data ?? []).map((a) => {
                    const bed = a.bed as {
                      code: string;
                      room: { room_number: string } | null;
                      floor: { name: string; floor_number: number | null } | null;
                      block: { name: string } | null;
                    } | null;
                    const feePlan = a.fee_plan_id ? (feePlanById.get(a.fee_plan_id) ?? null) : null;
                    return (
                      <li
                        key={a.id}
                        className="space-y-2 rounded-xl border border-border bg-muted/20 p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">
                            {a.start_date} → {a.actual_end_date ?? a.expected_end_date ?? "open"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {bed
                            ? [
                                bed.block?.name && `Block ${bed.block.name}`,
                                bed.floor?.name ??
                                  (bed.floor?.floor_number != null
                                    ? `Floor ${bed.floor.floor_number}`
                                    : null),
                                bed.room?.room_number && `Room ${bed.room.room_number}`,
                                `Bed ${bed.code}`,
                              ]
                                .filter(Boolean)
                                .join(" • ")
                            : "Bed details unavailable"}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/80 pt-2 text-xs text-muted-foreground">
                          <span>
                            Fee plan:{" "}
                            <span className="font-medium text-foreground">
                              {feePlan
                                ? `${feePlan.name} (${feePlan.code})`
                                : "No fee plan assigned"}
                            </span>
                          </span>
                          <span>
                            Rent:{" "}
                            <span className="font-medium text-foreground">
                              {formatInr(a.rent_snapshot_paise)}
                            </span>
                          </span>
                          <span>
                            Deposit:{" "}
                            <span className="font-medium text-foreground">
                              {formatInr(a.deposit_snapshot_paise)}
                            </span>
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl">
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <SectionIcon icon={ShieldCheck} tone="success" />
              <CardTitle>KYC documents</CardTitle>
            </CardHeader>
            <CardContent>
              <KycStatus studentId={s.id} />
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl">
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <SectionIcon icon={UserRoundCheck} tone="primary" />
              <CardTitle>Boarding agreement</CardTitle>
            </CardHeader>
            <CardContent>
              <AgreementViewer studentId={s.id} readOnly />
            </CardContent>
          </Card>

          <StudentPermissionCard tenantId={s.tenant_id} studentId={s.id} />
        </div>
      </div>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-info/10 text-info">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
