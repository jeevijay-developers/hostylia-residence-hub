import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  CirclePlus,
  Columns3,
  LayoutList,
  MessageSquare,
  RotateCcw,
  Search,
  Siren,
  TriangleAlert,
  UserCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  ActivityTimelineCard,
  type TimelineItem,
} from "@/components/dashboard/ActivityTimelineCard";
import {
  AssignWardenDialog,
  ComplaintStatusDialog,
} from "@/components/hostel/complaints/ComplaintActionDialogs";
import {
  STATUS_META,
  statusLabel,
  type StatusTarget,
} from "@/components/hostel/complaints/complaint-display";
import { ComplaintDetailsSheet } from "@/components/hostel/complaints/ComplaintDetailsSheet";
import { ComplaintFormDialog } from "@/components/hostel/complaints/ComplaintFormDialog";
import {
  ComplaintInsightsCard,
  ComplaintQuickActionsCard,
  PriorityQueueCard,
} from "@/components/hostel/complaints/ComplaintInsightCards";
import {
  ComplaintsBoardCard,
  type BoardActions,
} from "@/components/hostel/complaints/ComplaintsBoardCard";
import { KpiTile } from "@/components/hostel/overview/KpiTile";
import { PropertyHero, PropertyTabs } from "@/components/hostel/overview/PropertyHero";
import type { OverviewProperty } from "@/components/hostel/overview/PropertyOverview";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useComplaintCategories } from "@/lib/complaint";
import { downloadCsv } from "@/lib/csv-export";
import { usePropertyOverviewStats } from "@/lib/property-overview";
import {
  STATUS_FILTERS,
  complaintSla,
  fetchAllComplaints,
  useComplaintActivity,
  useComplaintGroupCounts,
  useComplaintStats,
  useComplaintsRealtime,
  usePriorityQueue,
  usePropertyBlocks,
  usePropertyWardens,
  type ComplaintEventKind,
  type ComplaintFilters,
  type ComplaintSort,
  type PropertyComplaint,
  type StatusFilter,
} from "@/lib/property-complaints";
import { useResolvedRole } from "@/lib/user-role";
import { cn, getErrorMessage } from "@/lib/utils";

const EVENT: Record<ComplaintEventKind, { icon: LucideIcon; label: string }> = {
  CREATED: { icon: CirclePlus, label: "New complaint" },
  ASSIGNED: { icon: UserCheck, label: "Assigned" },
  RESOLVED: { icon: CheckCircle2, label: "Resolved" },
  REOPENED: { icon: RotateCcw, label: "Reopened" },
  COMMENT: { icon: MessageSquare, label: "New message" },
};

const CHIP_DOT: Record<Exclude<StatusFilter, "ALL">, string> = {
  OPEN: "bg-info",
  ASSIGNED: "bg-chart-cat-2",
  IN_PROGRESS: "bg-chart-cat-1",
  RESOLVED: "bg-success",
  CLOSED: "bg-muted-foreground/60",
};

const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

type FormState = { mode: "new" } | { mode: "edit"; complaint: PropertyComplaint } | null;

/**
 * A property's Complaints tab: complaint KPIs, quick actions (new complaint, assign warden, CSV
 * export), search + status / category / block filters, the complaints list or Kanban board,
 * status insights, the open urgent / high priority queue and recent complaint activity.
 */
