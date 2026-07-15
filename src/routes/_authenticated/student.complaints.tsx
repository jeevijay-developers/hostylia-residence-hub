import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ComplaintForm } from "@/components/complaints/ComplaintForm";
import { ComplaintCard } from "@/components/complaints/ComplaintCard";
import { RatingWidget } from "@/components/complaints/RatingWidget";
import { useComplaints, useStudentSelf } from "@/lib/complaint";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/student/complaints")({
  component: StudentComplaintsPage,
});

function StudentComplaintsPage() {
  const student = useStudentSelf();
  const complaints = useComplaints({
    propertyId: student.data?.property_id,
    studentId: student.data?.id,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Complaints" description="Report an issue and track it here." />
      <Card>
        <CardHeader><CardTitle>New complaint</CardTitle></CardHeader>
        <CardContent><ComplaintForm /></CardContent>
      </Card>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Your complaints</h2>
        {complaints.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {(complaints.data ?? []).map((c) => (
          <div key={c.id} className="space-y-2">
            <ComplaintCard complaint={c} />
            <RatingWidget complaint={c} />
          </div>
        ))}
        {complaints.data && complaints.data.length === 0 && (
          <p className="text-sm text-muted-foreground">No complaints yet.</p>
        )}
      </div>
    </div>
  );
}
