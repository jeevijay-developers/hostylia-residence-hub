import { useState } from "react";
import { CalendarClock, Coins, FileText, Undo2, Users } from "lucide-react";

import { DeltaPill } from "@/components/dashboard/admin/DashboardStatCard";
import { PropertyHero, PropertyTabs } from "@/components/hostel/overview/PropertyHero";
import type { OverviewProperty } from "@/components/hostel/overview/PropertyOverview";
import { CountPill, FinanceKpiTile } from "@/components/hostel/finance/FinanceKpiTile";
import {
  CollectionBreakdownCard,
  PaymentTrendCard,
} from "@/components/hostel/finance/FinanceCharts";
import { FinanceQuickActionsCard } from "@/components/hostel/finance/FinanceQuickActionsCard";
import { OutstandingDuesCard } from "@/components/hostel/finance/OutstandingDuesCard";
import { RecentTransactionsCard } from "@/components/hostel/finance/RecentTransactionsCard";
import { formatInr, formatInrCompact } from "@/lib/finance";
import {
  fullDate,
  usePropertyCollections,
  usePropertyDuesSummary,
  usePropertyRefundsSummary,
  type FinanceRange,
} from "@/lib/property-finance";
import { usePropertyOverviewStats } from "@/lib/property-overview";

function plural(n: number, word: string) {
  return `${n.toLocaleString("en-IN")} ${word}${n === 1 ? "" : "s"}`;
}

function ResidentsPill({ count }: { count: number }) {
  return (
    <CountPill icon={Users} tone={count > 0 ? "warning" : "muted"}>
      {plural(count, "resident")}
    </CountPill>
  );
}

/**
 * A property's Finance tab: collection / dues / refund KPIs, the payment
 * trend, this month's collections by fee plan, finance shortcuts, recent
 * transactions and outstanding dues. Collections only — there is no expense
 * data, so nothing here is presented as P&L.
 */
export function PropertyFinance({ property }: { property: OverviewProperty }) {
  const [range, setRange] = useState<FinanceRange>("this-month");
  const statsQ = usePropertyOverviewStats(property.id);
  const mtdQ = usePropertyCollections(property.id, "this-month");
  const trendQ = usePropertyCollections(property.id, range);
  const duesQ = usePropertyDuesSummary(property.id);
  const refundsQ = usePropertyRefundsSummary(property.id);

  const mtd = mtdQ.data;
  const dues = duesQ.data;
  const refunds = refundsQ.data;

  return (
    <div className="w-full space-y-4 sm:space-y-5">
      <PropertyHero
        property={property}
        blocks={statsQ.data?.blocksCount}
        beds={statsQ.data?.beds.total}
        residents={statsQ.data?.residents}
        isLoadingCounts={statsQ.isLoading}
      />
      <PropertyTabs slug={property.slug} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <FinanceKpiTile
          icon={Coins}
          label="Collections (MTD)"
          value={formatInrCompact(mtd?.totalPaise ?? 0)}
          valueTitle={formatInr(mtd?.totalPaise ?? 0)}
          isLoading={mtdQ.isLoading}
          isError={mtdQ.isError}
          onRetry={() => mtdQ.refetch()}
          badge={
            mtd?.deltaPct != null ? (
              <DeltaPill
                delta={{
                  value: mtd.deltaPct,
                  label: `${mtd.deltaPct > 0 ? "+" : ""}${mtd.deltaPct}%`,
                  description: "vs the same days last month",
                }}
              />
            ) : null
          }
          caption={
            mtd?.deltaPct != null
              ? `vs ${formatInrCompact(mtd.previousPaise)} by this day last month`
              : `${plural(mtd?.paymentCount ?? 0, "payment")} captured this month`
          }
        />
        <FinanceKpiTile
          icon={FileText}
          label="Pending dues"
          value={formatInrCompact(dues?.pendingPaise ?? 0)}
          valueTitle={formatInr(dues?.pendingPaise ?? 0)}
          isLoading={duesQ.isLoading}
          isError={duesQ.isError}
          onRetry={() => duesQ.refetch()}
          badge={dues ? <ResidentsPill count={dues.pendingResidents} /> : null}
          caption={
            dues && dues.overduePaise > 0
              ? `${formatInrCompact(dues.overduePaise)} overdue · ${plural(dues.openInvoices, "open invoice")}`
              : `${plural(dues?.openInvoices ?? 0, "open invoice")}`
          }
        />
        <FinanceKpiTile
          icon={CalendarClock}
          label="Due this week"
          value={formatInrCompact(dues?.weekPaise ?? 0)}
          valueTitle={formatInr(dues?.weekPaise ?? 0)}
          isLoading={duesQ.isLoading}
          isError={duesQ.isError}
          onRetry={() => duesQ.refetch()}
          badge={dues ? <ResidentsPill count={dues.weekResidents} /> : null}
          caption={
            dues ? `Due today to ${fullDate(dues.weekEnd)} · overdue not included` : "Next 7 days"
          }
        />
        <FinanceKpiTile
          icon={Undo2}
          label="Refunds (MTD)"
          value={formatInrCompact(refunds?.paise ?? 0)}
          valueTitle={formatInr(refunds?.paise ?? 0)}
          isLoading={refundsQ.isLoading}
          isError={refundsQ.isError}
          onRetry={() => refundsQ.refetch()}
          badge={
            refunds ? (
              <CountPill icon={FileText}>{plural(refunds.requests, "request")}</CountPill>
            ) : null
          }
          caption={
            refunds && refunds.requests > 0
              ? `${refunds.completed} completed · ${refunds.awaitingApproval} awaiting approval`
              : "No refund requests this month"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
        <div className="md:col-span-2 2xl:col-span-1">
          <PaymentTrendCard
            range={range}
            onRangeChange={setRange}
            data={trendQ.data}
            isLoading={trendQ.isLoading}
            isError={trendQ.isError}
            onRetry={() => trendQ.refetch()}
          />
        </div>
        <CollectionBreakdownCard
          breakdown={mtd?.breakdown}
          totalPaise={mtd?.totalPaise ?? 0}
          isLoading={mtdQ.isLoading}
          isError={mtdQ.isError}
          onRetry={() => mtdQ.refetch()}
        />
        <FinanceQuickActionsCard propertyId={property.id} />
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <RecentTransactionsCard propertyId={property.id} />
        <OutstandingDuesCard propertyId={property.id} />
      </div>
    </div>
  );
}
