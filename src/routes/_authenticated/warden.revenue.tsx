import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { RevenueCollectionsSummary } from "@/components/finance/RevenueCollectionsSummary";
import { useWardenPermissions } from "@/lib/staff-scope";

/**
 * Warden's view of Admin's "Revenue & Collections" (admin.finance.pnl.tsx) —
 * reuses the same RevenueCollectionsSummary component and
 * getRevenueCollectionsSummary server function (RLS-scoped to this Warden's
 * property via can_view_invoices, same as /warden/invoices). Deliberately
 * excludes RefundApprovalList — approving a refund is a Hostel-Admin-only
 * maker-checker action (a different user than the one who submitted it via
 * /warden/refunds), never a Warden capability.
 */
export const Route = createFileRoute("/_authenticated/warden/revenue")({
  head: () => ({ meta: [{ title: "Revenue & Collections — Hostylia" }] }),
  component: () => (
    <StaffModuleGuard role="WARDEN" module="invoices_view">
      <WardenRevenuePage />
    </StaffModuleGuard>
  ),
});

function WardenRevenuePage() {
  const { propertyId, isLoading } = useWardenPermissions();
  if (isLoading) return null;
  if (!propertyId)
    return (
      <p className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-sm text-muted-foreground">
        No property assigned to your account yet — contact your Hostel Admin.
      </p>
    );

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue & Collections" />
      <RevenueCollectionsSummary propertyId={propertyId} />
    </div>
  );
}
