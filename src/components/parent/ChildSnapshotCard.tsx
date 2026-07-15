import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins } from "lucide-react";
import type { ParentChild } from "@/lib/parent";

export function ChildSnapshotCard({ child }: { child: ParentChild }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="font-display text-lg">{child.student_name}</span>
          <Badge variant="secondary" className="text-xs">{child.status}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Meta label={t("parent.snapshot.propertyLabel")} value={child.property_name} />
          <Meta
            label={t("parent.snapshot.bedLabel")}
            value={child.bed_code ?? "—"}
          />
        </div>
        {child.can_pay_fees && (
          <div className="mt-2 rounded-md border border-dashed border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 font-medium">
              <Coins className="h-4 w-4" />
              {t("parent.snapshot.feesTitle")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("parent.snapshot.feesSoon")}
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
