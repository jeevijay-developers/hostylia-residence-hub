import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  ChevronRight,
  Ticket,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { KycGateNotice } from "@/components/students/KycGateNotice";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useKycComplete } from "@/lib/kyc";
import { useStudentSelf } from "@/lib/complaint";
import { useResolvedRole } from "@/lib/user-role";
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

  const bed = allocQ.data?.bed as
    { code: string; room: { room_number: string } | null } | null | undefined;
  const firstName = profileQ.data?.full_name?.trim().split(" ")[0];
  const greeting = getGreeting(new Date().getHours());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
          {greeting}{firstName ? `, ${firstName}` : ""} 👋
        </h1>
        {bed && (
          <p className="mt-1 text-sm text-muted-foreground">
            {bed.room?.room_number && `Room ${bed.room.room_number} • `}Bed {bed.code}
          </p>
        )}
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
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AttendanceSection studentId={studentId} />
            <FeesSection studentId={studentId} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <GatePassSection studentId={studentId} />
            <MessSection propertyId={propertyId} />
          </div>
        </div>
      )}
    </div>
  );
}

function HomeSectionCard({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        {children}
        {action}
      </CardContent>
    </Card>
  );
}

// Shares the "parent-attendance" query key/shape with AttendanceHistoryList
// (used on /student/attendance) so both views agree and reuse one cache entry.
function AttendanceSection({ studentId }: { studentId: string }) {
  const q = useQuery({
    queryKey: ["parent-attendance", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance")
        .select("*")
        .eq("student_id", studentId)
        .order("attendance_date", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  const rows = q.data ?? [];
  const present = rows.filter((r) => r.status === "PRESENT").length;
  const absent = rows.filter((r) => r.status === "ABSENT").length;
  const marked = present + absent;
  const pct = marked > 0 ? Math.round((present / marked) * 100) : 0;

  return (
    <HomeSectionCard
      icon={CalendarCheck}
      title="Attendance"
      action={
        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link to="/student/attendance">
            View Attendance <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      }
    >
      {q.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : marked === 0 ? (
        <p className="text-xs text-muted-foreground">No attendance recorded yet.</p>
      ) : (
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-semibold tracking-tight">{pct}%</span>
          <span className="text-xs text-muted-foreground">
            {present} present · {absent} absent
          </span>
        </div>
      )}
    </HomeSectionCard>
  );
}

// Same select shape/key as StudentFeesList so this stays consistent with
// /student/fees and shares its cache entry.
function FeesSection({ studentId }: { studentId: string }) {
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
  const nextDue = outstanding
    .slice()
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];

  return (
    <HomeSectionCard
      icon={Wallet}
      title="Fees"
      action={
        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link to="/student/fees">
            View Fees <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      }
    >
      {q.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : totalOutstanding === 0 ? (
        <p className="text-sm text-success">No outstanding dues.</p>
      ) : (
        <div>
          <span className="text-2xl font-semibold tracking-tight">
            {formatInr(totalOutstanding)}
          </span>
          {nextDue && (
            <p className="text-xs text-muted-foreground">
              Due {new Date(nextDue.due_date).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </HomeSectionCard>
  );
}

const GATE_PASS_PENDING = ["PENDING_WARDEN", "PENDING_PARENT"];
const GATE_PASS_OPEN = ["APPROVED", "ACTIVE"];

// Same select shape/key as /student/gate-pass so this shares its cache entry.
function GatePassSection({ studentId }: { studentId: string }) {
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
  const isOpen = status ? GATE_PASS_OPEN.includes(status) : false;

  return (
    <HomeSectionCard
      icon={Ticket}
      title="Gate Pass"
      action={
        isPending ? (
          <Button variant="outline" size="sm" className="w-full" disabled>
            Pending
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="w-full" asChild>
            <Link to="/student/gate-pass">
              {isOpen ? "View QR" : "Request Pass"} <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        )
      }
    >
      {q.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : status ? (
        <Badge variant="secondary">{isPending ? "Pending" : status}</Badge>
      ) : (
        <p className="text-xs text-muted-foreground">No gate pass yet.</p>
      )}
    </HomeSectionCard>
  );
}

// Same select shape/key as /student/mess so this shares its cache entry.
function MessSection({ propertyId }: { propertyId: string | null }) {
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
    <HomeSectionCard
      icon={Utensils}
      title="Today's Mess"
      action={
        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link to="/student/mess">
            View Menu <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      }
    >
      {q.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : menus.length === 0 ? (
        <p className="text-xs text-muted-foreground">No menu published for today.</p>
      ) : (
        <div className="space-y-1">
          {menus.map((m) => (
            <div key={m.id} className="text-xs">
              <span className="font-medium text-foreground">{m.meal}</span>
              {m.title ? ` — ${m.title}` : ""}
              {(m.mess_menu_items ?? []).length > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  ·{" "}
                  {(m.mess_menu_items ?? [])
                    .map((i: { item_name: string }) => i.item_name)
                    .slice(0, 3)
                    .join(", ")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </HomeSectionCard>
  );
}
