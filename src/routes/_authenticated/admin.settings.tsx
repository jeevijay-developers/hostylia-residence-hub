import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { usePropertyStore } from "@/stores/property-store";
import { updateOrganization, updatePropertySettings } from "@/lib/admin-staff.functions";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const { data: role } = useResolvedRole();
  const propertyId = usePropertyStore((s) => s.activePropertyId);
  const tenantId = role?.tenantId ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Operational settings for your property and billing details for your organization." />
      <Tabs defaultValue="property">
        <TabsList>
          <TabsTrigger value="property">Property</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
        </TabsList>
        <TabsContent value="property">
          {propertyId ? (
            <PropertyForm propertyId={propertyId} />
          ) : (
            <p className="text-sm text-muted-foreground">Pick a property from the switcher.</p>
          )}
        </TabsContent>
        <TabsContent value="organization">
          {tenantId ? <OrgForm tenantId={tenantId} /> : <p className="text-sm text-muted-foreground">Loading…</p>}
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
      const { data, error } = await supabase.from("properties").select("id,name,timezone,gender_policy,settings").eq("id", propertyId).single();
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
        <Input value={notifyPref} onChange={(e) => setNotifyPref(e.target.value)} placeholder="IN_APP" />
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
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
      <div className="space-y-1"><Label>Legal name</Label><Input value={legal} onChange={(e) => setLegal(e.target.value)} /></div>
      <div className="space-y-1"><Label>GSTIN</Label><Input value={gstin} onChange={(e) => setGstin(e.target.value)} /></div>
      <div className="space-y-1"><Label>Billing email</Label><Input type="email" value={bEmail} onChange={(e) => setBEmail(e.target.value)} /></div>
      <div className="space-y-1"><Label>Billing phone</Label><Input value={bPhone} onChange={(e) => setBPhone(e.target.value)} /></div>
      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {save.isPending ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
