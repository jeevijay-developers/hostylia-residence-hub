import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { ParentPageFrame } from "@/components/parent/ParentPageFrame";
import { GatePassPanel } from "@/components/parent/GatePassPanel";

export const Route = createFileRoute("/_authenticated/parent/gate-pass")({
  component: ParentGatePassPage,
});

function ParentGatePassPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader title={t("parent.gatePass.title")} />
      <ParentPageFrame requirePermission="can_view_gate_events">
        {(child) => <GatePassPanel studentId={child.student_id} canApprove={child.can_approve_gate_pass} />}
      </ParentPageFrame>
    </div>
  );
}
