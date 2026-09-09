import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bed, Bell, ChevronRight, DoorOpen, IndianRupee, Utensils, type LucideIcon } from "lucide-react";

import { KycGateNotice } from "@/components/students/KycGateNotice";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { fetchOwnProfile } from "@/components/dashboard/EditProfileDialog";
import { useTenantNotices } from "@/lib/notifications";
import { useKycComplete } from "@/lib/kyc";
import { useStudentSelf } from "@/lib/complaint";
import { useResolvedRole } from "@/lib/user-role";
import { useStudentPermissions } from "@/lib/staff-scope";
import { formatInr } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/student/home")({
  component: StudentHomePage,
});

// Same statuses/select shape as student.profile.tsx's "my-current-allocation"
// query — shares its cache entry instead of inventing a new data shape.
const OPEN_ALLOCATION_STATUSES = [
  "ACTIVE",
  "NOTICE_GIVEN",
  "MOVE_OUT_INSPECTION",
  "PENDING_AGREEMENT",
  "PENDING_PAYMENT",
];

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good Morning";
  if (hour >= 12 && hour < 17) return "Good Afternoon";
  if (hour >= 17 && hour < 21) return "Good Evening";
  return "Good Night";
}

function StudentHomePage() {
  const role = useResolvedRole();
  const userId = role.data?.userId ?? null;
  const student = useStudentSelf();
  const studentId = student.data?.id ?? null;
  const propertyId = student.data?.property_id ?? null;
  const { complete: kycComplete, isLoading: kycLoading } = useKycComplete(studentId);
  const { can } = useStudentPermissions();

  // Same key/select as student.profile.tsx's "my-profile-record" query.
  const profileQ = useQuery({
    queryKey: ["my-profile-record", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, tenant_id, property_id, admission_number, status, full_name, phone, email, date_of_birth, gender, academic_institute, course_name, academic_year",
        )
        .eq("profile_id", userId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const allocQ = useQuery({
    queryKey: ["my-current-allocation", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allocations")
        .select(
          "id, status, bed:beds(code, room:rooms(room_number), floor:floors(name, floor_number), block:blocks(name))",
        )
        .eq("student_id", studentId!)
        .in("status", OPEN_ALLOCATION_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Same query the Topbar already uses for every role's avatar.
  const ownProfileQ = useQuery({
    queryKey: ["own-profile"],
    queryFn: fetchOwnProfile,
    enabled: !!userId,
  });
  const avatarUrl = ownProfileQ.data?.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(ownProfileQ.data.avatar_path).data.publicUrl
    : undefined;

  const noticesQ = useTenantNotices(student.data?.tenant_id, propertyId);
  const notices = (noticesQ.data ?? []).filter(
    (n) => n.audience_type === "ALL" || n.audience_type === "STUDENTS",
  );

  const bed = allocQ.data?.bed as
    { code: string; room: { room_number: string } | null } | null | undefined;
  const firstName = profileQ.data?.full_name?.trim().split(" ")[0];
  const greeting = getGreeting(new Date().getHours());

  const roomBedLabel =
    bed?.room?.room_number && bed?.code ? `${bed.room.room_number} · Bed ${bed.code}` : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Today</p>
          <h1 className="font-display text-2xl font-bold leading-tight text-foreground sm:text-3xl">
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          {roomBedLabel && <p className="mt-1 text-sm text-muted-foreground">{roomBedLabel}</p>}
        </div>
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            (firstName?.[0] ?? "?").toUpperCase()
          )}
        </span>
      </div>

      {!kycLoading && !kycComplete && (
        <KycGateNotice message="Complete your KYC to unlock fees, gate pass, mess and complaints." />
      )}

      {student.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!student.isLoading && !studentId && (
        <p className="text-sm text-muted-foreground">
          No student record is linked to your account yet.
        </p>
      )}

      {studentId && (
        <div className="grid grid-cols-2 gap-3">
          {bed && (
            <HomeStatCard
              icon={Bed}
              label="Room / Bed"
              value={`${bed.room?.room_number ?? "—"} / ${bed.code}`}
              caption="Your allocation"
            />
          )}
          {can("finance", "view") && <FeesCard studentId={studentId} />}
          {can("gate_passes", "view") && <GatePassCard studentId={studentId} />}
          {can("mess", "view") && <MessCard propertyId={propertyId} />}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-foreground">Notice board</h2>
          <Link to="/student/notices" className="text-sm font-medium text-primary">
            See all
          </Link>
        </div>
        <div className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card">
          {noticesQ.isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : notices.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No notices posted yet.</p>
          ) : (
            notices.slice(0, 4).map((n) => (
              <Link
                key={n.id}
                to="/student/notices"
                className="flex items-center gap-3 p-4 first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/40"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-warning">
                  <Bell className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {n.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{n.body}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function HomeStatCard({
  icon: Icon,
  label,
  value,
  caption,
  to,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  caption: string;
  to?: string;
}) {
  const content = (
    <>
      <Icon className="h-6 w-6 text-warning" />
      <span className="mt-3 block text-xs text-muted-foreground">{label}</span>
      <span className="mt-0.5 block truncate text-xl font-bold text-foreground">{value}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{caption}</span>
    </>
  );
  const className = "block rounded-2xl border border-border bg-card p-4";
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

// Same select shape/key as StudentFeesList so this stays consistent with
// /student/fees and shares its cache entry.
function FeesCard({ studentId }: { studentId: string }) {
  const q = useQuery({
    queryKey: ["student-invoices", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, due_date, status, total_paise, balance_paise")
        .eq("student_id", studentId)
        .is("deleted_at", null)
        .order("issue_date", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const outstanding = (q.data ?? []).filter((i) => i.balance_paise > 0 && i.status !== "VOID");
  const totalOutstanding = outstanding.reduce((sum, i) => sum + i.balance_paise, 0);

  return (
    <HomeStatCard
      icon={IndianRupee}
      label="Fees due"
      value={q.isLoading ? "…" : formatInr(totalOutstanding)}
      caption={totalOutstanding === 0 ? "No dues" : "Outstanding"}
      to="/student/fees"
    />
  );
}

const GATE_PASS_PENDING = ["PENDING_WARDEN", "PENDING_PARENT"];

// Same select shape/key as /student/gate-pass so this shares its cache entry.
function GatePassCard({ studentId }: { studentId: string }) {
  const q = useQuery({
    queryKey: ["my-passes", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("gate_passes")
        .select("*")
        .eq("student_id", studentId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const current = (q.data ?? [])[0] ?? null;
  const status = current?.status ?? null;
  const isPending = status ? GATE_PASS_PENDING.includes(status) : false;

  return (
    <HomeStatCard
      icon={DoorOpen}
      label="Gate pass"
      value={q.isLoading ? "…" : status ? (isPending ? "PENDING" : status) : "—"}
      caption="Latest status"
      to="/student/gate-pass"
    />
  );
}

// Same select shape/key as /student/mess so this shares its cache entry.
function MessCard({ propertyId }: { propertyId: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const q = useQuery({
    queryKey: ["student-mess-menus", propertyId, today],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("mess_menus")
        .select("*, mess_menu_items(*)")
        .eq("property_id", propertyId!)
        .eq("menu_date", today)
        .eq("status", "PUBLISHED")
        .order("meal");
      return data ?? [];
    },
  });

  const menus = q.data ?? [];

  return (
    <HomeStatCard
      icon={Utensils}
      label="Today's mess"
      value={q.isLoading ? "…" : `${menus.length} meal${menus.length === 1 ? "" : "s"}`}
      caption={menus.length === 0 ? "No menu published" : "Meals published"}
      to="/student/mess"
    />
  );
}
