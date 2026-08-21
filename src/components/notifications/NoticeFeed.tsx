import { Inbox } from "lucide-react";
import { useTenantNotices, type NoticeRow } from "@/lib/notifications";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

interface Props {
  tenantId: string | null | undefined;
  propertyId?: string | null;
  audienceFilter?: NoticeRow["audience_type"][];
  emptyLabel?: string;
  /** "framed" renders the empty state inside a bordered panel with an icon instead of a bare line of text. */
  emptyVariant?: "plain" | "framed";
}

const priorityTone: Record<string, "default" | "secondary" | "destructive"> = {
  NORMAL: "secondary",
  IMPORTANT: "default",
  URGENT: "destructive",
};

export function NoticeFeed({
  tenantId,
  propertyId,
  audienceFilter,
  emptyLabel,
  emptyVariant = "plain",
}: Props) {
  const { data = [], isLoading } = useTenantNotices(tenantId, propertyId);
  const filtered = audienceFilter
    ? data.filter((n) => audienceFilter.includes(n.audience_type) || n.audience_type === "ALL")
    : data;

  if (isLoading)
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </Card>
        ))}
      </div>
    );
  if (filtered.length === 0) {
    const label = emptyLabel ?? "No notices yet.";
    if (emptyVariant === "framed") {
      return (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
            <Inbox className="h-5 w-5" />
          </div>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      );
    }
    return <p className="text-sm text-muted-foreground">{label}</p>;
  }

  return (
    <div className="space-y-3">
      {filtered.map((n) => (
        <Card key={n.id} className="rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-medium">{n.title}</h3>
            <Badge variant={priorityTone[n.priority] ?? "secondary"}>{n.priority}</Badge>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {n.published_at
              ? `Published ${formatDistanceToNow(new Date(n.published_at), { addSuffix: true })}`
              : "Draft"}
          </p>
        </Card>
      ))}
    </div>
  );
}
