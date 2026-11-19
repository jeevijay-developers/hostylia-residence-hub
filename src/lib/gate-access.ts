/**
 * Which parts of the staff Gate page a Warden / Accountant may see and use, derived from
 * the effective permission resolver (`useStaffPermissions().can`) — no second permission
 * system. Each rule mirrors what RLS needs for the underlying reads / writes:
 *
 *  - gate_passes SELECT            -> gate_passes_view       (can_view_gate_passes)
 *  - gate_passes UPDATE            -> gate_passes_edit       (can_edit_gate_passes) — approve / reject, scan
 *  - gate_events SELECT / INSERT   -> gate_events            (can_manage_gate_events) — feed, scan, visitor check-in/out
 *  - visitors SELECT               -> visitors_view          (can_view_visitors)
 *  - visitors INSERT               -> visitors_create        (can_create_visitors)
 *  - visitors UPDATE               -> visitors_edit          (can_edit_visitors) — check-in / check-out
 *
 * UI visibility only: RLS stays the real boundary.
 */

export type GateTab = "approvals" | "scan" | "visitors" | "feed";

export interface GateAccess {
  /** Gate Pass data (Approvals list, Pending KPI, Currently Out) */
  passes: boolean;
  /** Approve / Reject a pass */
  decidePasses: boolean;
  /** QR scan / manual Check IN-OUT of a pass */
  scan: boolean;
  /** Visitor data (Visitors tab, Visitors KPIs) */
  visitors: boolean;
  registerVisitor: boolean;
  /** Visitor Check IN / Check OUT */
  checkVisitors: boolean;
  /** Gate-event rows may be read at all */
  events: boolean;
  /** Gate Pass activity may appear in the feed / entry-exit counts */
  feedPassEvents: boolean;
  /** Visitor activity may appear in the feed / entry-exit counts */
  feedVisitorEvents: boolean;
  /** Live Feed tab */
  feed: boolean;
  /** Page-level: at least one supported Gate feature is authorised */
  any: boolean;
  /** Tabs to render, in display order */
  tabs: GateTab[];
}

const NONE: GateAccess = {
  passes: false,
  decidePasses: false,
  scan: false,
  visitors: false,
  registerVisitor: false,
  checkVisitors: false,
  events: false,
  feedPassEvents: false,
  feedVisitorEvents: false,
  feed: false,
  any: false,
  tabs: [],
};

export function resolveGateAccess(can: (key: string) => boolean, ready = true): GateAccess {
  if (!ready) return NONE;
  const passes = can("gate_passes_view");
  const visitors = can("visitors_view");
  const events = can("gate_events");
  const feedPassEvents = events && passes;
  const feedVisitorEvents = events && visitors;
  const feed = feedPassEvents || feedVisitorEvents;
  const scan = passes && can("gate_passes_edit") && events;
  const tabs: GateTab[] = [];
  if (passes) tabs.push("approvals");
  if (scan) tabs.push("scan");
  if (visitors) tabs.push("visitors");
  if (feed) tabs.push("feed");
  return {
    passes,
    decidePasses: passes && can("gate_passes_edit"),
    scan,
    visitors,
    registerVisitor: visitors && can("visitors_create"),
    checkVisitors: visitors && can("visitors_edit") && events,
    events,
    feedPassEvents,
    feedVisitorEvents,
    feed,
    any: passes || visitors,
    tabs,
  };
}

/** A tab that is no longer authorised can never stay selected. */
export function pickGateTab(access: GateAccess, requested: string): GateTab | null {
  if ((access.tabs as string[]).includes(requested)) return requested as GateTab;
  return access.tabs[0] ?? null;
}

/** Visitor events need Visitors access, every other gate event needs Gate Pass access. */
export function isGateEventAuthorized(
  access: GateAccess,
  event: { visitor_id?: string | null; visitors?: unknown },
): boolean {
  const isVisitorEvent = event.visitor_id != null || !!event.visitors;
  return isVisitorEvent ? access.feedVisitorEvents : access.feedPassEvents;
}
