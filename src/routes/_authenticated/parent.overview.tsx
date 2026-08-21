import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Megaphone } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChildSnapshotCard } from "@/components/parent/ChildSnapshotCard";
import { ParentPageFrame } from "@/components/parent/ParentPageFrame";
import { NoticeFeed } from "@/components/notifications/NoticeFeed";
import { Separator } from "@/components/ui/separator";

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
            {child.can_view_notices && (
              <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Megaphone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Recent notices
                </h2>
                <Separator />
                <NoticeFeed
                  tenantId={null}
                  propertyId={child.property_id}
                  audienceFilter={["ALL", "PARENTS"]}
                  emptyVariant="framed"
                />
              </section>
            )}
          </div>
        )}
      </ParentPageFrame>
    </div>
  );
}
