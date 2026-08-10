import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GuardianCard } from "@/components/students/GuardianCard";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/warden/students/$id")({
  head: () => ({ meta: [{ title: "Student — Hostylia" }] }),
  component: WardenStudentDetailPage,
});

function WardenStudentDetailPage() {
  const { id } = Route.useParams();

  const studentQ = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_number, phone")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (studentQ.isLoading || !studentQ.data) {
    return <Skeleton className="h-64 w-full" />;
  }
  const s = studentQ.data;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/warden/students">
          <ArrowLeft className="h-4 w-4" /> Back to students
        </Link>
      </Button>

      <PageHeader
        title={s.full_name}
        description={`Admission #${s.admission_number} • ${s.phone ?? "no phone"}`}
      />

      {/* Warden scope = VE on Guardian/Parent records (PRD 7); the /warden/students
          list is already restricted to the warden's assigned property, so any
          student reachable here is in-scope. The server function re-verifies
          this before writing, per PRD 7.1. */}
      <GuardianCard studentId={id} canEdit />
    </div>
  );
}
