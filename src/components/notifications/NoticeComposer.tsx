import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { publishNotice, cancelNotice } from "@/lib/notice.functions";
import { useTenantNotices, type NoticeRow } from "@/lib/notifications";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const CHANNELS = [
  { key: "IN_APP", label: "In-app" },
  { key: "SMS", label: "SMS" },
  { key: "WHATSAPP", label: "WhatsApp" },
  { key: "EMAIL", label: "Email" },
] as const;

const AUDIENCES = ["ALL", "STUDENTS", "PARENTS", "WARDENS", "ACCOUNTANTS"] as const;

interface Props {
  propertyId: string;
}

export function NoticeComposer({ propertyId }: Props) {
  const qc = useQueryClient();
  const publishFn = useServerFn(publishNotice);
  const cancelFn = useServerFn(cancelNotice);

  // Provider config surface — currently the platform has no Twilio secrets; hard-code false.
  // A future settings page can expose /rest/v1/rpc('provider_status') to flip this live.
  const providerConfigured = { SMS: false, WHATSAPP: false, EMAIL: false, IN_APP: true };

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"NORMAL" | "IMPORTANT" | "URGENT">("NORMAL");
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]>("ALL");
  const [channels, setChannels] = useState<string[]>(["IN_APP"]);
  const [publishAt, setPublishAt] = useState("");

  const tenantId = usePropertyTenantId(propertyId);
  const { data: notices = [] } = useTenantNotices(tenantId, propertyId);

  const publish = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Tenant unresolved");
      return publishFn({
        data: {
          tenant_id: tenantId,
          property_id: propertyId,
          title,
          body,
          priority,
          audience_type: audience,
          channels: channels as ("IN_APP" | "SMS" | "WHATSAPP" | "EMAIL")[],
          publish_at: publishAt || null,
          publish_now: !publishAt,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`Notice created${r.dispatched ? ` — ${r.dispatched} notification(s) dispatched` : ""}`);
      setTitle(""); setBody(""); setPublishAt("");
      qc.invalidateQueries({ queryKey: ["notices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = title.trim().length >= 3 && body.trim().length >= 3 && channels.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="p-4">
        <h2 className="mb-4 font-semibold">Compose notice</h2>
        <div className="space-y-3">
          <div>
            <Label htmlFor="notice-title">Title</Label>
            <Input id="notice-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label htmlFor="notice-body">Body</Label>
            <Textarea id="notice-body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="IMPORTANT">Important</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Audience</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as typeof audience)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Channels</Label>
            <TooltipProvider>
              <div className="mt-1 flex flex-wrap gap-2">
                {CHANNELS.map((c) => {
                  const enabled = providerConfigured[c.key as keyof typeof providerConfigured];
                  const selected = channels.includes(c.key);
                  const button = (
                    <Button
                      key={c.key}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      disabled={!enabled && c.key !== "IN_APP"}
                      onClick={() =>
                        setChannels((prev) =>
                          prev.includes(c.key) ? prev.filter((x) => x !== c.key) : [...prev, c.key],
                        )
                      }
                    >
                      {c.label}
                    </Button>
                  );
                  return !enabled ? (
                    <Tooltip key={c.key}>
                      <TooltipTrigger asChild><span>{button}</span></TooltipTrigger>
                      <TooltipContent>Provider not configured. Add Twilio/Resend secrets to enable.</TooltipContent>
                    </Tooltip>
                  ) : button;
                })}
              </div>
            </TooltipProvider>
          </div>
          <div>
            <Label htmlFor="notice-schedule">Schedule (optional)</Label>
            <Input
              id="notice-schedule"
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value ? new Date(e.target.value).toISOString() : "")}
            />
          </div>
          <Button onClick={() => publish.mutate()} disabled={!canSubmit || publish.isPending} className="w-full">
            {publishAt ? "Schedule notice" : "Publish now"}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-4 font-semibold">Recent notices</h2>
        {notices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notices yet.</p>
        ) : (
          <ul className="space-y-3">
            {notices.slice(0, 10).map((n: NoticeRow) => (
              <li key={n.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {n.audience_type} · {n.channels.join(", ")}
                    </p>
                  </div>
                  <Badge variant={n.status === "PUBLISHED" ? "default" : "secondary"}>{n.status}</Badge>
                </div>
                {(n.status === "DRAFT" || n.status === "SCHEDULED") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={async () => {
                      await cancelFn({ data: { notice_id: n.id } });
                      qc.invalidateQueries({ queryKey: ["notices"] });
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function usePropertyTenantId(propertyId: string | null | undefined): string | null {
  const q = useQuery({
    queryKey: ["property-tenant", propertyId],
    enabled: !!propertyId,
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("tenant_id")
        .eq("id", propertyId!)
        .maybeSingle();
      return data?.tenant_id ?? null;
    },
  });
  return useMemo(() => q.data ?? null, [q.data]);
}
