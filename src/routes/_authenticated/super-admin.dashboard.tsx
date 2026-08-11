import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  TrendingUp,
  CreditCard,
  TrendingDown,
  AlertTriangle,
  UserPlus,
  Wallet,
  Flag,
  LogIn,
  ChevronRight,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  getPlatformMetrics,
  listAllTenants,
  listSubscriptionsWithPlan,
  listSupportSessions,
} from "@/lib/super-admin.functions";
import { cn, toneClasses, type SemanticTone } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/super-admin/dashboard")({
  component: SuperAdminDashboardPage,
});

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const SUB_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  TRIAL: "Trial",
  PAST_DUE: "Past Due",
  PAUSED: "Paused",
  CANCELLED: "Cancelled",
};
const SUB_STATUS_ORDER = ["ACTIVE", "TRIAL", "PAST_DUE", "PAUSED", "CANCELLED"];

const QUICK_ACTIONS: { label: string; to: string; icon: typeof UserPlus; tone: SemanticTone }[] = [
  { label: "Onboard / Manage Tenant", to: "/super-admin/tenants", icon: UserPlus, tone: "primary" },
  { label: "Manage Billing", to: "/super-admin/billing", icon: Wallet, tone: "success" },
  { label: "Manage Feature Flags", to: "/super-admin/feature-flags", icon: Flag, tone: "info" },
  {
    label: "Start Support Session",
    to: "/super-admin/impersonation",
    icon: LogIn,
    tone: "warning",
  },
];

function SuperAdminDashboardPage() {
  const metricsFn = useServerFn(getPlatformMetrics);
  const tenantsFn = useServerFn(listAllTenants);
  const subsFn = useServerFn(listSubscriptionsWithPlan);
  const sessionsFn = useServerFn(listSupportSessions);

  const metricsQ = useQuery({ queryKey: ["platform-metrics"], queryFn: () => metricsFn({}) });
  const tenantsQ = useQuery({ queryKey: ["all-tenants"], queryFn: () => tenantsFn({}) });
  const subsQ = useQuery({ queryKey: ["all-subscriptions"], queryFn: () => subsFn({}) });
  const sessionsQ = useQuery({ queryKey: ["support-sessions"], queryFn: () => sessionsFn({}) });

  const metrics = metricsQ.data;
  const totalTenants = metrics
    ? Object.values(metrics.tenants_by_status).reduce((sum, n) => sum + n, 0)
    : 0;

  const subStatusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of subsQ.data ?? []) counts[s.status] = (counts[s.status] ?? 0) + 1;
    return counts;
  }, [subsQ.data]);
  const pastDueCount = subStatusCounts.PAST_DUE ?? 0;

  const tenantNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tenantsQ.data ?? []) m.set(t.id, t.display_name);
    return m;
  }, [tenantsQ.data]);

  const planByTenant = useMemo(() => {
    const m = new Map<string, { plan: string | null; status: string }>();
    for (const s of subsQ.data ?? []) {
      if (!m.has(s.tenant_id)) {
        m.set(s.tenant_id, {
          plan: (s.plans as { name: string } | null)?.name ?? null,
          status: s.status,
        });
      }
    }
    return m;
  }, [subsQ.data]);

  const recentTenants = (tenantsQ.data ?? []).slice(0, 5);
  const recentSessions = (sessionsQ.data ?? []).slice(0, 5);
  const targetUserIds = useMemo(
    () => Array.from(new Set(recentSessions.map((s) => s.target_user_id))),
    [recentSessions],
  );

  const targetProfilesQ = useQuery({
    queryKey: ["support-session-targets", targetUserIds],
    enabled: targetUserIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", targetUserIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const targetNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of targetProfilesQ.data ?? []) m.set(p.id, p.full_name || p.email || "—");
    return m;
  }, [targetProfilesQ.data]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Platform overview"
        description="Tenants, revenue and subscription health across Hostylia."
      />

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          icon={Boxes}
          label="Total tenants"
          value={totalTenants}
          loading={metricsQ.isLoading}
          bareIcon
        />
        <KpiCard
          icon={TrendingUp}
          label="MRR"
          value={metrics ? formatInr(metrics.mrr_paise) : "—"}
          loading={metricsQ.isLoading}
          bareIcon
        />
        <KpiCard
          icon={CreditCard}
          label="Active subscriptions"
          value={metrics?.active_subscriptions ?? 0}
          loading={metricsQ.isLoading}
          bareIcon
        />
        <KpiCard
          icon={TrendingDown}
          label="30-day churn"
          value={metrics ? `${(metrics.churn_30d * 100).toFixed(1)}%` : "—"}
          loading={metricsQ.isLoading}
          tone={metrics && metrics.churn_30d > 0 ? "warning" : "primary"}
          bareIcon
        />
        <div className="col-span-2 sm:col-span-1">
          <KpiCard
            icon={AlertTriangle}
            label="Past-due subscriptions"
            value={pastDueCount}
            loading={subsQ.isLoading}
            tone={pastDueCount > 0 ? "destructive" : "primary"}
            bareIcon
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition hover:bg-accent"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                  toneClasses[a.tone],
                )}
              >
                <a.icon className="h-4 w-4" />
              </span>
              <span className="truncate text-sm font-medium text-foreground">{a.label}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscription health</CardTitle>
        </CardHeader>
        <CardContent>
          {subsQ.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {SUB_STATUS_ORDER.map((status) => (
                <div key={status} className="rounded-md border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">{SUB_STATUS_LABEL[status]}</p>
                  <p className="mt-1 text-xl font-semibold">{subStatusCounts[status] ?? 0}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent tenant onboarding</CardTitle>
        </CardHeader>
        <CardContent>
          {tenantsQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : recentTenants.length === 0 ? (
            <EmptyState
              title="No tenants onboarded yet"
              description="Once hostels sign up, you'll see their subscription and usage here."
            />
          ) : (
            <div className="space-y-2">
              {recentTenants.map((t) => {
                const sub = planByTenant.get(t.id);
                return (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.display_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.onboarding_status.replaceAll("_", " ")} · {sub?.plan ?? "No plan"}
                        {sub ? ` (${SUB_STATUS_LABEL[sub.status] ?? sub.status})` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline">{t.status}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent support activity</CardTitle>
        </CardHeader>
        <CardContent>
          {sessionsQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : recentSessions.length === 0 ? (
            <EmptyState
              title="No support sessions yet"
              description="Impersonation/support sessions will appear here once started."
            />
          ) : (
            <div className="space-y-2">
              {recentSessions.map((s) => {
                const active = !s.ended_at && new Date(s.expires_at).getTime() > Date.now();
                return (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {tenantNameById.get(s.tenant_id) ?? "—"} →{" "}
                        {targetNameById.get(s.target_user_id) ?? "…"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.access_mode} · started {new Date(s.started_at).toLocaleString()}
                      </p>
                    </div>
                    {active ? (
                      <Badge>Active</Badge>
                    ) : s.ended_at ? (
                      <Badge variant="secondary">Ended</Badge>
                    ) : (
                      <Badge variant="outline">Expired</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
