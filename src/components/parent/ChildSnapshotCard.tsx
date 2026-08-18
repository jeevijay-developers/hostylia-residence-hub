import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatInr } from "@/lib/finance";
import type { ParentChild } from "@/lib/parent";

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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="font-display text-lg">{child.student_name}</span>
          <Badge variant="secondary" className="text-xs">
            {child.status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Meta label={t("parent.snapshot.propertyLabel")} value={child.property_name} />
          <Meta label={t("parent.snapshot.bedLabel")} value={child.bed_code ?? "—"} />
        </div>
        {child.can_pay_fees && (
          <div className="mt-2 rounded-md border border-dashed border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 font-medium">
              <Coins className="h-4 w-4" />
              {t("parent.snapshot.feesTitle")}
            </div>
            <p className="mt-1 text-sm">
              Outstanding:{" "}
              {dueQ.isLoading ? (
                <Skeleton className="inline-block h-4 w-16 align-middle" />
              ) : (
                <span className="font-semibold">{formatInr(dueQ.data ?? 0)}</span>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
