import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChildSnapshotCard } from "@/components/parent/ChildSnapshotCard";
import { ParentPageFrame } from "@/components/parent/ParentPageFrame";
import { NoticeFeed } from "@/components/notifications/NoticeFeed";

export const Route = createFileRoute("/_authenticated/parent/overview")({
  component: ParentOverviewPage,
});

function ParentOverviewPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader title={t("parent.shellTitle")} />
      <ParentPageFrame>
        {(child) => (
          <div className="space-y-6">
            <ChildSnapshotCard child={child} />
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Recent notices</h2>
              <NoticeFeed
                tenantId={null}
                propertyId={child.property_id}
                audienceFilter={["ALL", "PARENTS"]}
              />
            </section>
          </div>
        )}
      </ParentPageFrame>
    </div>
  );
}