export function PropertyComplaints({ property }: { property: OverviewProperty }) {
  const qc = useQueryClient();
  const role = useResolvedRole();
  const userId = role.data?.userId ?? null;

  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [categoryId, setCategoryId] = useState("ALL");
  const [blockId, setBlockId] = useState("ALL");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [sort, setSort] = useState<ComplaintSort>("NEWEST");
  const [view, setView] = useState<"list" | "kanban">("list");

  const [form, setForm] = useState<FormState>(null);
  const [details, setDetails] = useState<PropertyComplaint | null>(null);
  const [statusChange, setStatusChange] = useState<{
    complaint: PropertyComplaint;
    target: StatusTarget;
  } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useComplaintsRealtime(property.id);
  const heroQ = usePropertyOverviewStats(property.id);
  const statsQ = useComplaintStats(property.id);
  const queueQ = usePriorityQueue(property.id);
  const activityQ = useComplaintActivity(property.id);
  const categoriesQ = useComplaintCategories(property.id);
  const blocksQ = usePropertyBlocks(property.id);
  const wardensQ = usePropertyWardens(property.tenant_id, property.id);
  const stats = statsQ.data;
  const wardenNames = wardensQ.data?.names;

  const filters: ComplaintFilters = useMemo(
    () => ({ propertyId: property.id, status, categoryId, blockId, q, urgentOnly }),
    [property.id, status, categoryId, blockId, q, urgentOnly],
  );
  // Chip numbers follow the search / category / block / urgent filters, like the list beside them.
  const chipCountsQ = useComplaintGroupCounts(filters);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["property-complaints", property.id] });
    qc.invalidateQueries({ queryKey: ["complaints"] });
    qc.invalidateQueries({ queryKey: ["complaints-paged"] });
  };

  // Messages posted in the details dialog show up in "Recent complaint activity", which neither
  // the comment thread nor the complaints realtime channel refreshes — so refetch it on close.
  const closeDetails = () => {
    qc.invalidateQueries({ queryKey: ["property-complaints", property.id, "activity"] });
    setDetails(null);
  };

  const actions: BoardActions = {
    onOpen: (c) => setDetails(c),
    onEdit: (c) => setForm({ mode: "edit", complaint: c }),
    onStatus: (c, target) => setStatusChange({ complaint: c, target }),
  };

  const timeline = useMemo<TimelineItem[]>(
    () =>
      (activityQ.data ?? []).map((e) => {
        const sub =
          e.kind === "CREATED"
            ? `${e.who ?? "Anonymous student"} reported “${clip(e.title, 60)}”`
            : e.kind === "ASSIGNED"
              ? `Assigned to ${(e.assignee && wardenNames?.get(e.assignee)) ?? "a staff member"}`
              : e.kind === "RESOLVED"
                ? e.detail
                  ? clip(e.detail)
                  : `Marked as resolved — “${clip(e.title, 60)}”`
                : e.kind === "REOPENED"
                  ? `“${clip(e.title, 60)}” is open again`
                  : `${e.who ?? "Someone"}: ${clip(e.detail ?? "")}`;
        return {
          key: e.key,
          at: e.at,
          icon: EVENT[e.kind].icon,
          text: (
            <span className="block min-w-0">
              <span className="block truncate font-medium">{EVENT[e.kind].label}</span>
              {/* The complaint number never truncates; the detail gives way first. */}
              <span className="flex min-w-0 items-baseline gap-1 text-xs text-muted-foreground">
                <span className="shrink-0 whitespace-nowrap font-mono font-semibold text-foreground">
                  {e.number}
                </span>
                <span className="truncate">· {sub}</span>
              </span>
            </span>
          ),
        };
      }),
    [activityQ.data, wardenNames],
  );

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllComplaints(filters, sort);
      if (rows.length === 0) {
        toast.info("No complaints match the current filters.");
        return;
      }
      const at = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN") : "");
      downloadCsv(
        `complaints-${property.slug}-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          "Complaint #",
          "Title",
          "Description",
          "Student",
          "Admission #",
          "Room",
          "Block",
          "Category",
          "Priority",
          "Status",
          "Assigned warden",
          "Raised at",
          "SLA due",
          "SLA state",
          "Resolved at",
          "Resolution summary",
        ],
        rows.map((c) => [
          c.complaint_number,
          c.title,
          c.description,
          c.is_anonymous ? "Anonymous" : (c.student_full_name ?? ""),
          c.is_anonymous ? "" : (c.student_admission_number ?? ""),
          c.room_number ?? "",
          c.block_name ?? "",
          c.category_name ?? "",
          c.priority,
          statusLabel(c.status),
          c.assigned_to ? (wardenNames?.get(c.assigned_to) ?? "Assigned") : "",
          at(c.created_at),
          at(c.sla_due_at),
          complaintSla(c).label,
          at(c.resolved_at),
          c.resolution_summary ?? "",
        ]),
      );
      toast.success(`Exported ${rows.length.toLocaleString("en-IN")} complaints`);
    } catch (e) {
      toast.error(getErrorMessage(e, "We couldn't export complaints."));
    } finally {
      setExporting(false);
    }
  };

  const blocks = blocksQ.data ?? [];

  return (
    <div className="w-full space-y-4 sm:space-y-5">
      <PropertyHero
        property={property}
        blocks={heroQ.data?.blocksCount}
        beds={heroQ.data?.beds.total}
        residents={heroQ.data?.residents}
        isLoadingCounts={heroQ.isLoading}
      />
      <PropertyTabs slug={property.slug} />

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Sized by this column, not the viewport: from 2xl the side column takes 400px of it. */}
        <div className="@container flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 @[30rem]:grid-cols-2 @[30rem]:gap-4 @[56rem]:grid-cols-4">
            <KpiTile
              icon={TriangleAlert}
              label="Open complaints"
              value={stats?.unresolved ?? 0}
              isLoading={statsQ.isLoading}
              caption="Not resolved yet"
            />
            <KpiTile
              icon={Wrench}
              label="In progress"
              value={stats?.inProgress ?? 0}
              isLoading={statsQ.isLoading}
              caption="Being worked on"
            />
            <KpiTile
              icon={CheckCircle2}
              label="Resolved this week"
              value={stats?.resolvedThisWeek ?? 0}
              isLoading={statsQ.isLoading}
              caption="Since Monday"
            />
            <KpiTile
              icon={Siren}
              label="SLA breached"
              value={stats?.slaBreached ?? 0}
              isLoading={statsQ.isLoading}
              caption="Open past their SLA"
            />
          </div>

          {/* One row once the column fits every item (search and the two selects give way first);
              below that the status chips take a full row of their own instead of being clipped. */}
          <div className="flex flex-wrap items-center gap-2 @[72rem]:flex-nowrap">
            <div className="relative w-full @[30rem]:w-60 @[72rem]:w-auto @[72rem]:min-w-32 @[72rem]:max-w-56 @[72rem]:flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search complaints…"
                aria-label="Search complaints by number, title, student or room"
                className="h-9 rounded-xl pl-9 text-sm"
              />
            </div>
            <div
              className="order-last flex w-full flex-wrap gap-1 rounded-xl border border-border/80 bg-card p-1 @[72rem]:order-none @[72rem]:w-auto @[72rem]:shrink-0 @[72rem]:flex-nowrap"
              role="radiogroup"
              aria-label="Filter complaints by status"
            >
              {STATUS_FILTERS.map((s) => {
                const on = status === s;
                const n = chipCountsQ.data?.[s];
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setStatus(s)}
                    className={cn(
                      "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {s !== "ALL" ? (
                      <span
                        className={cn("h-2 w-2 rounded-full", CHIP_DOT[s])}
                        aria-hidden="true"
                      />
                    ) : null}
                    {s === "ALL" ? "All" : (STATUS_META[s]?.label ?? s)}
                    {n !== undefined ? (
                      <span className="tabular-nums opacity-70">{n.toLocaleString("en-IN")}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger
                className="h-9 w-auto min-w-24 max-w-40 gap-2 rounded-xl text-sm"
                aria-label="Category"
              >
                {/* Short label for "All", like the mockup; otherwise the chosen item's text. */}
                <SelectValue>{categoryId === "ALL" ? "Category" : undefined}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All categories</SelectItem>
                {(categoriesQ.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {blocks.length > 0 ? (
              <Select value={blockId} onValueChange={setBlockId}>
                <SelectTrigger
                  className="h-9 w-auto min-w-24 max-w-36 gap-2 rounded-xl text-sm"
                  aria-label="Block"
                >
                  <SelectValue>{blockId === "ALL" ? "Block" : undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All blocks</SelectItem>
                  {blocks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">No block</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            <div
              className="ml-auto flex shrink-0 gap-1 rounded-xl border border-border/80 bg-card p-1"
              role="group"
              aria-label="Layout"
            >
              {(
                [
                  ["list", LayoutList, "List"],
                  ["kanban", Columns3, "Kanban"],
                ] as const
              ).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    view === v
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <ComplaintsBoardCard
            filters={filters}
            view={view}
            sort={sort}
            onSortChange={setSort}
            onClearUrgent={() => setUrgentOnly(false)}
            actions={actions}
          />
        </div>

        <div className="grid min-w-0 grid-cols-1 content-start gap-4 md:grid-cols-2 2xl:flex 2xl:flex-col">
          <ComplaintQuickActionsCard
            onNew={() => setForm({ mode: "new" })}
            onAssign={() => setAssignOpen(true)}
            onExport={exportCsv}
            isExporting={exporting}
          />
          <ComplaintInsightsCard
            stats={stats}
            isLoading={statsQ.isLoading}
            isError={statsQ.isError}
          />
          <PriorityQueueCard
            rows={queueQ.data?.rows ?? []}
            total={queueQ.data?.total ?? 0}
            isLoading={queueQ.isLoading}
            isError={queueQ.isError}
            onOpen={(c) => setDetails(c)}
            onViewAll={() => {
              setUrgentOnly(true);
              setStatus("ALL");
              setSort("SLA");
              setView("list");
            }}
          />
          <ActivityTimelineCard
            title="Recent complaint activity"
            icon={Activity}
            items={timeline}
            isLoading={activityQ.isLoading}
            isError={activityQ.isError}
            errorText="Couldn’t load complaint activity. Please refresh to try again."
            emptyText="No complaint activity yet."
            minItems={4}
            className="2xl:flex-1"
          />
        </div>
      </div>

      {form ? (
        <ComplaintFormDialog
          key={form.mode === "edit" ? form.complaint.id : "new"}
          property={{ id: property.id, tenant_id: property.tenant_id }}
          complaint={form.mode === "edit" ? form.complaint : null}
          wardens={wardensQ.data}
          onClose={() => setForm(null)}
          onSaved={refresh}
        />
      ) : null}
      {details ? (
        <ComplaintDetailsSheet
          complaint={details}
          userId={userId}
          wardenName={details.assigned_to ? (wardenNames?.get(details.assigned_to) ?? null) : null}
          onClose={closeDetails}
          onEdit={() => {
            setForm({ mode: "edit", complaint: details });
            closeDetails();
          }}
          onStatus={(target) => {
            setStatusChange({ complaint: details, target });
            closeDetails();
          }}
        />
      ) : null}
      {statusChange ? (
        <ComplaintStatusDialog
          key={`${statusChange.complaint.id}-${statusChange.target}`}
          complaint={statusChange.complaint}
          target={statusChange.target}
          wardens={wardensQ.data}
          onClose={() => setStatusChange(null)}
          onDone={refresh}
        />
      ) : null}
      {assignOpen ? (
        <AssignWardenDialog
          propertyId={property.id}
          wardens={wardensQ.data}
          onClose={() => setAssignOpen(false)}
          onDone={refresh}
        />
      ) : null}
    </div>
  );
}
