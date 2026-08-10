import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, LogIn, Square } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  endSupportSession,
  listSupportSessions,
  searchUsers,
  startSupportSession,
  listAllTenants,
} from "@/lib/super-admin.functions";

export const Route = createFileRoute("/_authenticated/super-admin/impersonation")({
  component: ImpersonationPage,
});

function ImpersonationPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSupportSessions);
  const searchFn = useServerFn(searchUsers);
  const startFn = useServerFn(startSupportSession);
  const endFn = useServerFn(endSupportSession);
  const listTenantsFn = useServerFn(listAllTenants);

  const { data: sessions = [] } = useQuery({ queryKey: ["support-sessions"], queryFn: () => listFn({}) });
  const { data: tenants = [] } = useQuery({ queryKey: ["all-tenants"], queryFn: () => listTenantsFn({}) });

  const [tenantId, setTenantId] = useState("");
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<any | null>(null);
  const [reason, setReason] = useState("");
  const [ref, setRef] = useState("");
  const [mode, setMode] = useState<"READ_ONLY" | "STANDARD" | "ELEVATED">("READ_ONLY");
  const [duration, setDuration] = useState(30);
  const [consent, setConsent] = useState(false);

  const { data: results = [] } = useQuery({
    queryKey: ["search-users", q],
    queryFn: () => searchFn({ data: { q } }),
    enabled: q.length >= 2,
  });

  const start = useMutation({
    mutationFn: () =>
      startFn({
        data: {
          tenant_id: tenantId,
          target_user_id: target.id,
          reason,
          support_reference: ref || null,
          access_mode: mode,
          consent_recorded: true as const,
          duration_minutes: duration,
        },
      }),
    onSuccess: () => {
      toast.success("Support session started");
      setTarget(null);
      setReason("");
      setRef("");
      setConsent(false);
      qc.invalidateQueries({ queryKey: ["support-sessions"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const end = useMutation({
    mutationFn: (id: string) => endFn({ data: { session_id: id, reason: "ended by super admin" } }),
    onSuccess: () => {
      toast.success("Session ended");
      qc.invalidateQueries({ queryKey: ["support-sessions"] });
    },
  });

  const canStart = !!tenantId && !!target && reason.length >= 10 && consent;

  return (
    <div className="space-y-6">
      <PageHeader title="Impersonation" description="Start a time-limited, audited support session on a tenant's account." />

      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="text-sm font-semibold">Start session</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Tenant</Label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger><SelectValue placeholder="Choose tenant" /></SelectTrigger>
              <SelectContent>
                {tenants.map((t: any) => (<SelectItem key={t.id} value={t.id}>{t.display_name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Search user (name / email / phone)</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="min 2 chars" />
            {results.length > 0 && !target && (
              <div className="mt-1 rounded border border-border bg-popover text-sm max-h-40 overflow-auto">
                {results.map((r: any) => (
                  <button
                    key={r.id}
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-muted"
                    onClick={() => { setTarget(r); setQ(r.full_name ?? r.email ?? r.phone); }}
                  >
                    <div className="font-medium">{r.full_name ?? "(no name)"}</div>
                    <div className="text-xs text-muted-foreground">{r.email ?? r.phone}</div>
                  </button>
                ))}
              </div>
            )}
            {target && <p className="text-xs">Selected: <span className="font-medium">{target.full_name ?? target.email}</span></p>}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Reason (min 10 chars, will appear in the tenant's audit log)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Support reference (ticket #)</Label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Access mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="READ_ONLY">Read only</SelectItem>
                <SelectItem value="STANDARD">Standard</SelectItem>
                <SelectItem value="ELEVATED">Elevated</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Duration (minutes, max 60)</Label>
            <Input type="number" min={5} max={60} value={duration} onChange={(e) => setDuration(parseInt(e.target.value || "30"))} />
          </div>
          <div className="sm:col-span-2 flex items-start gap-2 rounded border border-warning/50 bg-warning/5 p-3">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(!!v)} id="consent" />
            <Label htmlFor="consent" className="text-sm font-normal">
              I confirm the tenant has given explicit consent for this support session and understand this action is fully audited.
            </Label>
          </div>
        </div>
        <Button disabled={!canStart || start.isPending} onClick={() => start.mutate()}>
          {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {start.isPending ? "Starting…" : "Start session"}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <div className="p-4 text-sm font-semibold">Recent sessions</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Started</th>
              <th className="px-4 py-2">Target</th>
              <th className="px-4 py-2">Mode</th>
              <th className="px-4 py-2">Reason</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s: any) => {
              const active = !s.ended_at && new Date(s.expires_at).getTime() > Date.now();
              return (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-4 py-2 text-muted-foreground">{new Date(s.started_at).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono text-xs">{s.target_user_id.slice(0, 8)}</td>
                  <td className="px-4 py-2">{s.access_mode}</td>
                  <td className="px-4 py-2 max-w-md truncate">{s.reason}</td>
                  <td className="px-4 py-2">
                    {active ? <Badge>Active</Badge> : s.ended_at ? <Badge variant="secondary">Ended</Badge> : <Badge variant="outline">Expired</Badge>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {active && (
                      <Button size="sm" variant="destructive" onClick={() => end.mutate(s.id)}>
                        <Square className="h-4 w-4" /> End now
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!sessions.length && (<tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No sessions yet.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
