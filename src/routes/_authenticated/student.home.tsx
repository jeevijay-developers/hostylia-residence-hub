import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";

export const Route = createFileRoute("/_authenticated/student/home")({
  component: StudentHomePage,
});

function StudentHomePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Welcome" />
      <EmptyState
        title="Welcome"
        description="Your fees and notices will appear here."
      />
    </div>
  );
}
