import { useEffect, useId, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { StaffModuleGuard } from "@/components/dashboard/RoleGuard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  Clock,
  List,
  Loader2,
  MessageCircle,
  Pencil,
  RotateCcw,
  Save,
  Send,
  Tag,
  Trash2,
  Utensils,
} from "lucide-react";

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
  DialogDescription,
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
  formatServeTime,
  localDateInTimezone,
  usePropertyTimezone,
  type MessMenuRow,
  type MessMenuItemRow,
  type MessHeadcountRow,
} from "@/lib/ops";
import { supabase } from "@/integrations/supabase/client";
import { messMenuFormSchema } from "@/schemas/mess";
import { cn, getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/warden/mess")({
  component: () => (
    <StaffModuleGuard role="WARDEN" module="mess_menus">
      <WardenMessPage />
    </StaffModuleGuard>
  ),
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

function itemsToText(items: MessMenuItemRow[] | undefined): string {
  return [...(items ?? [])]
    .sort((a, b) => a.display_order - b.display_order)
    .map((i) => i.item_name)
    .join("\n");
}

/** Decorative leading-icon segment for the Edit Menu dialog's fields — a
 * bordered box flush with the control's left edge, matching that field's
 * type at a glance. Purely presentational; doesn't affect the control's
 * value or behavior. */
function FieldIcon({ icon: Icon, alignTop }: { icon: LucideIcon; alignTop?: boolean }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute left-0 z-10 flex w-9 items-center justify-center rounded-l-md border-r border-input bg-muted/40 text-muted-foreground",
        alignTop ? "top-0 h-9" : "inset-y-0",
      )}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

const DUPLICATE_MENU_MESSAGE =
  "A menu for this meal already exists on this date. Edit the existing one instead.";

