import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import QRCode from "qrcode";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Clock, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { useStudentPermissions } from "@/lib/staff-scope";
import { StudentModuleGuard } from "@/components/dashboard/RoleGuard";
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
  const { can } = useStudentPermissions();
  const canWrite = can("gate_passes", "edit");

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
  const outDateInputRef = useRef<HTMLInputElement>(null);
  const inDateInputRef = useRef<HTMLInputElement>(null);
  const outTimeInputRef = useRef<HTMLInputElement>(null);
  const inTimeInputRef = useRef<HTMLInputElement>(null);
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
    <StudentModuleGuard module="gate_passes">
      <div className="space-y-4 p-4">
        {canWrite && (
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="border-b border-border/60 pb-3 text-sm font-semibold text-foreground">
              New Request
            </h2>
            <div className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <label className="text-sm text-foreground">
                  Reason <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="Enter a reason to continue"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-foreground">Destination (optional)</label>
                <Input
                  placeholder="e.g. Home, Market"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="min-w-0 space-y-1.5">
                  <label className="text-sm text-foreground">Going out — date</label>
                  <div className="relative">
                    <Input
                      ref={outDateInputRef}
                      type="date"
                      value={outDate}
                      onChange={(e) => setOutDate(e.target.value)}
                      className="pr-8 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden"
                    />
                    <button
                      type="button"
                      onClick={() => outDateInputRef.current?.showPicker?.()}
                      aria-label="Open date picker"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <CalendarDays className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <label className="text-sm text-foreground">Going out — time</label>
                  <div className="relative">
                    <Input
                      ref={outTimeInputRef}
                      type="time"
                      value={outTime}
                      onChange={(e) => setOutTime(e.target.value)}
                      className="pr-8 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden"
                    />
                    <button
                      type="button"
                      onClick={() => outTimeInputRef.current?.showPicker?.()}
                      aria-label="Open time picker"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <Clock className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <label className="text-sm text-foreground">Expected back — date</label>
                  <div className="relative">
                    <Input
                      ref={inDateInputRef}
                      type="date"
                      value={inDate}
                      onChange={(e) => setInDate(e.target.value)}
                      className="pr-8 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden"
                    />
                    <button
                      type="button"
                      onClick={() => inDateInputRef.current?.showPicker?.()}
                      aria-label="Open date picker"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <CalendarDays className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <label className="text-sm text-foreground">Expected back — time</label>
                  <div className="relative">
                    <Input
                      ref={inTimeInputRef}
                      type="time"
                      value={inTime}
                      onChange={(e) => setInTime(e.target.value)}
                      className="pr-8 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden"
                    />
                    <button
                      type="button"
                      onClick={() => inTimeInputRef.current?.showPicker?.()}
                      aria-label="Open time picker"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <Clock className="h-4 w-4" />
                    </button>
                  </div>
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
                className="w-full rounded-full"
                size="lg"
                onClick={() => createMut.mutate()}
                disabled={!kycComplete || createMut.isPending || !reason || !outAt || !inAt}
              >
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Request Pass
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">My Passes</h2>
          {(passesQ.data ?? []).map((p) => <PassCard key={p.id} pass={p} canWrite={canWrite} />)}
          {passesQ.data?.length === 0 && <div className="text-sm text-muted-foreground p-4 text-center">No passes yet.</div>}
        </div>
      </div>
    </StudentModuleGuard>
  );
}

const PENDING_STATUSES = ["PENDING_WARDEN", "PENDING_PARENT"];
const PASS_STATUS_TONE: Record<string, string> = {
  APPROVED: "bg-info text-info-foreground",
  ACTIVE: "bg-success text-success-foreground",
};

function PassCard({
  pass,
  canWrite,
}: {
  pass: {
    id: string;
    pass_number: string;
    status: string;
    reason: string;
    destination: string | null;
    out_at: string;
    expected_in_at: string;
  };
  canWrite: boolean;
}) {
  const reissue = useServerFn(reissueGatePassQrToken);
  const scannable = canWrite && (pass.status === "APPROVED" || pass.status === "ACTIVE");

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
    <div className="space-y-3 rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-foreground">{pass.pass_number}</div>
          <div className="text-sm text-muted-foreground">{pass.reason}</div>
        </div>
        <Badge className={PASS_STATUS_TONE[pass.status] ?? ""} variant={PASS_STATUS_TONE[pass.status] ? undefined : "secondary"}>
          {PENDING_STATUSES.includes(pass.status) ? "Pending" : pass.status}
        </Badge>
      </div>

      <div className="space-y-0.5 border-t border-border/60 pt-3 text-sm text-muted-foreground">
        <p>
          Out: {new Date(pass.out_at).toLocaleString()} → In: {new Date(pass.expected_in_at).toLocaleString()}
        </p>
        {pass.destination && <p>To: {pass.destination}</p>}
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
        <div className="space-y-2">
          <div className="mx-auto grid max-w-xs place-items-center rounded-2xl bg-white p-4">
            <img src={qrQ.data.dataUrl} alt="Gate pass QR" className="h-full w-full rounded-lg" />
          </div>
          <p className="text-center text-xs text-muted-foreground">Show this QR at the gate</p>
        </div>
      )}
    </div>
  );
}
