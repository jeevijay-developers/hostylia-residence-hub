import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StudentFinancePanel } from "@/components/finance/StudentFinancePanel";
import { useAccountantProperty } from "@/lib/staff-scope";

export const Route = createFileRoute("/_authenticated/accountant/students")({
  component: AccStudentsPage,
});

function AccStudentsPage() {
  const { propertyId, isLoading: propertyLoading } = useAccountantProperty();
  if (propertyLoading) return null;
  if (!propertyId)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No property assigned to your account yet — contact your Hostel Admin.
      </p>
    );
  return (
    <div className="space-y-4">
      <PageHeader
        title="Students"
        description="Look up a student's invoices, payments and balance."
      />
      <StudentFinancePanel propertyId={propertyId} />
    </div>
  );
}
