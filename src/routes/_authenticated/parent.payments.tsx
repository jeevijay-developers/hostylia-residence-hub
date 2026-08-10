import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ParentPageFrame } from "@/components/parent/ParentPageFrame";
import { StudentFeesList } from "@/components/finance/StudentFeesList";

export const Route = createFileRoute("/_authenticated/parent/payments")({
  component: ParentPaymentsPage,
});

function ParentPaymentsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 p-4">
      <PageHeader title={t("parent.snapshot.feesTitle")} />
      <ParentPageFrame requirePermission="can_pay_fees">
        {(child) => <StudentFeesList studentId={child.student_id} />}
      </ParentPageFrame>
    </div>
  );
}
