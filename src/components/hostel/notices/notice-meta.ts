import {
  Bell,
  BookOpen,
  Building2,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquare,
  PartyPopper,
  Siren,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { formatIstDateTime } from "@/lib/ist";
import type { NoticeCategory, NoticeChannelKey } from "@/lib/notice-defaults";
import type { NoticeAudience, NoticeFilter, PropertyNotice } from "@/lib/property-notices";

/** Labels, icons and semantic tones for the Notices tab (shared by the badges, list and dialogs). */
export const CATEGORY_META: Record<
  NoticeCategory,
  { label: string; icon: LucideIcon; className: string }
> = {
  GENERAL: { label: "General", icon: Megaphone, className: "bg-primary/10 text-primary" },
  MESS: { label: "Mess", icon: UtensilsCrossed, className: "bg-chart-cat-1/10 text-chart-cat-1" },
  MAINTENANCE: {
    label: "Maintenance",
    icon: Wrench,
    className: "bg-chart-cat-3/10 text-chart-cat-3",
  },
  ACADEMIC: { label: "Academic", icon: BookOpen, className: "bg-info/10 text-info" },
  FACILITIES: {
    label: "Facilities",
    icon: Building2,
    className: "bg-chart-cat-2/10 text-chart-cat-2",
  },
  EVENT: { label: "Event", icon: PartyPopper, className: "bg-gold/10 text-gold" },
  EMERGENCY: { label: "Emergency", icon: Siren, className: "bg-destructive/10 text-destructive" },
};

export const AUDIENCE_LABEL: Record<string, string> = {
  ALL: "Everyone",
  STUDENTS: "Residents",
  PARENTS: "Parents",
  WARDENS: "Wardens",
  ACCOUNTANTS: "Accountants",
  CUSTOM: "Selected residents",
};

/** What each stored audience reaches, for the audience picker. */
export const AUDIENCE_HINT: Record<string, string> = {
  ALL: "Residents, parents and staff of this property",
  STUDENTS: "Every current resident of this property",
  PARENTS: "Linked parents and guardians of this property's residents",
  WARDENS: "Wardens of this property",
  ACCOUNTANTS: "Accountants of this property",
  CUSTOM: "Residents and/or whole blocks you choose",
};

export const CHANNEL_META: Record<NoticeChannelKey, { label: string; icon: LucideIcon }> = {
  IN_APP: { label: "In-app", icon: Bell },
  WHATSAPP: { label: "WhatsApp", icon: MessageCircle },
  EMAIL: { label: "Email", icon: Mail },
  SMS: { label: "SMS", icon: MessageSquare },
};

export function audienceText(n: Pick<PropertyNotice, "audience_type" | "recipientCount">) {
  const base = AUDIENCE_LABEL[n.audience_type] ?? n.audience_type;
  return n.audience_type === "CUSTOM" && n.recipientCount !== null
    ? `${base} (${n.recipientCount.toLocaleString("en-IN")})`
    : base;
}

/** Why an archived notice is archived, in words. */
export function archivedReason(n: PropertyNotice): string {
  if (n.status === "CANCELLED") return "Cancelled before it was sent";
  if (n.expires_at) return `Expired ${formatIstDateTime(n.expires_at)}`;
  return "Expired";
}

/** What the Notices toolbar controls; owned by the tab so the toolbar can sit above the list and side cards. */
export interface NoticeListFilters {
  search: string;
  filter: NoticeFilter;
  category: NoticeCategory | "ALL";
  audience: NoticeAudience | null;
  view: "list" | "grid";
}

export const DEFAULT_NOTICE_LIST_FILTERS: NoticeListFilters = {
  search: "",
  filter: "ALL",
  category: "ALL",
  audience: null,
  view: "list",
};
