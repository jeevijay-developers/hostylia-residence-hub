import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ParentPageFrame } from "@/components/parent/ParentPageFrame";
import { GatePassPanel } from "@/components/parent/GatePassPanel";
import { GateHistoryList } from "@/components/parent/GateHistoryList";

export const Route = createFileRoute("/_authenticated/parent/gate-pass")({
  component: ParentGatePassPage,
});

function ParentGatePassPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <ParentPageFrame requirePermission="can_view_gate_events">
        {(child) => (
          <div className="space-y-6">
            <GatePassPanel studentId={child.student_id} canApprove={child.can_approve_gate_pass} />
            <div className="space-y-2">
              <div className="text-sm font-medium">{t("parent.gateHistory.title")}</div>
              <GateHistoryList studentId={child.student_id} />
            </div>
          </div>
        )}
      </ParentPageFrame>
    </div>
  );
}
