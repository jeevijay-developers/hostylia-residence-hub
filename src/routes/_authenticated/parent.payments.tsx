import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ParentPageFrame } from "@/components/parent/ParentPageFrame";
import { StudentFeesList } from "@/components/finance/StudentFeesList";

export const Route = createFileRoute("/_authenticated/parent/payments")({
  component: ParentPaymentsPage,
});

function ParentPaymentsPage() {
  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Fees" />
      <ParentPageFrame requirePermission="can_pay_fees">
        {(child) => <StudentFeesList studentId={child.student_id} />}
      </ParentPageFrame>
    </div>
  );
}
