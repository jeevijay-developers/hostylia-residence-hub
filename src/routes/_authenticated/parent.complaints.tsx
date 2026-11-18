import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ParentPageFrame } from "@/components/parent/ParentPageFrame";
import { ComplaintTrackerList } from "@/components/parent/ComplaintTrackerList";
import { ParentComplaintForm } from "@/components/parent/ParentComplaintForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useResolvedRole } from "@/lib/user-role";

export const Route = createFileRoute("/_authenticated/parent/complaints")({
  // `complaintId` lets a notification jump straight to that complaint.
  validateSearch: z.object({ complaintId: z.string().uuid().optional() }),
  component: ParentComplaintsPage,
});

function ParentComplaintsPage() {
  const { data: role } = useResolvedRole();
  const { complaintId } = Route.useSearch();
  return (
    <div className="space-y-6">
      <ParentPageFrame requirePermission="can_view_complaints">
        {(child) => (
          <div className="space-y-6">
            {child.can_create_complaints && role?.userId && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">File a complaint</CardTitle>
                </CardHeader>
                <CardContent>
                  <ParentComplaintForm child={child} userId={role.userId} />
                </CardContent>
              </Card>
            )}
            <ComplaintTrackerList studentId={child.student_id} highlightId={complaintId} />
          </div>
        )}
      </ParentPageFrame>
    </div>
  );
}
