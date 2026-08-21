import { createFileRoute } from "@tanstack/react-router";
import { ParentPageFrame } from "@/components/parent/ParentPageFrame";
import { InvoiceList } from "@/components/parent/InvoiceList";
import { SectionHeading } from "@/components/parent/SectionHeading";

export const Route = createFileRoute("/_authenticated/parent/payments")({
  component: ParentPaymentsPage,
});

function ParentPaymentsPage() {
  return (
    <div className="space-y-6">
      <SectionHeading>Payments</SectionHeading>
      <ParentPageFrame requirePermission="can_pay_fees">
        {(child) => <InvoiceList studentId={child.student_id} />}
      </ParentPageFrame>
    </div>
  );
}
