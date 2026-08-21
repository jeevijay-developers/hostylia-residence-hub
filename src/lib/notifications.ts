import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type NoticeRow = Database["public"]["Tables"]["notices"]["Row"];
export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

interface ComplaintResolvedPayload {
  complaint_id?: string;
  complaint_number?: string;
  resolved_by_label?: string | null;
}

/** How long the "Complaint Resolved" toast stays up before auto-dismissing. */
const COMPLAINT_RESOLVED_TOAST_MS = 5500;

export function useMyNotifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["my-notifications"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [] as NotificationRow[];
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_user_id", u.user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });

  useEffect(() => {
    // The channel is created inside an async callback, so the effect can be torn
    // down before `sub` is assigned. Without the `cancelled` guard the channel
    // leaks, and because supabase.channel() returns the existing channel for a
    // known topic, the next mount gets an already-subscribed channel and throws
    // "cannot add postgres_changes callbacks ... after subscribe()".
    let cancelled = false;
    let sub: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user || cancelled) return;
      const topic = `notif-${data.user.id}`;
      // A channel for this topic may already be subscribed (e.g. another
      // mounted instance of this hook, or a leftover from a fast remount) —
      // `.channel()` returns that same joined instance, and calling `.on()`
      // on an already-subscribed channel throws. Reuse it instead.
      const alreadyJoined = supabase.getChannels().some((c) => c.topic === `realtime:${topic}`);
      if (alreadyJoined) return;
      const channel = supabase
        .channel(topic)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `recipient_user_id=eq.${data.user.id}`,
          },
          (payload) => {
            qc.invalidateQueries({ queryKey: ["my-notifications"] });

            // Newly-arrived "your complaint got resolved" notification — surface
            // it as a toast right away instead of making the admin dig into the
            // bell to notice it. Every other notification keeps its existing
            // bell-only behaviour.
            if (payload.eventType !== "INSERT") return;
            const row = payload.new as NotificationRow;
            if (row.event_type !== "COMPLAINT_RESOLVED") return;
            const info = (row.payload ?? {}) as ComplaintResolvedPayload;
            toast.success("Complaint Resolved", {
              description: `Your complaint has been resolved by ${info.resolved_by_label ?? "the team"}.`,
              duration: COMPLAINT_RESOLVED_TOAST_MS,
              action: info.complaint_id
                ? {
                    label: "View complaint →",
                    onClick: () =>
                      navigate({
                        to: "/admin/complaints",
                        search: { complaintId: info.complaint_id },
                      }),
                  }
                : undefined,
            });
          },
        )
        .subscribe();

      // Torn down while subscribing — drop it rather than orphaning the topic.
      if (cancelled) {
        supabase.removeChannel(channel);
        return;
      }
      sub = channel;
    });

    return () => {
      cancelled = true;
      if (sub) supabase.removeChannel(sub);
    };
  }, [qc, navigate]);

  return query;
}

export async function markNotificationRead(id: string) {
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
}

export async function markAllRead(ids: string[]) {
  if (!ids.length) return;
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
}

/**
 * @param includeAllStatuses Admin/composer views need to see and act on
 * DRAFT/SCHEDULED/CANCELLED notices too (e.g. to Cancel a scheduled one
 * before it fires); recipient-facing feeds must stay PUBLISHED-only.
 */
export function useTenantNotices(
  tenantId: string | null | undefined,
  propertyId?: string | null,
  includeAllStatuses = false,
) {
  const qc = useQueryClient();
  const key = tenantId ?? propertyId ?? null;
  const query = useQuery({
    queryKey: ["notices", tenantId, propertyId, includeAllStatuses],
    enabled: !!(tenantId || propertyId),
    queryFn: async () => {
      let q = supabase
        .from("notices")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!includeAllStatuses) q = q.eq("status", "PUBLISHED");
      if (tenantId) q = q.eq("tenant_id", tenantId);
      if (propertyId) q = q.eq("property_id", propertyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as NoticeRow[];
    },
  });

  useEffect(() => {
    if (!key) return;
    const topic = `notices-${key}`;
    const alreadyJoined = supabase.getChannels().some((c) => c.topic === `realtime:${topic}`);
    if (alreadyJoined) return;
    const filter = tenantId ? `tenant_id=eq.${tenantId}` : `property_id=eq.${propertyId}`;
    const channel = supabase
      .channel(topic)
      .on("postgres_changes", { event: "*", schema: "public", table: "notices", filter }, () =>
        qc.invalidateQueries({ queryKey: ["notices"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [key, tenantId, propertyId, qc]);

  return query;
}
