import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Check, LogIn, LogOut, X } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useResolvedRole } from "@/lib/user-role";
import { useMyStaffProperty } from "@/lib/staff-scope";
import { useGatePasses, useGateEventsFeed, useVisitors } from "@/lib/ops";
import { decideGatePass, scanGatePass, checkVisitor } from "@/lib/operations.functions";

export const Route = createFileRoute("/_authenticated/warden/gate")({
  component: WardenGatePage,
});

function WardenGatePage() {
  const role = useResolvedRole();
  const propQ = useMyStaffProperty(role.data?.userId);
  const propertyId = propQ.data ?? null;
  const pending = useGatePasses(propertyId, ["PENDING_WARDEN", "PENDING_PARENT"]);
  const active = useGatePasses(propertyId, ["APPROVED", "ACTIVE"]);
  const events = useGateEventsFeed(propertyId);
  const visitors = useVisitors(propertyId);
  const qc = useQueryClient();
  const decide = useServerFn(decideGatePass);
  const scan = useServerFn(scanGatePass);
  const chkVis = useServerFn(checkVisitor);

  const decideMut = useMutation({
    mutationFn: async (v: { pass_id: string; decision: "APPROVED" | "REJECTED" }) =>
      decide({ data: { pass_id: v.pass_id, role: "WARDEN", decision: v.decision } }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["gate-passes"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [passIdInput, setPassIdInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const scanMut = useMutation({
    mutationFn: async (dir: "IN" | "OUT") =>
      scan({ data: { pass_id: passIdInput, token: tokenInput, direction: dir } }),
    onSuccess: () => { toast.success("Scanned"); setTokenInput(""); qc.invalidateQueries({ queryKey: ["gate-events"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const visMut = useMutation({
    mutationFn: async (v: { visitor_id: string; direction: "IN" | "OUT" }) => chkVis({ data: v }),
    onSuccess: () => { toast.success("Recorded"); qc.invalidateQueries({ queryKey: ["visitors"] }); qc.invalidateQueries({ queryKey: ["gate-events"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Gate" description="Approvals, QR scan, visitor check-in, live feed." />
      <Tabs defaultValue="approvals">
        <TabsList>
          <TabsTrigger value="approvals">Approvals ({pending.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="scan">Scan</TabsTrigger>
          <TabsTrigger value="visitors">Visitors</TabsTrigger>
          <TabsTrigger value="feed">Live Feed</TabsTrigger>
        </TabsList>

        <TabsContent value="approvals" className="space-y-2">
          {(pending.data ?? []).map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">{p.pass_number} — {(p as { students?: { full_name?: string } }).students?.full_name}</div>
                  <div className="text-xs text-muted-foreground">{p.reason} · out {new Date(p.out_at).toLocaleString()} → in {new Date(p.expected_in_at).toLocaleString()}</div>
                  <Badge variant="secondary" className="mt-1">{p.status}</Badge>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => decideMut.mutate({ pass_id: p.id, decision: "REJECTED" })}>
                    <X className="h-4 w-4" /> Reject
                  </Button>
                  <Button size="sm" onClick={() => decideMut.mutate({ pass_id: p.id, decision: "APPROVED" })}>
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {pending.data?.length === 0 && <div className="text-sm text-muted-foreground p-6 text-center">No pending approvals.</div>}
        </TabsContent>

        <TabsContent value="scan" className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-base">QR / Token Scan</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">Camera scanner coming soon. Paste the pass ID and QR token shown on the student's app.</p>
              <Input placeholder="Pass ID (UUID)" value={passIdInput} onChange={(e) => setPassIdInput(e.target.value)} />
              <Input placeholder="QR token" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} />
              <div className="flex gap-2">
                <Button onClick={() => scanMut.mutate("OUT")} disabled={!passIdInput || !tokenInput}>
                  <LogOut className="h-4 w-4" /> Check OUT
                </Button>
                <Button variant="outline" onClick={() => scanMut.mutate("IN")} disabled={!passIdInput || !tokenInput}>
                  <LogIn className="h-4 w-4" /> Check IN
                </Button>
              </div>
            </CardContent>
          </Card>
          <div>
            <div className="text-sm font-medium mb-2">Currently Out</div>
            {(active.data ?? []).filter((p) => p.status === "ACTIVE").map((p) => (
              <Card key={p.id} className="mb-2"><CardContent className="p-3 text-sm">
                {p.pass_number} · {(p as { students?: { full_name?: string } }).students?.full_name} · out {p.actual_out_at ? new Date(p.actual_out_at).toLocaleTimeString() : "—"}
              </CardContent></Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="visitors" className="space-y-2">
          {(visitors.data ?? []).map((v) => (
            <Card key={v.id}><CardContent className="flex items-center justify-between p-3">
              <div>
                <div className="font-medium">{v.name} <span className="text-xs text-muted-foreground">({v.phone})</span></div>
                <div className="text-xs">Host: {(v as { students?: { full_name?: string } }).students?.full_name} · {v.purpose}</div>
                <Badge variant="secondary" className="mt-1">{v.status}</Badge>
              </div>
              <div className="flex gap-2">
                {v.status !== "CHECKED_IN" && v.status !== "CHECKED_OUT" && (
                  <Button size="sm" onClick={() => visMut.mutate({ visitor_id: v.id, direction: "IN" })}>
                    <LogIn className="h-4 w-4" /> Check IN
                  </Button>
                )}
                {v.status === "CHECKED_IN" && (
                  <Button size="sm" variant="outline" onClick={() => visMut.mutate({ visitor_id: v.id, direction: "OUT" })}>
                    <LogOut className="h-4 w-4" /> Check OUT
                  </Button>
                )}
              </div>
            </CardContent></Card>
          ))}
          {visitors.data?.length === 0 && <div className="text-sm text-muted-foreground p-6 text-center">No visitors.</div>}
        </TabsContent>

        <TabsContent value="feed">
          <div className="divide-y rounded border text-sm">
            {(events.data ?? []).map((ev) => {
              const evx = ev as typeof ev & { students?: { full_name?: string }; visitors?: { name?: string } };
              return (
                <div key={ev.id} className="p-2 flex justify-between">
                  <span>
                    <Badge variant={ev.direction === "IN" ? "secondary" : "outline"}>{ev.direction}</Badge>
                    <span className="ml-2">{evx.students?.full_name ?? evx.visitors?.name ?? "—"}</span>
                    {ev.is_late && <Badge variant="destructive" className="ml-2">LATE</Badge>}
                  </span>
                  <span className="text-xs text-muted-foreground">{new Date(ev.event_at).toLocaleString()}</span>
                </div>
              );
            })}
            {events.data?.length === 0 && <div className="p-6 text-center text-muted-foreground">No events yet.</div>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
