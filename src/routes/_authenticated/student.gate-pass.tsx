import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import QRCode from "qrcode";
import { useServerFn } from "@tanstack/react-start";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { createGatePass } from "@/lib/operations.functions";

export const Route = createFileRoute("/_authenticated/student/gate-pass")({
  component: StudentGatePassPage,
});

const TOKEN_STORE_KEY = "hostylia.gate-tokens";
function loadTokens(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(TOKEN_STORE_KEY) ?? "{}"); } catch { return {}; }
}
function saveToken(passId: string, token: string) {
  const t = loadTokens(); t[passId] = token;
  localStorage.setItem(TOKEN_STORE_KEY, JSON.stringify(t));
}
function randomHex(len = 24): string {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function StudentGatePassPage() {
  const role = useResolvedRole();
  const uid = role.data?.userId ?? null;
  const qc = useQueryClient();
  const create = useServerFn(createGatePass);

  const studentQ = useQuery({
    queryKey: ["me-student", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id").eq("profile_id", uid!).maybeSingle();
      return data;
    },
  });

  const passesQ = useQuery({
    queryKey: ["my-passes", studentQ.data?.id],
    enabled: !!studentQ.data?.id,
    queryFn: async () => {
      const { data } = await supabase.from("gate_passes").select("*")
        .eq("student_id", studentQ.data!.id).is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  const [reason, setReason] = useState("");
  const [destination, setDestination] = useState("");
  const [outAt, setOutAt] = useState("");
  const [inAt, setInAt] = useState("");

  const createMut = useMutation({
    mutationFn: async () => {
      if (!studentQ.data?.id) throw new Error("Student profile missing");
      const token = randomHex(24);
      const hash = await sha256Hex(token);
      const res = await create({ data: {
        student_id: studentQ.data.id, reason, destination,
        out_at: new Date(outAt).toISOString(), expected_in_at: new Date(inAt).toISOString(),
        qr_token_hash: hash,
      } });
      const pass = res as unknown as { id: string };
      saveToken(pass.id, token);
      return pass;
    },
    onSuccess: () => { toast.success("Requested"); setReason(""); setDestination(""); setOutAt(""); setInAt(""); qc.invalidateQueries({ queryKey: ["my-passes"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Gate Pass" description="Request a pass and show your QR at the gate." />
      <Card>
        <CardHeader><CardTitle className="text-base">New Request</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Input placeholder="Destination" value={destination} onChange={(e) => setDestination(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input type="datetime-local" value={outAt} onChange={(e) => setOutAt(e.target.value)} />
            <Input type="datetime-local" value={inAt} onChange={(e) => setInAt(e.target.value)} />
          </div>
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !reason || !outAt || !inAt}>Request</Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="text-sm font-medium">My Passes</div>
        {(passesQ.data ?? []).map((p) => <PassCard key={p.id} pass={p} />)}
        {passesQ.data?.length === 0 && <div className="text-sm text-muted-foreground p-4 text-center">No passes yet.</div>}
      </div>
    </div>
  );
}

function PassCard({ pass }: { pass: { id: string; pass_number: string; status: string; reason: string; out_at: string; expected_in_at: string } }) {
  const [qr, setQr] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const t = loadTokens()[pass.id];
    if (!t) return;
    setToken(t);
    if (pass.status === "APPROVED" || pass.status === "ACTIVE") {
      QRCode.toDataURL(JSON.stringify({ id: pass.id, t })).then(setQr).catch(() => null);
    }
  }, [pass.id, pass.status]);
  return (
    <Card><CardContent className="p-3 space-y-2">
      <div className="flex justify-between">
        <div>
          <div className="font-medium">{pass.pass_number}</div>
          <div className="text-xs text-muted-foreground">{pass.reason} · {new Date(pass.out_at).toLocaleString()} → {new Date(pass.expected_in_at).toLocaleString()}</div>
        </div>
        <Badge variant="secondary">{pass.status}</Badge>
      </div>
      {qr && (
        <div className="flex items-center gap-3">
          <img src={qr} alt="Gate pass QR" className="h-32 w-32" />
          <div className="text-xs break-all font-mono">
            <div>Pass: {pass.id}</div>
            <div>Token: {token}</div>
          </div>
        </div>
      )}
      {!token && pass.status === "APPROVED" && (
        <p className="text-xs text-muted-foreground">QR unavailable on this device (token was stored on the device where you created the pass).</p>
      )}
    </CardContent></Card>
  );
}
