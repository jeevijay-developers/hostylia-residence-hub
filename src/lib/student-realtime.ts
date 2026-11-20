import { useEffect, useId } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Keeps the student list / detail queries fresh when a students row changes
 * (e.g. an applicant's account gets linked after signup). Used by both the Admin
 * and Warden views, which share the same query keys, so they stay in step.
 * RLS filters what each subscriber receives, so this widens no access.
 */
export function useStudentsRealtime(propertyId: string | null | undefined) {
  const qc = useQueryClient();
  const instanceId = useId();

  useEffect(() => {
    if (!propertyId) return;
    // Unique topic per hook instance: supabase.channel() returns an existing joined
    // channel for the same topic, and adding callbacks after subscribe() throws.
    const channel = supabase
      .channel(`students-${propertyId}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "students", filter: `property_id=eq.${propertyId}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["students-list"] });
          const id = (payload.new as { id?: string }).id;
          qc.invalidateQueries({ queryKey: id ? ["student", id] : ["student"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [propertyId, instanceId, qc]);
}
