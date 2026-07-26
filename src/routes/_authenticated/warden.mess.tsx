import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useResolvedRole } from "@/lib/user-role";
import { useMyStaffProperty } from "@/lib/staff-scope";
import { useMessMenusForDate } from "@/lib/ops";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/warden/mess")({
  component: WardenMessPage,
});

const MEALS = ["BREAKFAST", "LUNCH", "SNACKS", "DINNER"] as const;

function WardenMessPage() {
  const role = useResolvedRole();
  const propQ = useMyStaffProperty(role.data?.userId);
  const propertyId = propQ.data ?? null;
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const menusQ = useMessMenusForDate(propertyId, date);
  const qc = useQueryClient();
  const [meal, setMeal] = useState<(typeof MEALS)[number]>("BREAKFAST");
  const [title, setTitle] = useState("");
  const [items, setItems] = useState("");

  const createMut = useMutation({
    mutationFn: async () => {
      if (!propertyId) return;
      const { data: prop } = await supabase.from("properties").select("tenant_id").eq("id", propertyId).single();
      const { data: menu, error } = await supabase.from("mess_menus").insert({
        tenant_id: prop!.tenant_id, property_id: propertyId, menu_date: date, meal, title,
        status: "PUBLISHED", published_at: new Date().toISOString(),
      }).select("id").single();
      if (error) throw error;
      const itemRows = items.split("\n").map((s) => s.trim()).filter(Boolean).map((name, i) => ({
        tenant_id: prop!.tenant_id, property_id: propertyId, mess_menu_id: menu.id,
        item_name: name, display_order: i,
      }));
      if (itemRows.length) await supabase.from("mess_menu_items").insert(itemRows);
    },
    onSuccess: () => { toast.success("Published"); setTitle(""); setItems(""); qc.invalidateQueries({ queryKey: ["mess-menus"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const feedbackQ = useQuery({
    queryKey: ["mess-feedback-summary", propertyId, date],
    enabled: !!propertyId,
    queryFn: async () => {
      const menuIds = (menusQ.data ?? []).map((m) => m.id);
      if (!menuIds.length) return [];
      const { data } = await supabase.from("mess_feedback").select("mess_menu_id, rating, comment").in("mess_menu_id", menuIds);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Mess" description="Publish menu, capture headcount, view feedback." />
      <div className="flex items-center gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Publish Menu</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Select value={meal} onValueChange={(v) => setMeal(v as typeof meal)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{MEALS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <Textarea placeholder="One item per line" value={items} onChange={(e) => setItems(e.target.value)} rows={4} />
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !items.trim()}>
            <Send className="h-4 w-4" /> Publish
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="text-sm font-medium">Today's Menus</div>
        {(menusQ.data ?? []).map((m) => {
          const fb = (feedbackQ.data ?? []).filter((f) => f.mess_menu_id === m.id);
          const avg = fb.length ? (fb.reduce((s, f) => s + f.rating, 0) / fb.length).toFixed(1) : "—";
          const mx = m as typeof m & { mess_menu_items?: Array<{ item_name: string }> };
          return (
            <Card key={m.id}><CardContent className="p-3">
              <div className="flex justify-between">
                <div className="font-medium">{m.meal} {m.title ? `— ${m.title}` : ""}</div>
                <Badge variant="secondary">⭐ {avg} ({fb.length})</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {(mx.mess_menu_items ?? []).map((i) => i.item_name).join(", ")}
              </div>
            </CardContent></Card>
          );
        })}
        {menusQ.data?.length === 0 && <div className="text-sm text-muted-foreground p-4 text-center">No menus for this date.</div>}
      </div>
    </div>
  );
}
