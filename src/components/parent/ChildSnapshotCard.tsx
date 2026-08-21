import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StudentStatusBadge } from "@/components/students/StudentStatusBadge";
import { BedDouble, Building2, Coins, Layers, LayoutGrid } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatInr } from "@/lib/finance";
import { cn } from "@/lib/utils";
import type { ParentChild } from "@/lib/parent";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function ChildSnapshotCard({ child }: { child: ParentChild }) {
  const { t } = useTranslation();
  const dueQ = useQuery({
    queryKey: ["student-dues", child.student_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("balance_paise")
        .eq("student_id", child.student_id)
        .in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"])
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
      return (data ?? []).reduce((s, i) => s + (i.balance_paise ?? 0), 0);
    },
  });
  const outstanding = dueQ.data ?? 0;

  return (
    <Card className="overflow-hidden rounded-2xl">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-4">
          <div
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary/15 text-lg font-semibold text-primary ring-1 ring-primary/20"
            aria-hidden="true"
          >
            {initialsOf(child.student_name)}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate font-display text-xl">{child.student_name}</CardTitle>
            <div className="mt-1.5">
              <StudentStatusBadge status={child.status} />
            </div>
          </div>
        </div>
      </CardHeader>
      {(child.can_view_room_allocation || child.can_view_finance) && <Separator />}
      <CardContent className="space-y-5 pt-5 text-sm">
        {child.can_view_room_allocation && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            <Meta
              icon={Building2}
              label={t("parent.snapshot.propertyLabel")}
              value={child.property_name}
            />
            <Meta
              icon={LayoutGrid}
              label={t("parent.snapshot.blockLabel")}
              value={child.block_name ?? "—"}
            />
            <Meta
              icon={Layers}
              label={t("parent.snapshot.floorLabel")}
              value={child.floor_name ?? "—"}
            />
            <Meta
              icon={BedDouble}
              label={t("parent.snapshot.bedLabel")}
              value={child.bed_code ?? "—"}
            />
          </div>
        )}
        {child.can_view_finance && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-dashed border-border bg-muted/30 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <Coins className="h-4 w-4" />
              </div>
              <p className="truncate text-sm font-semibold text-foreground">
                {t("parent.snapshot.feesTitle")}
              </p>
            </div>
            <div className="shrink-0 text-sm text-muted-foreground">
              Outstanding:{" "}
              {dueQ.isLoading ? (
                <Skeleton className="inline-block h-4 w-16 align-middle" />
              ) : (
                <span
                  className={cn(
                    "font-display text-base font-semibold",
                    outstanding > 0 ? "text-destructive" : "text-success",
                  )}
                >
                  {formatInr(outstanding)}
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Meta({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-info/10 text-info">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}
