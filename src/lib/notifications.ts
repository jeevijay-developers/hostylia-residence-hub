import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type NoticeRow = Database["public"]["Tables"]["notices"]["Row"];
export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

export function useMyNotifications() {
  const qc = useQueryClient();
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
    let sub: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      sub = supabase
        .channel(`notif-${data.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `recipient_user_id=eq.${data.user.id}`,
          },
          () => qc.invalidateQueries({ queryKey: ["my-notifications"] }),
        )
        .subscribe();
    });
    return () => {
      if (sub) supabase.removeChannel(sub);
    };
  }, [qc]);

  return query;
}

export async function markNotificationRead(id: string) {
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
}

export async function markAllRead(ids: string[]) {
  if (!ids.length) return;
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids);
}

export function useTenantNotices(tenantId: string | null | undefined, propertyId?: string | null) {
  const qc = useQueryClient();
  const key = tenantId ?? propertyId ?? null;
  const query = useQuery({
    queryKey: ["notices", tenantId, propertyId],
    enabled: !!(tenantId || propertyId),
    queryFn: async () => {
      let q = supabase
        .from("notices")
        .select("*")
        .eq("status", "PUBLISHED")
        .is("deleted_at", null)
        .order("published_at", { ascending: false })
        .limit(50);
      if (tenantId) q = q.eq("tenant_id", tenantId);
      if (propertyId) q = q.eq("property_id", propertyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as NoticeRow[];
    },
  });

  useEffect(() => {
    if (!key) return;
    const filter = tenantId ? `tenant_id=eq.${tenantId}` : `property_id=eq.${propertyId}`;
    const channel = supabase
      .channel(`notices-${key}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notices", filter },
        () => qc.invalidateQueries({ queryKey: ["notices"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [key, tenantId, propertyId, qc]);

  return query;
}
