import { useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  useMyNotifications,
  markAllRead,
  markNotificationRead,
  type NotificationRow,
} from "@/lib/notifications";
import { formatDistanceToNow } from "date-fns";

export function NotificationBell({ className }: { className?: string }) {
  const { data = [] } = useMyNotifications();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const navigate = useNavigate();
  const unread = useMemo(() => data.filter((n) => !n.read_at), [data]);
  const visible = showAll ? data : data.slice(0, 20);

  const onOpenChange = async (v: boolean) => {
    setOpen(v);
    if (!v) setShowAll(false);
    if (v && unread.length) await markAllRead(unread.map((n) => n.id));
  };

  function handleItemClick(n: NotificationRow) {
    const p = (n.payload ?? {}) as Record<string, unknown>;
    const ticketId = p.ticket_id;
    if (typeof ticketId === "string") {
      if (!n.read_at) void markNotificationRead(n.id);
      setOpen(false);
      navigate({ to: "/admin/support/$id", params: { id: ticketId } });
    }
  }

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
              {visible.map((n) => {
                const p = (n.payload ?? {}) as Record<string, unknown>;
                const title = String(p.title ?? n.event_type.replaceAll("_", " "));
                const body = String(p.body ?? p.invoice_number ?? p.complaint_number ?? "");
                const clickable = typeof p.ticket_id === "string";
                const content = (
                  <>
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{title}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {body && <p className="text-xs text-muted-foreground">{body}</p>}
                  </>
                );
                return (
                  <li key={n.id} className={n.read_at ? "" : "bg-muted/40"}>
                    {clickable ? (
                      <button
                        type="button"
                        onClick={() => handleItemClick(n)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="px-3 py-2 text-sm">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {!showAll && data.length > visible.length && (
          <div className="border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-xs text-primary hover:underline"
            >
              View all notifications
            </button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
