import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, Loader2, MessageSquare, Search, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { sendMessage, markConversationRead } from "@/lib/messaging.functions";
import { useResolvedRole } from "@/lib/user-role";
import { cn } from "@/lib/utils";

interface ConversationRow {
  conversation_id: string;
  last_read_at: string | null;
  conversations: {
    id: string;
    updated_at: string;
    student_id: string | null;
    students: { full_name: string } | null;
  };
}

interface Msg {
  id: string;
  body: string | null;
  sender_user_id: string;
  sent_at: string;
}

const AVATAR_TONES = [
  "bg-info/15 text-info",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-primary/15 text-primary",
];

function avatarTone(index: number) {
  return AVATAR_TONES[index % AVATAR_TONES.length];
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function useWardenConversations(userId: string | null) {
  const qc = useQueryClient();
  const listQ = useQuery({
    queryKey: ["warden-conversations", userId],
    enabled: !!userId,
    queryFn: async (): Promise<ConversationRow[]> => {
      const { data, error } = await supabase
        .from("conversation_participants")
        .select(
          `conversation_id, last_read_at,
           conversations!inner(id, updated_at, student_id, conversation_type, status, students(full_name))`,
        )
        .eq("user_id", userId!)
        .is("left_at", null)
        .eq("conversations.conversation_type", "PARENT_WARDEN")
        .eq("conversations.status", "OPEN")
        .limit(50);
      if (error) throw error;
      return ((data ?? []) as unknown as ConversationRow[]).sort(
        (a, b) =>
          new Date(b.conversations.updated_at).getTime() -
          new Date(a.conversations.updated_at).getTime(),
      );
    },
  });

  const ids = (listQ.data ?? []).map((c) => c.conversation_id);
  const idsKey = ids.join(",");
  const recentQueryKey = useMemo(
    () => ["warden-conversations-recent-messages", userId, idsKey],
    [userId, idsKey],
  );
  // Drives both the unread badge (messages from the other side, newer than
  // last_read_at) and each row's last-message preview — one query covers
  // both so the panel doesn't fire a second round trip per render.
  const recentQ = useQuery({
    queryKey: recentQueryKey,
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("conversation_id, sender_user_id, body, sent_at")
        .in("conversation_id", ids)
        .is("deleted_at", null)
        .order("sent_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as Array<{
        conversation_id: string;
        sender_user_id: string;
        body: string | null;
        sent_at: string;
      }>;
    },
  });

  const unreadByConversation = useMemo(() => {
    const map = new Map<string, number>();
    const lastRead = new Map((listQ.data ?? []).map((c) => [c.conversation_id, c.last_read_at]));
    for (const m of recentQ.data ?? []) {
      if (m.sender_user_id === userId) continue;
      const readAt = lastRead.get(m.conversation_id);
      if (!readAt || new Date(m.sent_at) > new Date(readAt)) {
        map.set(m.conversation_id, (map.get(m.conversation_id) ?? 0) + 1);
      }
    }
    return map;
  }, [listQ.data, recentQ.data, userId]);

  // First row per conversation in the desc-sorted list is the latest message.
  const lastMessageByConversation = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of recentQ.data ?? []) {
      if (!map.has(m.conversation_id) && m.body) map.set(m.conversation_id, m.body);
    }
    return map;
  }, [recentQ.data]);

  const totalUnread = useMemo(
    () => Array.from(unreadByConversation.values()).reduce((a, b) => a + b, 0),
    [unreadByConversation],
  );

  /**
   * Marks every listed conversation read for this warden in one round trip
   * (conversation_participants.last_read_at, persisted, RLS-scoped to the
   * caller's own participant row via cp_update_self). `unreadByConversation`
   * derives from `last_read_at`, so optimistically bumping it below already
   * clears every unread badge immediately — no need to touch the message
   * cache itself, which still holds the preview text each row needs.
   */
  const markAllAsRead = useCallback(async () => {
    if (!userId || ids.length === 0) return;
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("conversation_participants")
      .update({ last_read_at: nowIso })
      .eq("user_id", userId)
      .in("conversation_id", ids)
      .is("left_at", null);
    if (error) {
      // Reconcile with the server if the persisted write failed.
      qc.invalidateQueries({ queryKey: ["warden-conversations", userId] });
      throw error;
    }
    qc.setQueryData(["warden-conversations", userId], (prev: ConversationRow[] | undefined) =>
      (prev ?? []).map((c) => ({ ...c, last_read_at: nowIso })),
    );
  }, [ids, qc, userId]);

  return { listQ, unreadByConversation, lastMessageByConversation, totalUnread, markAllAsRead };
}

