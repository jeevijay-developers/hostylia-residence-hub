import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, MessageCircle, Pencil, Send, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useResolvedRole } from "@/lib/user-role";
import { useMyStaffProperty } from "@/lib/staff-scope";
import {
  useMessMenusForDate,
  useStudentsInProperty,
  type MessMenuRow,
  type MessMenuItemRow,
  type MessHeadcountRow,
} from "@/lib/ops";
import { supabase } from "@/integrations/supabase/client";
import { messMenuFormSchema } from "@/schemas/mess";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/warden/mess")({
  component: WardenMessPage,
});

const MEALS = ["BREAKFAST", "LUNCH", "SNACKS", "DINNER"] as const;

type MenuWithChildren = MessMenuRow & {
  mess_menu_items?: MessMenuItemRow[];
  mess_headcounts?: MessHeadcountRow[];
};

type FeedbackRow = {
  mess_menu_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  student_id: string;
  students: { full_name: string } | null;
};

function formatServeTime(t: string | null | undefined): string {
  if (!t) return "Time not set";
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return "Time not set";
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr ?? "00"} ${ampm}`;
}

function itemsToText(items: MessMenuItemRow[] | undefined): string {
  return [...(items ?? [])]
    .sort((a, b) => a.display_order - b.display_order)
    .map((i) => i.item_name)
    .join("\n");
}

const DUPLICATE_MENU_MESSAGE =
  "A menu for this meal already exists on this date. Edit the existing one instead.";

function WardenMessPage() {
  const role = useResolvedRole();
  const userId = role.data?.userId ?? null;
  const propQ = useMyStaffProperty(userId);
  const propertyId = propQ.data ?? null;
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const menusQ = useMessMenusForDate(propertyId, date);
  const studentsQ = useStudentsInProperty(propertyId);
  const qc = useQueryClient();
  const [meal, setMeal] = useState<(typeof MEALS)[number]>("BREAKFAST");
  const [title, setTitle] = useState("");
  const [items, setItems] = useState("");
  const [serveTime, setServeTime] = useState("");

  const propertyQ = useQuery({
    queryKey: ["mess-property-tenant", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("tenant_id")
        .eq("id", propertyId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const tenantId = propertyQ.data?.tenant_id ?? null;

  const createMut = useMutation({
    mutationFn: async () => {
      if (!propertyId || !tenantId) throw new Error("No property scope found");
      const { data: menu, error } = await supabase
        .from("mess_menus")
        .insert({
          tenant_id: tenantId,
          property_id: propertyId,
          menu_date: date,
          meal,
          title: title || null,
          serve_time: serveTime || null,
          status: "PUBLISHED",
          published_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;
      const itemRows = items
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name, i) => ({
          tenant_id: tenantId,
          property_id: propertyId,
          mess_menu_id: menu.id,
          item_name: name,
          display_order: i,
        }));
      if (itemRows.length) await supabase.from("mess_menu_items").insert(itemRows);
    },
    onSuccess: () => {
      toast.success("Published");
      setTitle("");
      setItems("");
      setServeTime("");
      qc.invalidateQueries({ queryKey: ["mess-menus"] });
    },
    onError: (e) =>
      toast.error(getErrorMessage(e, "Failed to publish menu", DUPLICATE_MENU_MESSAGE)),
  });

  const feedbackQ = useQuery({
    queryKey: [
      "mess-feedback-summary",
      propertyId,
      date,
      (menusQ.data ?? []).map((m) => m.id).join(","),
    ],
    enabled: !!propertyId && !!menusQ.data,
    queryFn: async (): Promise<FeedbackRow[]> => {
      const menuIds = (menusQ.data ?? []).map((m) => m.id);
      if (!menuIds.length) return [];
      const { data } = await supabase
        .from("mess_feedback")
        .select("mess_menu_id, rating, comment, created_at, student_id, students(full_name)")
        .in("mess_menu_id", menuIds);
      return (data ?? []) as unknown as FeedbackRow[];
    },
  });

  const activeStudentCount = studentsQ.data?.length ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Mess" description="Publish menu, capture headcount, view feedback." />
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Publish Menu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Select value={meal} onValueChange={(v) => setMeal(v as typeof meal)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEALS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 min-w-[10rem]"
            />
            <Input
              type="time"
              value={serveTime}
              onChange={(e) => setServeTime(e.target.value)}
              className="w-32"
              aria-label={`${meal.charAt(0)}${meal.slice(1).toLowerCase()} time`}
            />
          </div>
          <Textarea
            placeholder="One item per line"
            value={items}
            onChange={(e) => setItems(e.target.value)}
            rows={4}
          />
          <Button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || !items.trim()}
          >
            <Send className="h-4 w-4" /> Publish
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="text-sm font-medium">Today's Menus</div>
        {(menusQ.data ?? []).map((m) => (
          <MenuCard
            key={m.id}
            menu={m as MenuWithChildren}
            feedback={(feedbackQ.data ?? []).filter((f) => f.mess_menu_id === m.id)}
            tenantId={tenantId}
            propertyId={propertyId}
            userId={userId}
            activeStudentCount={activeStudentCount}
          />
        ))}
        {menusQ.data?.length === 0 && (
          <div className="text-sm text-muted-foreground p-4 text-center">
            No menus for this date.
          </div>
        )}
      </div>
    </div>
  );
}

function MenuCard({
  menu,
  feedback,
  tenantId,
  propertyId,
  userId,
  activeStudentCount,
}: {
  menu: MenuWithChildren;
  feedback: FeedbackRow[];
  tenantId: string | null;
  propertyId: string | null;
  userId: string | null;
  activeStudentCount: number;
}) {
  const qc = useQueryClient();
  const avg = feedback.length
    ? (feedback.reduce((s, f) => s + f.rating, 0) / feedback.length).toFixed(1)
    : "—";
  const headcount = menu.mess_headcounts?.[0];

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [headcountEditing, setHeadcountEditing] = useState(false);

  const deleteMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("mess_menus").delete().eq("id", menu.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Menu deleted");
      setDeleteOpen(false);
      qc.invalidateQueries({ queryKey: ["mess-menus"] });
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not delete menu")),
  });

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex justify-between items-start gap-2">
          <div>
            <div className="font-medium">
              {menu.meal} {menu.title ? `— ${menu.title}` : ""}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <Clock className="h-3 w-3" /> {formatServeTime(menu.serve_time)}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    Feedback — {menu.meal}
                    {menu.title ? ` — ${menu.title}` : ""}
                  </DialogTitle>
                </DialogHeader>
                {feedback.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No feedback available.</p>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {feedback.map((f, i) => (
                      <div key={i} className="rounded-md border border-border p-2 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-sm">
                            {f.students?.full_name ?? "Student"}
                          </span>
                          <Badge variant="secondary">⭐ {f.rating}</Badge>
                        </div>
                        {f.comment && <p className="text-sm text-muted-foreground">{f.comment}</p>}
                        <p className="text-xs text-muted-foreground">
                          {new Date(f.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </DialogContent>
              <button
                type="button"
                onClick={() => setFeedbackOpen(true)}
                className="cursor-pointer"
              >
                <Badge variant="secondary">
                  ⭐ {avg} ({feedback.length})
                </Badge>
              </button>
            </Dialog>
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          {(menu.mess_menu_items ?? []).map((i) => i.item_name).join(", ")}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <MessageCircle className="h-3 w-3" /> Expected{" "}
            {headcount?.expected_count ?? activeStudentCount}
          </span>
          <span className="text-muted-foreground">
            Served {headcount?.actual_count ?? "Not recorded"}
          </span>
          <span className="text-muted-foreground">
            Skipped{" "}
            {headcount?.actual_count != null
              ? Math.max(0, (headcount.expected_count ?? 0) - headcount.actual_count)
              : "Not recorded"}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => setHeadcountEditing((v) => !v)}
          >
            {headcountEditing ? "Close" : "Record headcount"}
          </Button>
        </div>
        {headcountEditing && (
          <HeadcountEditor
            menuId={menu.id}
            headcountId={headcount?.id ?? null}
            tenantId={tenantId}
            propertyId={propertyId}
            userId={userId}
            defaultExpected={headcount?.expected_count ?? activeStudentCount}
            defaultActual={headcount?.actual_count ?? undefined}
            onSaved={() => setHeadcountEditing(false)}
          />
        )}
      </CardContent>

      <EditMenuDialog open={editOpen} onOpenChange={setEditOpen} menu={menu} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this menu?</AlertDialogTitle>
            <AlertDialogDescription>
              This also removes its items, headcount and feedback. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleteMut.isPending} onClick={() => deleteMut.mutate()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function HeadcountEditor({
  menuId,
  headcountId,
  tenantId,
  propertyId,
  userId,
  defaultExpected,
  defaultActual,
  onSaved,
}: {
  menuId: string;
  headcountId: string | null;
  tenantId: string | null;
  propertyId: string | null;
  userId: string | null;
  defaultExpected: number;
  defaultActual: number | undefined;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [expected, setExpected] = useState(String(defaultExpected));
  const [served, setServed] = useState(defaultActual != null ? String(defaultActual) : "");

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!tenantId || !propertyId) throw new Error("No property scope found");
      const expectedCount = Math.max(0, parseInt(expected, 10) || 0);
      const actualCount = served.trim() === "" ? null : Math.max(0, parseInt(served, 10) || 0);
      if (headcountId) {
        const { error } = await supabase
          .from("mess_headcounts")
          .update({
            expected_count: expectedCount,
            actual_count: actualCount,
            recorded_by: userId,
            recorded_at: new Date().toISOString(),
          })
          .eq("id", headcountId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("mess_headcounts").insert({
          tenant_id: tenantId,
          property_id: propertyId,
          mess_menu_id: menuId,
          expected_count: expectedCount,
          actual_count: actualCount,
          recorded_by: userId,
          recorded_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Headcount saved");
      qc.invalidateQueries({ queryKey: ["mess-menus"] });
      onSaved();
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not save headcount")),
  });

  return (
    <div className="flex flex-wrap items-end gap-2 pt-1">
      <div className="space-y-1">
        <Label className="text-xs">Expected</Label>
        <Input
          type="number"
          min={0}
          className="h-8 w-24"
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Served</Label>
        <Input
          type="number"
          min={0}
          className="h-8 w-24"
          value={served}
          onChange={(e) => setServed(e.target.value)}
        />
      </div>
      <Button
        size="sm"
        className="h-8"
        disabled={saveMut.isPending}
        onClick={() => saveMut.mutate()}
      >
        Save
      </Button>
    </div>
  );
}

function EditMenuDialog({
  open,
  onOpenChange,
  menu,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menu: MenuWithChildren;
}) {
  const qc = useQueryClient();
  const [meal, setMeal] = useState<(typeof MEALS)[number]>(menu.meal as (typeof MEALS)[number]);
  const [title, setTitle] = useState(menu.title ?? "");
  const [menuDate, setMenuDate] = useState(menu.menu_date);
  const [items, setItems] = useState(() => itemsToText(menu.mess_menu_items));
  const [serveTime, setServeTime] = useState(menu.serve_time ? menu.serve_time.slice(0, 5) : "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleOpenChange(next: boolean) {
    if (next) {
      setMeal(menu.meal as (typeof MEALS)[number]);
      setTitle(menu.title ?? "");
      setMenuDate(menu.menu_date);
      setItems(itemsToText(menu.mess_menu_items));
      setServeTime(menu.serve_time ? menu.serve_time.slice(0, 5) : "");
      setErrors({});
    }
    onOpenChange(next);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const parsed = messMenuFormSchema.safeParse({ meal, title, menuDate, items, serveTime });
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
        setErrors(fieldErrors);
        throw new Error("Please fix the highlighted fields");
      }
      setErrors({});
      const d = parsed.data;
      const { error: updErr } = await supabase
        .from("mess_menus")
        .update({
          meal: d.meal,
          title: d.title || null,
          menu_date: d.menuDate,
          serve_time: d.serveTime || null,
        })
        .eq("id", menu.id);
      if (updErr) throw updErr;

      const { error: delErr } = await supabase
        .from("mess_menu_items")
        .delete()
        .eq("mess_menu_id", menu.id);
      if (delErr) throw delErr;
      const itemRows = d.items
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name, i) => ({
          tenant_id: menu.tenant_id,
          property_id: menu.property_id,
          mess_menu_id: menu.id,
          item_name: name,
          display_order: i,
        }));
      if (itemRows.length) {
        const { error: insErr } = await supabase.from("mess_menu_items").insert(itemRows);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      toast.success("Menu updated");
      qc.invalidateQueries({ queryKey: ["mess-menus"] });
      onOpenChange(false);
    },
    onError: (e) => {
      const message = getErrorMessage(e, "Could not update menu", DUPLICATE_MENU_MESSAGE);
      if (message !== "Please fix the highlighted fields") toast.error(message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Menu</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Meal Type</Label>
              <Select value={meal} onValueChange={(v) => setMeal(v as typeof meal)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEALS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                className="w-40"
                value={menuDate}
                onChange={(e) => setMenuDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                {meal.charAt(0)}
                {meal.slice(1).toLowerCase()} Time
              </Label>
              <Input
                type="time"
                className="w-32"
                value={serveTime}
                onChange={(e) => setServeTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Title (optional)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Menu Items (one per line)</Label>
            <Textarea rows={4} value={items} onChange={(e) => setItems(e.target.value)} />
            {errors.items ? <p className="text-xs text-destructive">{errors.items}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
