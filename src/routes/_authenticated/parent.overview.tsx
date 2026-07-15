import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChildSnapshotCard } from "@/components/parent/ChildSnapshotCard";
import { ParentPageFrame } from "@/components/parent/ParentPageFrame";

export const Route = createFileRoute("/_authenticated/parent/overview")({
  component: ParentOverviewPage,
});

function ParentOverviewPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader title={t("parent.shellTitle")} />
      <ParentPageFrame>
        {(child) => <ChildSnapshotCard child={child} />}
      </ParentPageFrame>
    </div>
  );
}
