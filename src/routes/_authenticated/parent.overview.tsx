import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";

export const Route = createFileRoute("/_authenticated/parent/overview")({
  component: ParentOverviewPage,
});

function ParentOverviewPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Overview" />
      <EmptyState
        title="Nothing to show yet"
        description="Once your child is checked in, you'll see their activity here."
      />
    </div>
  );
}
