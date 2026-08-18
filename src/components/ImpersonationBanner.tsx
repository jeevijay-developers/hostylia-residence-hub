import { useEffect, useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Session = {
  id: string;
  tenant_id: string;
  super_admin_user_id: string;
  target_user_id: string;
  reason: string;
  access_mode: string;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
};

/**
 * Shown app-wide whenever the current user is (or was recently) the target of
 * an impersonation session. Reads support_sessions filtered by RLS.
 */
export function ImpersonationBanner() {
  const [active, setActive] = useState<Session | null>(null);
  const [recentlyEnded, setRecentlyEnded] = useState<Session | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("support_sessions")
        .select("*")
        .eq("target_user_id", uid)
        .order("started_at", { ascending: false })
        .limit(5);
      if (cancelled || !data) return;
      const now = Date.now();
      const live = data.find((s: Session) => !s.ended_at && new Date(s.expires_at).getTime() > now);
      if (live) {
        setActive(live);
      } else {
        const ended = data.find(
          (s: Session) => s.ended_at && now - new Date(s.ended_at).getTime() < 10 * 60_000,
        );
        setRecentlyEnded(ended ?? null);
      }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (active) {
    const expires = new Date(active.expires_at).toLocaleTimeString();
    return (
      <div className="sticky top-0 z-50 flex items-center gap-2 border-b-2 border-destructive bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive">
        <ShieldAlert className="h-4 w-4" />
        <span>
          A Hostylia support agent is currently accessing your account (
          {active.access_mode.replace("_", " ").toLowerCase()}) until {expires}. Reason:{" "}
          {active.reason}
        </span>
      </div>
    );
  }
  if (recentlyEnded) {
    return (
      <div className="sticky top-0 z-50 flex items-center gap-2 border-b border-warning bg-warning/10 px-4 py-2 text-sm text-warning-foreground">
        <AlertTriangle className="h-4 w-4" />
        <span>
          A Hostylia support session on your account ended at{" "}
          {new Date(recentlyEnded.ended_at!).toLocaleTimeString()}. Review activity in your audit
          log if needed.
        </span>
      </div>
    );
  }
  return null;
}
