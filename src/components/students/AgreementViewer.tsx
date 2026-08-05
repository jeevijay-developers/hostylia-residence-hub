import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Clock, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { acceptAgreementClickwrap } from "@/lib/student.functions";

interface Props {
  studentId: string;
  /** Admin/staff view: status only, no document text or accept control —
   * signing is a student-side action from their own portal. */
  readOnly?: boolean;
  /** Fires after a successful accept, e.g. so a parent gate can re-check status. */
  onAccepted?: () => void;
}

const AGREEMENT_TEXT = `HOSTYLIA STANDARD BOARDING AGREEMENT (v1)

By clicking Accept, you agree to abide by the hostel's code of conduct,
rent schedule, notice period, security deposit terms, and grievance
procedures as published by the property. This is a click-wrap acceptance
recorded with your IP address and timestamp as legal evidence.`;

// FNV-1a hash for a stable, lightweight document fingerprint (not crypto).
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function AgreementViewer({ studentId, readOnly = false, onAccepted }: Props) {
  const [checked, setChecked] = useState(false);
  const acceptFn = useServerFn(acceptAgreementClickwrap);

  const agreementQ = useQuery({
    queryKey: ["student-agreement", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("agreements")
        .select("id, status, signed_at, signature_evidence, template_version")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const hash = useMemo(() => fnv1a(AGREEMENT_TEXT), []);

  const accept = useMutation({
    mutationFn: async () => {
      if (!agreementQ.data?.id) throw new Error("No agreement");
      await acceptFn({ data: { agreement_id: agreementQ.data.id, document_hash: hash } });
    },
    onSuccess: () => {
      toast.success("Agreement accepted");
      agreementQ.refetch();
      onAccepted?.();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!agreementQ.data) {
    return (
      <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        No agreement created yet — allocate a bed to generate one.
      </p>
    );
  }

  const signed = agreementQ.data.status === "SIGNED";

  if (readOnly) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
        <h3 className="font-display text-base font-semibold">Boarding agreement</h3>
        {signed ? (
          <span className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-1.5 text-sm font-medium text-success">
            <ShieldCheck className="h-4 w-4" />
            Completed — signed {new Date(agreementQ.data.signed_at ?? "").toLocaleDateString()}
          </span>
        ) : (
          <span className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-1.5 text-sm font-medium text-warning">
            <Clock className="h-4 w-4" />
            Pending — awaiting student acceptance
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold">Boarding agreement</h3>
        <span className="text-xs text-muted-foreground">
          Template {agreementQ.data.template_version}
        </span>
      </div>
      <pre className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-foreground">
        {AGREEMENT_TEXT}
      </pre>
      {signed ? (
        <div className="flex items-center gap-2 rounded-md bg-bed-occupied/10 p-3 text-sm text-bed-occupied">
          <ShieldCheck className="h-5 w-5" />
          Signed on {new Date(agreementQ.data.signed_at ?? "").toLocaleString()} via click-wrap.
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={checked} onCheckedChange={(v) => setChecked(!!v)} className="mt-1" />
            <span>
              I have read and accept the agreement. I understand my IP address and timestamp
              will be recorded as proof of consent.
            </span>
          </label>
          <Button
            className="min-h-11"
            disabled={!checked || accept.isPending}
            onClick={() => accept.mutate()}
          >
            Accept agreement
          </Button>
        </div>
      )}
    </div>
  );
}
