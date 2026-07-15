import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";

export const Route = createFileRoute("/_authenticated/warden/daily-brief")({
  component: WardenBriefPage,
});

function WardenBriefPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Daily brief" description="Your day at a glance." />
      <EmptyState title="No attendance or complaints yet today" />
    </div>
  );
}
