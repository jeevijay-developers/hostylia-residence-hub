import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  Building2,
  Calendar,
  Clock,
  CreditCard,
  FileText,
  Globe,
  Loader2,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  XCircle,
} from "lucide-react";

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
    <div className="space-y-6 max-w-4xl pb-10">
      {/* Page Header */}
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Operational settings for your property and billing details for your organization.
        </p>
      </div>

      {/* Tabs Container */}
      <Tabs defaultValue="property" className="space-y-6">
        <TabsList className="bg-card/80 border border-border/80 p-1.5 rounded-xl h-auto inline-flex w-full sm:w-auto gap-1">
          <TabsTrigger
            value="property"
            className="flex-1 sm:flex-initial data-[state=active]:bg-background data-[state=active]:text-amber-400 data-[state=active]:border-amber-500/80 data-[state=active]:shadow-md data-[state=active]:shadow-amber-500/10 border border-transparent text-muted-foreground font-semibold px-6 py-2.5 rounded-lg text-sm transition-all"
          >
            Property
          </TabsTrigger>
          <TabsTrigger
            value="organization"
            className="flex-1 sm:flex-initial data-[state=active]:bg-background data-[state=active]:text-amber-400 data-[state=active]:border-amber-500/80 data-[state=active]:shadow-md data-[state=active]:shadow-amber-500/10 border border-transparent text-muted-foreground font-semibold px-6 py-2.5 rounded-lg text-sm transition-all"
          >
            Organization
          </TabsTrigger>
          <TabsTrigger
            value="billing"
            className="flex-1 sm:flex-initial data-[state=active]:bg-background data-[state=active]:text-amber-400 data-[state=active]:border-amber-500/80 data-[state=active]:shadow-md data-[state=active]:shadow-amber-500/10 border border-transparent text-muted-foreground font-semibold px-6 py-2.5 rounded-lg text-sm transition-all"
          >
            Billing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="property" className="mt-0 focus-visible:outline-none">
          {propertyId ? (
            <PropertyForm propertyId={propertyId} />
          ) : (
            <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Pick a property from the switcher.
            </div>
          )}
        </TabsContent>
        <TabsContent value="organization" className="mt-0 focus-visible:outline-none">
          {tenantId ? (
            <OrgForm tenantId={tenantId} />
          ) : (
            <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Loading…
            </div>
          )}
        </TabsContent>
        <TabsContent value="billing" className="mt-0 focus-visible:outline-none">
          {tenantId ? (
            <BillingTab tenantId={tenantId} />
          ) : (
            <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Loading…
            </div>
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
    <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 space-y-6 max-w-2xl shadow-2xl">
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Property settings</h2>
        <p className="text-sm text-muted-foreground">Manage property level preferences and defaults.</p>
      </div>

      <div className="border-b border-border/60" />

      <div className="space-y-6">
        {/* Curfew time */}
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-1 shadow-sm shadow-amber-500/10">
            <Clock className="w-5 h-5" />
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            <Label className="text-foreground text-sm font-semibold">Curfew time</Label>
            <div className="relative">
              <Input
                type="time"
                value={curfewTime}
                onChange={(e) => setCurfewTime(e.target.value)}
                className="bg-background/90 border-border focus:border-amber-500 focus:ring-amber-500/30 text-foreground rounded-xl h-11 px-3.5 pr-10 text-sm font-medium"
              />
              <Clock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
            <p className="text-xs text-muted-foreground">Gate entries after this time flag as late.</p>
          </div>
        </div>

        {/* Timezone */}
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 mt-1 shadow-sm shadow-blue-500/10">
            <Globe className="w-5 h-5" />
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            <Label className="text-foreground text-sm font-semibold">Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="bg-background/90 border-border focus:border-blue-500 focus:ring-blue-500/30 text-foreground rounded-xl h-11 px-3.5 text-sm font-medium">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground">
                <SelectItem value="Asia/Kolkata">Asia/Kolkata</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
                <SelectItem value="America/New_York">America/New_York</SelectItem>
                <SelectItem value="Europe/London">Europe/London</SelectItem>
                <SelectItem value="Asia/Dubai">Asia/Dubai</SelectItem>
                <SelectItem value="Asia/Singapore">Asia/Singapore</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Default notification channel */}
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-1 shadow-sm shadow-emerald-500/10">
            <Bell className="w-5 h-5" />
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            <Label className="text-foreground text-sm font-semibold">Default notification channel</Label>
            <Select value={notifyPref} onValueChange={setNotifyPref}>
              <SelectTrigger className="bg-background/90 border-border focus:border-emerald-500 focus:ring-emerald-500/30 text-foreground rounded-xl h-11 px-3.5 text-sm font-medium">
                <SelectValue placeholder="Select channel" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground">
                <SelectItem value="IN_APP">IN_APP</SelectItem>
                <SelectItem value="SMS">SMS</SelectItem>
                <SelectItem value="WHATSAPP">WHATSAPP</SelectItem>
                <SelectItem value="EMAIL">EMAIL</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="w-full sm:w-auto bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold h-11 px-6 rounded-xl shadow-lg shadow-amber-500/20 border border-amber-300/40 transition-all duration-200 hover:shadow-amber-500/30 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
          ) : (
            <Save className="h-4 w-4 text-slate-950 stroke-[2.5]" />
          )}
          <span>{save.isPending ? "Saving…" : "Save changes"}</span>
        </Button>
      </div>
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

  if (!org) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        No organization record yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 space-y-6 max-w-2xl shadow-2xl">
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Organization settings</h2>
        <p className="text-sm text-muted-foreground">Manage legal entity details and billing contact information.</p>
      </div>

      <div className="border-b border-border/60" />

      <div className="space-y-6">
        {/* Legal name */}
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-1 shadow-sm shadow-indigo-500/10">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            <Label className="text-foreground text-sm font-semibold">Legal name</Label>
            <Input
              value={legal}
              onChange={(e) => setLegal(e.target.value)}
              placeholder="e.g. Hostylia Residency Pvt Ltd"
              className="bg-background/90 border-border focus:border-indigo-500 focus:ring-indigo-500/30 text-foreground rounded-xl h-11 px-3.5 text-sm font-medium"
            />
          </div>
        </div>

        {/* GSTIN */}
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 mt-1 shadow-sm shadow-cyan-500/10">
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            <Label className="text-foreground text-sm font-semibold">GSTIN</Label>
            <Input
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              placeholder="22AAAAA0000A1Z5"
              className="bg-background/90 border-border focus:border-cyan-500 focus:ring-cyan-500/30 text-foreground rounded-xl h-11 px-3.5 text-sm font-medium"
            />
          </div>
        </div>

        {/* Billing email */}
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0 mt-1 shadow-sm shadow-sky-500/10">
            <Mail className="w-5 h-5" />
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            <Label className="text-foreground text-sm font-semibold">Billing email</Label>
            <Input
              type="email"
              value={bEmail}
              onChange={(e) => setBEmail(e.target.value)}
              placeholder="billing@hostel.com"
              className="bg-background/90 border-border focus:border-sky-500 focus:ring-sky-500/30 text-foreground rounded-xl h-11 px-3.5 text-sm font-medium"
            />
          </div>
        </div>

        {/* Billing phone */}
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-1 shadow-sm shadow-emerald-500/10">
            <Phone className="w-5 h-5" />
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            <Label className="text-foreground text-sm font-semibold">Billing phone</Label>
            <Input
              value={bPhone}
              onChange={(e) => setBPhone(e.target.value)}
              placeholder="+91 9876543210"
              className="bg-background/90 border-border focus:border-emerald-500 focus:ring-emerald-500/30 text-foreground rounded-xl h-11 px-3.5 text-sm font-medium"
            />
          </div>
        </div>
      </div>

      <div className="pt-2">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="w-full sm:w-auto bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold h-11 px-6 rounded-xl shadow-lg shadow-amber-500/20 border border-amber-300/40 transition-all duration-200 hover:shadow-amber-500/30 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
          ) : (
            <Save className="h-4 w-4 text-slate-950 stroke-[2.5]" />
          )}
          <span>{save.isPending ? "Saving…" : "Save changes"}</span>
        </Button>
      </div>
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

  if (subQ.isLoading) return <Skeleton className="h-48 w-full max-w-2xl rounded-2xl" />;

  const sub = subQ.data;
  if (!sub) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        No subscription found for your organization.
      </div>
    );
  }

  const plan = sub.plans as { name: string; price_paise: number; billing_interval: string } | null;
  const effectivePrice = sub.custom_price_paise ?? plan?.price_paise ?? null;

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 space-y-6 max-w-2xl shadow-2xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-sm shadow-amber-500/10">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">{plan?.name ?? "Subscription Plan"}</h2>
            <p className="text-sm text-muted-foreground font-medium">
              {effectivePrice != null && plan
                ? `${formatInr(effectivePrice)} / ${plan.billing_interval?.toLowerCase()}`
                : "—"}
            </p>
          </div>
        </div>
        <Badge
          variant={sub.status === "ACTIVE" ? "default" : "secondary"}
          className="text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider"
        >
          {sub.status}
        </Badge>
      </div>

      <div className="border-b border-border/60" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/50 p-4">
          <div className="w-9 h-9 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Started Date</p>
            <p className="text-sm font-semibold text-foreground">
              {sub.starts_at ? new Date(sub.starts_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/50 p-4">
          <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Period Ends</p>
            <p className="text-sm font-semibold text-foreground">
              {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
            </p>
          </div>
        </div>
      </div>

      {sub.status === "ACTIVE" && (
        <div className="pt-2">
          <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)} className="rounded-xl px-4 py-2 text-xs font-semibold gap-2">
            <XCircle className="h-4 w-4" />
            Cancel subscription
          </Button>
        </div>
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
      <DialogContent className="sm:max-w-md bg-card border-border rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">Cancel subscription</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            We're sorry to see you go. Your feedback helps us improve Hostylia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-foreground">Why are you cancelling your subscription?</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as CancellationReason)}>
              <SelectTrigger className="bg-background border-border text-foreground rounded-xl">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground">
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
                className="bg-background border-border text-foreground rounded-xl mt-2"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Would you like to continue using Hostylia in the future?</Label>
            <RadioGroup
              value={continueInFuture}
              onValueChange={(v) => setContinueInFuture(v as "yes" | "no")}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="yes" id="continue-yes" />
                <Label htmlFor="continue-yes" className="font-normal text-foreground">
                  Yes
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="no" id="continue-no" />
                <Label htmlFor="continue-no" className="font-normal text-foreground">
                  No
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cancel-feedback" className="text-foreground">
              Additional feedback (optional)
            </Label>
            <Textarea
              id="cancel-feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              className="bg-background border-border text-foreground rounded-xl"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded-xl"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
            className="rounded-xl"
          >
            {cancel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirm Cancellation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

