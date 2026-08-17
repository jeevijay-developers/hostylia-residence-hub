import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import QRCode from "qrcode";
import { useServerFn } from "@tanstack/react-start";
import { Key, Loader2, ListChecks, Send, Shield, SquarePen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { createGatePass, reissueGatePassQrToken } from "@/lib/operations.functions";
import { useKycComplete } from "@/lib/kyc";
import { KycGateNotice } from "@/components/students/KycGateNotice";

export const Route = createFileRoute("/_authenticated/student/gate-pass")({
  component: StudentGatePassPage,
});

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
  const [outDate, setOutDate] = useState("");
  const [outTime, setOutTime] = useState("");
  const [inDate, setInDate] = useState("");
  const [inTime, setInTime] = useState("");
  const outAt = outDate && outTime ? `${outDate}T${outTime}` : "";
  const inAt = inDate && inTime ? `${inDate}T${inTime}` : "";
  const { complete: kycComplete } = useKycComplete(studentQ.data?.id);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!studentQ.data?.id) throw new Error("Student profile missing");
      // A pass starts PENDING_WARDEN/PENDING_PARENT — not yet scannable, so
      // this placeholder hash is never actually shown; PassCard issues the
      // real, retrievable-from-any-device token once the pass is approved.
      const token = randomHex(24);
      const hash = await sha256Hex(token);
      const res = await create({ data: {
        student_id: studentQ.data.id, reason, destination,
        out_at: new Date(outAt).toISOString(), expected_in_at: new Date(inAt).toISOString(),
        qr_token_hash: hash,
      } });
      return res as unknown as { id: string };
    },
    onSuccess: () => {
      toast.success("Requested");
      setReason(""); setDestination("");
      setOutDate(""); setOutTime(""); setInDate(""); setInTime("");
      qc.invalidateQueries({ queryKey: ["my-passes"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <SquarePen className="h-4 w-4" />
            </span>
            New Request
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Input placeholder="Destination" value={destination} onChange={(e) => setDestination(e.target.value)} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Going out — date</label>
              <Input type="date" value={outDate} onChange={(e) => setOutDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Going out — time</label>
              <Input type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Expected back — date</label>
              <Input type="date" value={inDate} onChange={(e) => setInDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Expected back — time</label>
              <Input type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} />
            </div>
          </div>
          {(!reason || !outAt || !inAt) && (
            <p className="text-xs text-muted-foreground">
              {!reason
                ? "Enter a reason to continue."
                : "Fill in both the date and time for \"Going out\" and \"Expected back\" — the Request button unlocks once all four are set."}
            </p>
          )}
          {!kycComplete && <KycGateNotice message="Complete your KYC to request a gate pass." />}
          <Button
            className="rounded-full"
            onClick={() => createMut.mutate()}
            disabled={!kycComplete || createMut.isPending || !reason || !outAt || !inAt}
          >
            {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Request
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <ListChecks className="h-4 w-4" />
          </span>
          My Passes
        </div>
        {(passesQ.data ?? []).map((p) => <PassCard key={p.id} pass={p} />)}
        {passesQ.data?.length === 0 && <div className="text-sm text-muted-foreground p-4 text-center">No passes yet.</div>}
      </div>
    </div>
  );
}

const PENDING_STATUSES = ["PENDING_WARDEN", "PENDING_PARENT"];
const PASS_STATUS_TONE: Record<string, string> = {
  APPROVED: "bg-info text-info-foreground",
  ACTIVE: "bg-success text-success-foreground",
};

function PassCard({ pass }: { pass: { id: string; pass_number: string; status: string; reason: string; out_at: string; expected_in_at: string } }) {
  const reissue = useServerFn(reissueGatePassQrToken);
  const scannable = pass.status === "APPROVED" || pass.status === "ACTIVE";

  // Issues a fresh token + QR on demand from the backend rather than reading
  // one out of localStorage — works from any device/browser once logged in.
  // staleTime/gcTime: Infinity means this only rotates the token once per
  // (pass, page load), not on every re-render.
  const qrQ = useQuery({
    queryKey: ["gate-pass-qr", pass.id],
    enabled: scannable,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const token = randomHex(24);
      const hash = await sha256Hex(token);
      await reissue({ data: { pass_id: pass.id, qr_token_hash: hash } });
      const dataUrl = await QRCode.toDataURL(JSON.stringify({ id: pass.id, t: token }));
      return { dataUrl, token };
    },
  });

  return (
    <Card className="overflow-hidden"><CardContent className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-foreground">{pass.pass_number}</div>
          <div className="text-xs text-muted-foreground">{pass.reason} · {new Date(pass.out_at).toLocaleString()} → {new Date(pass.expected_in_at).toLocaleString()}</div>
        </div>
        <Badge className={PASS_STATUS_TONE[pass.status] ?? ""} variant={PASS_STATUS_TONE[pass.status] ? undefined : "secondary"}>
          {PENDING_STATUSES.includes(pass.status) ? "Pending" : pass.status}
        </Badge>
      </div>
      {scannable && qrQ.isLoading && (
        <p className="text-xs text-muted-foreground">Preparing QR…</p>
      )}
      {scannable && qrQ.isError && (
        <div className="space-y-1">
          <p className="text-xs text-destructive">Could not load QR.</p>
          <Button size="sm" variant="outline" onClick={() => qrQ.refetch()}>Retry</Button>
        </div>
      )}
      {qrQ.data && (
        <div className="flex items-start gap-3">
          <img src={qrQ.data.dataUrl} alt="Gate pass QR" className="h-28 w-28 shrink-0 rounded-md" />
          <div className="min-w-0 space-y-1 text-xs">
            <div className="flex items-center gap-1.5 text-info">
              <Key className="h-3.5 w-3.5 shrink-0" />
              <span className="break-all font-mono text-foreground">{pass.id}</span>
            </div>
            <div className="flex items-center gap-1.5 text-info">
              <Shield className="h-3.5 w-3.5 shrink-0" />
              <span className="break-all font-mono text-foreground">{qrQ.data.token}</span>
            </div>
          </div>
        </div>
      )}
    </CardContent></Card>
  );
}
