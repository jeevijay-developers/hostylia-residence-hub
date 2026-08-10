import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ComplaintForm } from "@/components/complaints/ComplaintForm";
import { ComplaintCard } from "@/components/complaints/ComplaintCard";
import { ComplaintTimeline } from "@/components/complaints/ComplaintTimeline";
import { ComplaintCommentThread } from "@/components/complaints/ComplaintCommentThread";
import { RatingWidget } from "@/components/complaints/RatingWidget";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useComplaints, useStudentSelf, type ComplaintWithRelations } from "@/lib/complaint";
import { useResolvedRole } from "@/lib/user-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
          <StudentComplaintItem key={c.id} complaint={c} userId={role.data?.userId ?? null} />
        ))}
        {complaints.data && complaints.data.length === 0 && (
          <p className="text-sm text-muted-foreground">No complaints yet.</p>
        )}
      </div>
    </div>
  );
}

function StudentComplaintItem({
  complaint,
  userId,
}: {
  complaint: ComplaintWithRelations;
  userId: string | null;
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(false);

  return (
    <div className="space-y-2">
      <ComplaintCard
        complaint={complaint}
        actions={
          <Collapsible open={statusOpen} onOpenChange={setStatusOpen} className="w-full">
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${statusOpen ? "rotate-180" : ""}`}
                />
                {statusOpen ? "Hide status" : "Track status"}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <ComplaintTimeline complaint={complaint} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        }
      />
      <RatingWidget complaint={complaint} />
      <div className="rounded-md border border-border bg-card p-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setConversationOpen((v) => !v)}
        >
          <MessageSquare className="h-3 w-3" />{" "}
          {conversationOpen ? "Hide conversation" : "Show conversation"}
        </Button>
        {conversationOpen && (
          <div className="mt-2">
            <ComplaintCommentThread complaint={complaint} userId={userId} />
          </div>
        )}
      </div>
    </div>
  );
}
