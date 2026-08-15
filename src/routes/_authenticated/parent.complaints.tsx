import { createFileRoute } from "@tanstack/react-router";

import { ParentPageFrame } from "@/components/parent/ParentPageFrame";
import { ComplaintTrackerList } from "@/components/parent/ComplaintTrackerList";

export const Route = createFileRoute("/_authenticated/parent/complaints")({
  component: ParentComplaintsPage,
});

function ParentComplaintsPage() {
  return (
    <div className="space-y-6">
      <ParentPageFrame requirePermission="can_view_complaints">
        {(child) => <ComplaintTrackerList studentId={child.student_id} />}
      </ParentPageFrame>
    </div>
  );
}