export function WardenMessPage() {
  const role = useResolvedRole();
  const userId = role.data?.userId ?? null;
  const propQ = useMyStaffProperty(userId);
  const propertyId = propQ.data ?? null;
  const tzQ = usePropertyTimezone(propertyId);
  const today = localDateInTimezone(tzQ.data);
  const [date, setDate] = useState(today);
  // Keeps the date picker's default in step with the property's own
  // timezone once it loads (tzQ starts as Asia/Kolkata-by-fallback, same
  // as `today` above), without ever overwriting a date the Warden picked.
  const dateTouchedRef = useRef(false);
  useEffect(() => {
    if (!dateTouchedRef.current) setDate(today);
  }, [today]);
  const menusQ = useMessMenusForDate(propertyId, date);
  const studentsQ = useStudentsInProperty(propertyId, { page: 0, pageSize: 1 });
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
      const { data, error } = await supabase
        .from("mess_feedback")
        .select("mess_menu_id, rating, comment, created_at, student_id, students(full_name)")
        .in("mess_menu_id", menuIds);
      if (error) throw error;
      return (data ?? []) as unknown as FeedbackRow[];
    },
  });

  // New feedback can land while this page is already open (a student
  // submitting from their own session) — without this, the badge/dialog
  // would only pick it up on the next natural refetch (focus/staleTime).
  // Scoped by property via the channel name + postgres_changes filter, same
  // pattern as useGatePasses in lib/ops.ts; "mess-feedback-summary" (no
  // date/menuIds suffix) invalidates every date this Warden has open.
  const feedbackChannelId = useId();
  useEffect(() => {
    if (!propertyId) return;
    const channel = supabase
      .channel(`mess-feedback-${propertyId}-${feedbackChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "mess_feedback",
          filter: `property_id=eq.${propertyId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["mess-feedback-summary"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [propertyId, qc, feedbackChannelId]);

  const activeStudentCount = studentsQ.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative w-40">
          <CalendarDays className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              dateTouchedRef.current = true;
              setDate(e.target.value);
            }}
            className="w-40 pr-8 scheme-dark [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
          />
        </div>
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
              className="flex-1 min-w-40"
            />
            <div className="relative w-32">
              <Clock className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="time"
                value={serveTime}
                onChange={(e) => setServeTime(e.target.value)}
                className="w-32 pr-8 scheme-dark [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                aria-label={`${meal.charAt(0)}${meal.slice(1).toLowerCase()} time`}
              />
            </div>
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
            feedbackLoading={feedbackQ.isLoading}
            feedbackError={feedbackQ.isError}
            onRetryFeedback={() => feedbackQ.refetch()}
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
  feedbackLoading,
  feedbackError,
  onRetryFeedback,
  tenantId,
  propertyId,
  userId,
  activeStudentCount,
}: {
  menu: MenuWithChildren;
  feedback: FeedbackRow[];
  feedbackLoading: boolean;
  feedbackError: boolean;
  onRetryFeedback: () => void;
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

  // Once students have rated/commented on this specific menu, silently
  // changing what it actually was (meal/title/date/time/items) would make
  // their feedback misleading — locked client-side here, and enforced at
  // the DB layer (trg_block_mess_menu_edit_with_feedback /
  // trg_block_mess_menu_items_change_with_feedback) for any direct API call.
  const lockedByFeedback = feedback.length > 0;
  const lockedMessage = "This menu cannot be edited because students have already submitted feedback.";

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
            {lockedByFeedback && (
              <p className="text-xs text-warning mt-1">{lockedMessage}</p>
            )}
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
                {feedbackLoading ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Loading feedback…
                  </div>
                ) : feedbackError ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      Could not load feedback. Please try again.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onRetryFeedback}
                    >
                      <RotateCcw className="h-4 w-4" /> Retry
                    </Button>
                  </div>
                ) : feedback.length === 0 ? (
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
                {feedbackLoading ? (
                  <Badge variant="secondary">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  </Badge>
                ) : feedbackError ? (
                  <Badge variant="destructive">Feedback error</Badge>
                ) : (
                  <Badge variant="secondary">
                    ⭐ {avg} ({feedback.length})
                  </Badge>
                )}
              </button>
            </Dialog>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditOpen(true)}
              disabled={lockedByFeedback}
              aria-disabled={lockedByFeedback}
              title={lockedByFeedback ? lockedMessage : undefined}
              className={lockedByFeedback ? "opacity-50 cursor-not-allowed" : undefined}
            >
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
        <DialogHeader className="flex-row items-center gap-3 space-y-0">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-warning text-warning-foreground">
            <Utensils className="h-5 w-5" />
          </span>
          <div>
            <DialogTitle>Edit Menu</DialogTitle>
            <DialogDescription>Update the details for today's menu</DialogDescription>
          </div>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Meal Type</Label>
              <div className="relative">
                <FieldIcon icon={Utensils} />
                <Select value={meal} onValueChange={(v) => setMeal(v as typeof meal)}>
                  <SelectTrigger className="w-full pl-11">
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
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <div className="relative">
                <FieldIcon icon={CalendarDays} />
                <CalendarDays className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  className="w-full pl-11 pr-8 scheme-dark [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                  value={menuDate}
                  onChange={(e) => setMenuDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">
                {meal.charAt(0)}
                {meal.slice(1).toLowerCase()} Time
              </Label>
              <div className="relative">
                <FieldIcon icon={Clock} />
                <Clock className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="time"
                  className="w-full pl-11 pr-8 scheme-dark [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                  value={serveTime}
                  onChange={(e) => setServeTime(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Title (optional)</Label>
            <div className="relative">
              <FieldIcon icon={Tag} />
              <Input className="pl-11" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Menu Items (one per line)</Label>
            <div className="relative">
              <FieldIcon icon={List} alignTop />
              <Textarea
                rows={4}
                className="pl-11"
                value={items}
                onChange={(e) => setItems(e.target.value)}
              />
            </div>
            {errors.items ? <p className="text-xs text-destructive">{errors.items}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
            <Save className="h-4 w-4" />
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