export function MessagesPanel() {
  const { data: resolved } = useResolvedRole();
  const userId = resolved?.userId ?? null;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [activeConversation, setActiveConversation] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [listFilter, setListFilter] = useState<"all" | "unread">("all");
  const [search, setSearch] = useState("");

  const { listQ, unreadByConversation, lastMessageByConversation, totalUnread, markAllAsRead } =
    useWardenConversations(userId);

  const onMessagesRead = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["warden-conversations-recent-messages", userId] });
  }, [qc, userId]);

  const visibleConversations = useMemo(() => {
    let list = listQ.data ?? [];
    if (listFilter === "unread") {
      list = list.filter((c) => (unreadByConversation.get(c.conversation_id) ?? 0) > 0);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        (c.conversations.students?.full_name ?? "parent").toLowerCase().includes(q),
      );
    }
    return list;
  }, [listQ.data, listFilter, unreadByConversation, search]);

  // Opening the panel counts as viewing every conversation in the list —
  // mark them all read immediately (badge clears optimistically inside
  // markAllAsRead) rather than waiting for each thread to be opened
  // individually. Guarded so it only fires once per open, and waits for the
  // list to finish loading if the panel is opened before the first fetch
  // resolves.
  const markedForThisOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      markedForThisOpenRef.current = false;
      return;
    }
    if (markedForThisOpenRef.current || !listQ.data) return;
    markedForThisOpenRef.current = true;
    void markAllAsRead().catch(() => {
      toast.error("Could not mark messages as read");
    });
  }, [open, listQ.data, markAllAsRead]);

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) setActiveConversation(null);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Messages${totalUnread ? ` (${totalUnread} unread)` : ""}`}
          className="relative min-h-10 min-w-10"
        >
          <MessageSquare className="h-4 w-4" />
          {totalUnread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {totalUnread > 9 ? "9+" : totalUnread}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b border-border px-4 py-3 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            {activeConversation && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setActiveConversation(null)}
                aria-label="Back to conversations"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {activeConversation ? activeConversation.label : "Messages"}
          </SheetTitle>
        </SheetHeader>

        {!activeConversation ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="space-y-3 border-b border-border p-4">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={listFilter === "all" ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => setListFilter("all")}
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={listFilter === "unread" ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => setListFilter("unread")}
                >
                  Unread
                  {totalUnread > 0 && (
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        listFilter === "unread" ? "bg-primary-foreground" : "bg-success",
                      )}
                    />
                  )}
                </Button>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search messages…"
                  className="h-9 pl-8 text-sm placeholder:text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {listQ.isLoading && <Skeleton className="m-4 h-40" />}
              {!listQ.isLoading && (listQ.data ?? []).length === 0 && (
                <EmptyMessages
                  title="Stay in the loop"
                  description="All your important updates and messages will appear here."
                />
              )}
              {!listQ.isLoading &&
                (listQ.data ?? []).length > 0 &&
                visibleConversations.length === 0 && (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    {search.trim() ? "No conversations match your search." : "No unread messages."}
                  </p>
                )}
              <ul className="divide-y divide-border">
                {visibleConversations.map((c, i) => {
                  const unread = unreadByConversation.get(c.conversation_id) ?? 0;
                  const label = c.conversations.students?.full_name ?? "Parent";
                  const preview = lastMessageByConversation.get(c.conversation_id);
                  return (
                    <li key={c.conversation_id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50",
                          unread > 0 ? "border-l-primary bg-primary/5" : "border-l-transparent",
                        )}
                        onClick={() => setActiveConversation({ id: c.conversation_id, label })}
                      >
                        <span
                          className={cn(
                            "grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold",
                            avatarTone(i),
                          )}
                        >
                          {initialsOf(label)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate font-medium text-foreground">{label}</span>
                              {unread > 0 && (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
                              )}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(c.conversations.updated_at), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <p className="truncate text-xs text-muted-foreground">
                              {preview ?? "No messages yet."}
                            </p>
                            {unread > 0 && (
                              <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                                {unread > 9 ? "9+" : unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ) : (
          <ConversationThread
            conversationId={activeConversation.id}
            currentUserId={userId!}
            onMessagesRead={onMessagesRead}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ConversationThread({
  conversationId,
  currentUserId,
  onMessagesRead,
}: {
  conversationId: string;
  currentUserId: string;
  onMessagesRead: () => void;
}) {
  const qc = useQueryClient();
  const sendFn = useServerFn(sendMessage);
  const markFn = useServerFn(markConversationRead);

  const messagesQ = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async (): Promise<Msg[]> => {
      const { data } = await supabase
        .from("messages")
        .select("id, body, sender_user_id, sent_at")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("sent_at", { ascending: true })
        .limit(200);
      return (data ?? []) as Msg[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["messages", conversationId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, qc]);

  useEffect(() => {
    void markFn({ data: { conversation_id: conversationId } }).then(onMessagesRead);
  }, [conversationId, messagesQ.data?.length, markFn, onMessagesRead]);

  const [body, setBody] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [messagesQ.data?.length]);

  const send = useMutation({
    mutationFn: () => sendFn({ data: { conversation_id: conversationId, body: body.trim() } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to send"),
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={scrollerRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {messagesQ.isLoading && <Skeleton className="h-40 w-full" />}
        {(messagesQ.data ?? []).map((m) => {
          const mine = m.sender_user_id === currentUserId;
          return (
            <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  "max-w-[80%] rounded-lg px-3 py-2 text-sm " +
                  (mine ? "bg-primary text-primary-foreground" : "bg-muted")
                }
              >
                {m.body}
              </div>
            </div>
          );
        })}
        {!messagesQ.isLoading && (messagesQ.data ?? []).length === 0 && (
          <EmptyMessages
            compact
            title="No messages yet"
            description="Send the first message to start this conversation."
          />
        )}
      </div>
      <form
        className="flex items-center gap-2 border-t border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) send.mutate();
        }}
      >
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a reply…"
          className="min-h-11"
        />
        <Button type="submit" className="min-h-11" disabled={!body.trim() || send.isPending}>
          {send.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}

function EmptyMessages({
  title,
  description,
  compact = false,
}: {
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 text-center",
        compact ? "py-8" : "py-16",
      )}
    >
      <EmptyMessagesIllustration className={compact ? "h-24 w-24" : "h-36 w-36"} />
      <h3 className="mt-4 font-display text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function EmptyMessagesIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1000 1000" className={className} aria-hidden="true">
      <defs>
        <linearGradient
          id="empty-messages-shadow"
          x1="481.93"
          x2="481.93"
          y1="262.73"
          y2="742.28"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#c7c7d1" />
          <stop offset="1" stopColor="#c7c7d1" stopOpacity=".1" />
        </linearGradient>
        <linearGradient
          id="empty-messages-body"
          x1="518.68"
          x2="518.68"
          y1="266.13"
          y2="720.17"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#c7c7d1" />
          <stop offset="1" stopColor="#7a8496" />
        </linearGradient>
        <linearGradient
          id="empty-messages-flap"
          x1="518.68"
          x2="518.68"
          y1="266.13"
          y2="576.37"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#7a8496" />
          <stop offset="1" stopColor="#363d56" />
        </linearGradient>
        <linearGradient
          xlinkHref="#empty-messages-flap"
          id="empty-messages-flap-left"
          x1="300.7"
          x2="462.18"
          y1="709.28"
          y2="547.8"
        />
        <linearGradient
          xlinkHref="#empty-messages-flap"
          id="empty-messages-flap-right"
          x1="10246.9"
          x2="10246.9"
          y1="703.49"
          y2="553.85"
          gradientTransform="matrix(-1 0 0 1 10902.35 0)"
        />
        <linearGradient
          id="empty-messages-zero"
          x1="516.05"
          x2="516.05"
          y1="494.11"
          y2="337.22"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#363d56" />
          <stop offset="1" stopColor="#1d1d33" />
        </linearGradient>
      </defs>
      <path
        d="M713.92,742.28H249.94c-7.56,0-13.68-6.13-13.68-13.68v-308.53c0-4.55,2.27-8.81,6.04-11.35l198.11-133.31c25.1-16.89,57.94-16.89,83.04,0l198.11,133.31c3.78,2.54,6.04,6.8,6.04,11.35v308.53c0,7.56-6.13,13.68-13.68,13.68Z"
        fill="url(#empty-messages-shadow)"
      />
      <g>
        <path
          d="M750.67,720.17h-463.98c-7.56,0-13.68-6.13-13.68-13.68v-283.02c0-4.55,2.27-8.81,6.04-11.35l198.11-133.31c25.1-16.89,57.94-16.89,83.04,0l198.11,133.31c3.78,2.54,6.04,6.8,6.04,11.35v283.02c0,7.56-6.13,13.68-13.68,13.68Z"
          fill="url(#empty-messages-body)"
        />
        <path
          d="M764.35,423.45v.06l-211.79,142.52c-20.48,13.78-47.28,13.78-67.76,0l-211.79-142.52v-.06c0-4.56,2.27-8.81,6.04-11.35l198.11-133.31c25.1-16.89,57.94-16.89,83.04,0l198.11,133.31c3.77,2.54,6.04,6.8,6.04,11.35Z"
          fill="url(#empty-messages-flap)"
        />
        <path
          d="M471.43,557.05l-175.44,146.2c-.44.36-1.09.31-1.45-.13l-2.2-2.64c-.37-.44-.31-1.09.13-1.45l174.21-145.17,4.76,3.2Z"
          fill="url(#empty-messages-flap-left)"
        />
        <path
          d="M565.78,557.05l175.44,146.2c.44.36,1.09.31,1.45-.13l2.2-2.64c.37-.44.31-1.09-.13-1.45l-174.21-145.17-4.76,3.2Z"
          fill="url(#empty-messages-flap-right)"
        />
      </g>
      <g>
        <rect
          width="156.89"
          height="156.89"
          x="437.6"
          y="337.22"
          rx="24.76"
          ry="24.76"
          fill="url(#empty-messages-zero)"
        />
        <path
          d="M487.82,414.69c0-9.81,1.01-17.7,3.03-23.68,2.02-5.98,5.02-10.59,9-13.84,3.98-3.24,8.99-4.87,15.02-4.87,4.45,0,8.36.9,11.71,2.69,3.36,1.79,6.13,4.38,8.32,7.75,2.19,3.38,3.9,7.49,5.15,12.34,1.24,4.85,1.87,11.38,1.87,19.61,0,9.73-1,17.59-3,23.57-2,5.98-4.99,10.6-8.97,13.86-3.98,3.26-9.01,4.89-15.08,4.89-8,0-14.28-2.87-18.84-8.6-5.47-6.9-8.2-18.14-8.2-33.73ZM498.28,414.69c0,13.62,1.59,22.68,4.78,27.19,3.19,4.51,7.12,6.76,11.8,6.76s8.61-2.26,11.8-6.79c3.19-4.53,4.78-13.58,4.78-27.16s-1.59-22.73-4.78-27.22c-3.19-4.49-7.16-6.73-11.91-6.73s-8.41,1.98-11.2,5.94c-3.51,5.06-5.26,14.39-5.26,28.01Z"
          fill="#c7c7d1"
        />
      </g>
    </svg>
  );
}
