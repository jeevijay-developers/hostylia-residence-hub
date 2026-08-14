import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, XCircle } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { useResolvedRole } from "@/lib/user-role";
import { usePropertyStore } from "@/stores/property-store";
import { updateOrganization, updatePropertySettings } from "@/lib/admin-staff.functions";
import { cancelMySubscription } from "@/lib/hostel.functions";
import { CANCELLATION_REASON_LABELS, cancellationReasonSchema } from "@/schemas/subscription";
import type { CancellationReason } from "@/schemas/subscription";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const { data: role } = useResolvedRole();
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  const tenantId = role?.tenantId ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Operational settings for your property and billing details for your organization."
      />
      <Tabs defaultValue="property">
        <TabsList>
          <TabsTrigger value="property">Property</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>
        <TabsContent value="property">
          {propertyId ? (
            <PropertyForm propertyId={propertyId} />
          ) : (
            <p className="text-sm text-muted-foreground">Pick a property from the switcher.</p>
          )}
        </TabsContent>
        <TabsContent value="organization">
          {tenantId ? (
            <OrgForm tenantId={tenantId} />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </TabsContent>
        <TabsContent value="billing">
          {tenantId ? (
            <BillingTab tenantId={tenantId} />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PropertyForm({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updatePropertySettings);
  const { data } = useQuery({
    queryKey: ["property-settings", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id,name,timezone,gender_policy,settings")
        .eq("id", propertyId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const [curfewTime, setCurfewTime] = useState("21:00");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [notifyPref, setNotifyPref] = useState("IN_APP");

  useEffect(() => {
    if (data) {
      const s = (data.settings as any) ?? {};
      setCurfewTime(s.curfew_time ?? "21:00");
      setTimezone(data.timezone ?? "Asia/Kolkata");
      setNotifyPref(s.notification_default ?? "IN_APP");
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          property_id: propertyId,
          settings: { curfew_time: curfewTime, notification_default: notifyPref, timezone },
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["property-settings", propertyId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="max-w-lg rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="space-y-1">
        <Label>Curfew time</Label>
        <Input type="time" value={curfewTime} onChange={(e) => setCurfewTime(e.target.value)} />
        <p className="text-xs text-muted-foreground">Gate entries after this time flag as late.</p>
      </div>
      <div className="space-y-1">
        <Label>Timezone</Label>
        <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Default notification channel</Label>
        <Input
          value={notifyPref}
          onChange={(e) => setNotifyPref(e.target.value)}
          placeholder="IN_APP"
        />
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {save.isPending ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

function OrgForm({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateOrganization);
  const { data: org } = useQuery({
    queryKey: ["organization", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id,legal_name,gstin,billing_email,billing_phone,registered_address")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [legal, setLegal] = useState("");
  const [gstin, setGstin] = useState("");
  const [bEmail, setBEmail] = useState("");
  const [bPhone, setBPhone] = useState("");

  useEffect(() => {
    if (org) {
      setLegal(org.legal_name ?? "");
      setGstin(org.gstin ?? "");
      setBEmail(org.billing_email ?? "");
      setBPhone(org.billing_phone ?? "");
    }
  }, [org]);

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          organization_id: org!.id,
          legal_name: legal || null,
          gstin: gstin || null,
          billing_email: bEmail || null,
          billing_phone: bPhone || null,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["organization", tenantId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  if (!org) return <p className="text-sm text-muted-foreground">No organization record yet.</p>;
  return (
    <div className="max-w-lg rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="space-y-1">
        <Label>Legal name</Label>
        <Input value={legal} onChange={(e) => setLegal(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>GSTIN</Label>
        <Input value={gstin} onChange={(e) => setGstin(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Billing email</Label>
        <Input type="email" value={bEmail} onChange={(e) => setBEmail(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Billing phone</Label>
        <Input value={bPhone} onChange={(e) => setBPhone(e.target.value)} />
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {save.isPending ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function BillingTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);

  const subQ = useQuery({
    queryKey: ["my-subscription", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select(
          "id,status,starts_at,current_period_end,custom_price_paise,plans(name,price_paise,billing_interval)",
        )
        .eq("tenant_id", tenantId)
        .in("status", ["TRIAL", "ACTIVE", "PAST_DUE", "PAUSED", "CANCELLED"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (subQ.isLoading) return <Skeleton className="h-48 w-full max-w-lg" />;

  const sub = subQ.data;
  if (!sub) {
    return (
      <p className="text-sm text-muted-foreground">No subscription found for your organization.</p>
    );
  }

  const plan = sub.plans as { name: string; price_paise: number; billing_interval: string } | null;
  const effectivePrice = sub.custom_price_paise ?? plan?.price_paise ?? null;

  return (
    <div className="max-w-lg space-y-4 rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold text-foreground">{plan?.name ?? "—"}</p>
          <p className="text-sm text-muted-foreground">
            {effectivePrice != null && plan
              ? `${formatInr(effectivePrice)} / ${plan.billing_interval?.toLowerCase()}`
              : "—"}
          </p>
        </div>
        <Badge variant={sub.status === "ACTIVE" ? "default" : "secondary"}>{sub.status}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Started</p>
          <p>{sub.starts_at ? new Date(sub.starts_at).toLocaleDateString() : "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Period ends</p>
          <p>
            {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "—"}
          </p>
        </div>
      </div>
      {sub.status === "ACTIVE" && (
        <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
          <XCircle className="h-4 w-4" />
          Cancel subscription
        </Button>
      )}

      <CancelSubscriptionDialog
        open={cancelOpen}
        tenantId={tenantId}
        onClose={() => setCancelOpen(false)}
        onCancelled={() => {
          qc.invalidateQueries({ queryKey: ["my-subscription", tenantId] });
        }}
      />
    </div>
  );
}

function CancelSubscriptionDialog({
  open,
  tenantId,
  onClose,
  onCancelled,
}: {
  open: boolean;
  tenantId: string;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const cancelFn = useServerFn(cancelMySubscription);

  const [reason, setReason] = useState<CancellationReason | "">("");
  const [reasonOther, setReasonOther] = useState("");
  const [continueInFuture, setContinueInFuture] = useState<"yes" | "no" | "">("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setReason("");
    setReasonOther("");
    setContinueInFuture("");
    setFeedback("");
    setError(null);
  }

  const cancel = useMutation({
    mutationFn: () => {
      const parsed = cancellationReasonSchema.safeParse(reason);
      if (!parsed.success) throw new Error("Please select a reason");
      if (reason === "OTHER" && !reasonOther.trim()) {
        throw new Error("Please describe your reason");
      }
      if (continueInFuture === "") throw new Error("Please answer the future-use question");
      return cancelFn({
        data: {
          tenant_id: tenantId,
          cancellation_reason: parsed.data,
          cancellation_reason_other: reasonOther.trim() || undefined,
          continue_in_future: continueInFuture === "yes",
          additional_feedback: feedback.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Subscription cancelled");
      reset();
      onCancelled();
      onClose();
    },
    onError: (e) => setError(getErrorMessage(e, "Could not cancel subscription")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel subscription</DialogTitle>
          <DialogDescription>
            We're sorry to see you go. Your feedback helps us improve Hostylia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Why are you cancelling your subscription?</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as CancellationReason)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CANCELLATION_REASON_LABELS) as CancellationReason[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {CANCELLATION_REASON_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reason === "OTHER" && (
              <Input
                placeholder="Tell us more"
                value={reasonOther}
                onChange={(e) => setReasonOther(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Would you like to continue using Hostylia in the future?</Label>
            <RadioGroup
              value={continueInFuture}
              onValueChange={(v) => setContinueInFuture(v as "yes" | "no")}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="yes" id="continue-yes" />
                <Label htmlFor="continue-yes" className="font-normal">
                  Yes
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="no" id="continue-no" />
                <Label htmlFor="continue-no" className="font-normal">
                  No
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cancel-feedback">Additional feedback (optional)</Label>
            <Textarea
              id="cancel-feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirm Cancellation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
