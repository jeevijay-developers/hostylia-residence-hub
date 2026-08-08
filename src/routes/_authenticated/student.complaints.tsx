import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ComplaintForm } from "@/components/complaints/ComplaintForm";
import { ComplaintCard } from "@/components/complaints/ComplaintCard";
import { ComplaintCommentThread } from "@/components/complaints/ComplaintCommentThread";
import { RatingWidget } from "@/components/complaints/RatingWidget";
import { useComplaints, useStudentSelf, type ComplaintWithRelations } from "@/lib/complaint";
import { useResolvedRole } from "@/lib/user-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/student/complaints")({
  component: StudentComplaintsPage,
});

function StudentComplaintsPage() {
  const role = useResolvedRole();
  const student = useStudentSelf();
  const complaints = useComplaints({
    propertyId: student.data?.property_id,
    studentId: student.data?.id,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Complaints" description="Report an issue and track it here." />
      <Card>
        <CardHeader>
          <CardTitle>New complaint</CardTitle>
        </CardHeader>
        <CardContent>
          <ComplaintForm />
        </CardContent>
      </Card>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Your complaints</h2>
        {complaints.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {(complaints.data ?? []).map((c) => (
          <div key={c.id} className="space-y-2">
            <ComplaintCard complaint={c} />
            <RatingWidget complaint={c} />
            <ComplaintConversation complaint={c} userId={role.data?.userId ?? null} />
          </div>
        ))}
        {complaints.data && complaints.data.length === 0 && (
          <p className="text-sm text-muted-foreground">No complaints yet.</p>
        )}
      </div>
    </div>
  );
}

function ComplaintConversation({
  complaint,
  userId,
}: {
  complaint: ComplaintWithRelations;
  userId: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => setOpen((v) => !v)}
      >
        <MessageSquare className="h-3 w-3" /> {open ? "Hide conversation" : "Show conversation"}
      </Button>
      {open && (
        <div className="mt-2">
          <ComplaintCommentThread complaint={complaint} userId={userId} />
        </div>
      )}
    </div>
  );
}
