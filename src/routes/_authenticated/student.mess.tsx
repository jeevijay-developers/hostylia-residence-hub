import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Clock, Loader2, MessageSquare, RotateCcw, Send, Soup, Star, Sunrise, UtensilsCrossed, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatServeTime, localDateInTimezone, usePropertyTimezone } from "@/lib/ops";
import { useResolvedRole } from "@/lib/user-role";
import { useStudentPermissions } from "@/lib/staff-scope";
import { StudentModuleGuard } from "@/components/dashboard/RoleGuard";
import { useKycComplete } from "@/lib/kyc";
import { KycGateNotice } from "@/components/students/KycGateNotice";

export const Route = createFileRoute("/_authenticated/student/mess")({
  component: StudentMessPage,
});

function StudentMessPage() {
  const role = useResolvedRole();
  const uid = role.data?.userId ?? null;
  const qc = useQueryClient();

  const studentQ = useQuery({
    queryKey: ["me-student-mess", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id, tenant_id, property_id").eq("profile_id", uid!).maybeSingle();
      return data;
    },
  });

  const tzQ = usePropertyTimezone(studentQ.data?.property_id ?? null);
  const today = localDateInTimezone(tzQ.data);
  const menusQ = useQuery({
    queryKey: ["student-mess-menus", studentQ.data?.property_id, today],
    enabled: !!studentQ.data?.property_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("mess_menus")
        .select("*, mess_menu_items(*)")
        .eq("property_id", studentQ.data!.property_id)
        .eq("menu_date", today).eq("status", "PUBLISHED").order("meal");
      if (error) throw error;
      return data ?? [];
    },
  });

  const feedbackQ = useQuery({
    queryKey: ["my-mess-feedback", studentQ.data?.id],
    enabled: !!studentQ.data?.id,
    queryFn: async () => {
      const { data } = await supabase.from("mess_feedback").select("mess_menu_id, rating").eq("student_id", studentQ.data!.id);
      return data ?? [];
    },
  });
  const submittedMap = new Map((feedbackQ.data ?? []).map((f) => [f.mess_menu_id, f.rating]));
  const { complete: kycComplete } = useKycComplete(studentQ.data?.id);
  const { can } = useStudentPermissions();
  const canWrite = can("mess", "edit");

  const loading = studentQ.isLoading || menusQ.isLoading;
  const errored = !loading && menusQ.isError;
  const empty = !loading && !errored && (menusQ.data?.length ?? 0) === 0;

  return (
    <StudentModuleGuard module="mess">
      <div className="space-y-4">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Loading today&apos;s menu…
          </div>
        )}
        {errored && (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Unable to load today&apos;s menu. Please try again.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => menusQ.refetch()}>
              <RotateCcw className="h-4 w-4" /> Retry
            </Button>
          </div>
        )}
        {!loading && !errored && (menusQ.data ?? []).map((m) => (
          <MenuCard key={m.id} menu={m} submittedRating={submittedMap.get(m.id)} student={studentQ.data} kycComplete={kycComplete} canWrite={canWrite} onSubmitted={() => { qc.invalidateQueries({ queryKey: ["my-mess-feedback"] }); }} />
        ))}
        {empty && <div className="text-sm text-muted-foreground text-center p-6">No menu published for today.</div>}
      </div>
    </StudentModuleGuard>
  );
}

const MEAL_STYLE: Record<string, { icon: LucideIcon; iconBg: string; iconText: string }> = {
  BREAKFAST: { icon: Sunrise, iconBg: "bg-warning/15", iconText: "text-warning" },
  LUNCH: { icon: UtensilsCrossed, iconBg: "bg-success/15", iconText: "text-success" },
  DINNER: { icon: UtensilsCrossed, iconBg: "bg-success/15", iconText: "text-success" },
  SNACKS: { icon: Soup, iconBg: "bg-primary/15", iconText: "text-primary" },
};
const DEFAULT_MEAL_STYLE = { icon: UtensilsCrossed, iconBg: "bg-muted", iconText: "text-muted-foreground" };

function MenuCard({ menu, submittedRating, student, kycComplete, canWrite, onSubmitted }: { menu: { id: string; meal: string; title: string | null; serve_time: string | null; mess_menu_items?: Array<{ item_name: string }> }; submittedRating: number | undefined; student: { id: string; tenant_id: string; property_id: string } | null | undefined; kycComplete: boolean; canWrite: boolean; onSubmitted: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const submitMut = useMutation({
    mutationFn: async () => {
      if (!student) throw new Error("Student profile missing");
      const { error } = await supabase.from("mess_feedback").insert({
        tenant_id: student.tenant_id, property_id: student.property_id,
        mess_menu_id: menu.id, student_id: student.id, rating, comment,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Thanks!"); onSubmitted(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const style = MEAL_STYLE[menu.meal] ?? DEFAULT_MEAL_STYLE;
  const MealIcon = style.icon;
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${style.iconBg} ${style.iconText}`}>
            <MealIcon className="h-5 w-5" />
          </span>
          <div>
            <div className="font-semibold uppercase tracking-wide text-foreground">
              {menu.meal} {menu.title ? `— ${menu.title}` : ""}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <Clock className="h-3 w-3" /> {formatServeTime(menu.serve_time)}
            </div>
            <div className="text-xs uppercase text-muted-foreground">{(menu.mess_menu_items ?? []).map((i) => i.item_name).join(" ")}</div>
          </div>
        </div>
        {submittedRating && <Badge variant="secondary">⭐ {submittedRating}</Badge>}
      </div>
      {!submittedRating && canWrite && (
        <div className="space-y-3 border-t border-border pt-3">
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Rate your meal</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className="p-0.5"
                  aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
                >
                  <Star
                    className={`h-6 w-6 ${n <= rating ? "fill-warning text-warning" : "text-muted-foreground"}`}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <MessageSquare className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Textarea
              placeholder="Comment (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="pl-9"
            />
          </div>
          {!kycComplete && <KycGateNotice message="Complete your KYC to submit mess feedback." />}
          <Button
            size="sm"
            className="rounded-full"
            onClick={() => submitMut.mutate()}
            disabled={!kycComplete || submitMut.isPending}
          >
            <Send className="h-4 w-4" /> Submit
          </Button>
        </div>
      )}
    </CardContent></Card>
  );
}
