import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { displayIndianPhone } from "@/schemas/auth";
import { GuardianPhoneEditDialog } from "@/components/students/GuardianPhoneEditDialog";
import { toneClasses } from "@/lib/utils";

export interface GuardianAddress {
  line1?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface StudentGuardianRow {
  guardian_id: string;
  relationship: string | null;
  is_primary: boolean;
  guardian: {
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    occupation: string | null;
    address: GuardianAddress | null;
  } | null;
}

export async function fetchStudentGuardians(studentId: string): Promise<StudentGuardianRow[]> {
  const { data, error } = await supabase
    .from("student_guardians")
    .select(
      "guardian_id, relationship, is_primary, guardian:guardians(id, full_name, phone, email, occupation, address)",
    )
    .eq("student_id", studentId)
    .is("unlinked_at", null)
    .order("is_primary", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as StudentGuardianRow[];
}

interface GuardianCardProps {
  studentId: string;
  /** Hostel Admin = VCED, Warden = VE (assigned property/block only) per PRD 7. */
  canEdit: boolean;
}

export function GuardianCard({ studentId, canEdit }: GuardianCardProps) {
  const [editing, setEditing] = useState<StudentGuardianRow | null>(null);

  const guardiansQ = useQuery({
    queryKey: ["student-guardians", studentId],
    queryFn: () => fetchStudentGuardians(studentId),
  });

  return (
    <Card className="overflow-hidden rounded-2xl">
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${toneClasses.primary}`}
        >
          <Users className="h-4 w-4" aria-hidden="true" />
        </span>
        <CardTitle>Guardian / Parent</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {guardiansQ.isLoading && <Skeleton className="h-12 w-full" />}
        {!guardiansQ.isLoading && guardiansQ.isError && (
          <p className="text-sm text-destructive">Couldn't load guardian details.</p>
        )}
        {!guardiansQ.isLoading && !guardiansQ.isError && (guardiansQ.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No guardian linked yet.</p>
        )}
        {(guardiansQ.data ?? []).map((row) => (
          <div
            key={row.guardian_id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3.5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-foreground">
                  {row.guardian?.full_name ?? "—"}
                </p>
                {row.is_primary && (
                  <Badge variant="outline" className="rounded-full">
                    Primary
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                {row.relationship ?? "Guardian"} ·{" "}
                {row.guardian?.phone ? displayIndianPhone(row.guardian.phone) : "no phone"}
              </p>
            </div>
            {canEdit && row.guardian && (
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0 rounded-full"
                title="Edit phone"
                aria-label="Edit phone"
                onClick={() => setEditing(row)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </CardContent>

      {editing && editing.guardian && (
        <GuardianPhoneEditDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          studentId={studentId}
          guardian={editing.guardian}
        />
      )}
    </Card>
  );
}
