import { useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useMyNotifications, markAllRead } from "@/lib/notifications";
import { formatDistanceToNow } from "date-fns";

export function NotificationBell({ className }: { className?: string }) {
  const { data = [] } = useMyNotifications();
  const [open, setOpen] = useState(false);
  const unread = useMemo(() => data.filter((n) => !n.read_at), [data]);

  const onOpenChange = async (v: boolean) => {
    setOpen(v);
    if (v && unread.length) await markAllRead(unread.map((n) => n.id));
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unread.length ? ` (${unread.length} unread)` : ""}`}
          className={`relative min-h-10 min-w-10 ${className ?? ""}`}
        >
          <Bell className="h-4 w-4" />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2 text-sm font-semibold">Notifications</div>
        <div className="max-h-96 overflow-auto">
          {data.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No notifications yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {data.slice(0, 20).map((n) => {
                const p = (n.payload ?? {}) as Record<string, unknown>;
                const title = String(p.title ?? n.event_type.replaceAll("_", " "));
                const body = String(p.body ?? p.invoice_number ?? p.complaint_number ?? "");
                return (
                  <li key={n.id} className={`px-3 py-2 text-sm ${n.read_at ? "" : "bg-muted/40"}`}>
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{title}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {body && <p className="text-xs text-muted-foreground">{body}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-border px-3 py-2">
          <Link to="/student/notices" className="text-xs text-primary hover:underline">
            View all notices
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
