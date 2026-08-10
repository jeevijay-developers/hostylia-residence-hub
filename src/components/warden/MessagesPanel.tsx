import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, Loader2, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { sendMessage, markConversationRead } from "@/lib/messaging.functions";
import { useResolvedRole } from "@/lib/user-role";

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
  const unreadQueryKey = useMemo(
    () => ["warden-conversations-unread", userId, idsKey],
    [userId, idsKey],
  );
  const unreadQ = useQuery({
    queryKey: unreadQueryKey,
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("conversation_id, sent_at")
        .in("conversation_id", ids)
        .neq("sender_user_id", userId!)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as Array<{ conversation_id: string; sent_at: string }>;
    },
  });

  const unreadByConversation = useMemo(() => {
    const map = new Map<string, number>();
    const lastRead = new Map((listQ.data ?? []).map((c) => [c.conversation_id, c.last_read_at]));
    for (const m of unreadQ.data ?? []) {
      const readAt = lastRead.get(m.conversation_id);
      if (!readAt || new Date(m.sent_at) > new Date(readAt)) {
        map.set(m.conversation_id, (map.get(m.conversation_id) ?? 0) + 1);
      }
    }
    return map;
  }, [listQ.data, unreadQ.data]);

  const totalUnread = useMemo(
    () => Array.from(unreadByConversation.values()).reduce((a, b) => a + b, 0),
    [unreadByConversation],
  );

  /**
   * Marks every listed conversation read for this warden in one round trip
   * (conversation_participants.last_read_at, persisted, RLS-scoped to the
   * caller's own participant row via cp_update_self). The unread query cache
   * is cleared optimistically first so the header badge updates immediately
   * instead of waiting on the network write + refetch.
   */
  const markAllAsRead = useCallback(async () => {
    if (!userId || ids.length === 0) return;
    qc.setQueryData(unreadQueryKey, []);
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("conversation_participants")
      .update({ last_read_at: nowIso })
      .eq("user_id", userId)
      .in("conversation_id", ids)
      .is("left_at", null);
    if (error) {
      // Reconcile with the server if the persisted write failed.
      qc.invalidateQueries({ queryKey: unreadQueryKey });
      throw error;
    }
    qc.setQueryData(["warden-conversations", userId], (prev: ConversationRow[] | undefined) =>
      (prev ?? []).map((c) => ({ ...c, last_read_at: nowIso })),
    );
  }, [ids, qc, unreadQueryKey, userId]);

  return { listQ, unreadByConversation, totalUnread, markAllAsRead };
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

  const { listQ, unreadByConversation, totalUnread, markAllAsRead } =
    useWardenConversations(userId);

  const onMessagesRead = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["warden-conversations-unread", userId] });
  }, [qc, userId]);

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
          <div className="flex-1 overflow-y-auto">
            {listQ.isLoading && <Skeleton className="m-4 h-40" />}
            {!listQ.isLoading && (listQ.data ?? []).length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No parent conversations yet.
              </p>
            )}
            <ul className="divide-y divide-border">
              {(listQ.data ?? []).map((c) => {
                const unread = unreadByConversation.get(c.conversation_id) ?? 0;
                const label = c.conversations.students?.full_name ?? "Parent";
                return (
                  <li key={c.conversation_id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm hover:bg-muted/50"
                      onClick={() => setActiveConversation({ id: c.conversation_id, label })}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(c.conversations.updated_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                      {unread > 0 && (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                          {unread > 9 ? "9+" : unread}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
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
          <p className="py-8 text-center text-xs text-muted-foreground">No messages yet.</p>
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
