import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { format, isToday, isYesterday } from "date-fns";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  openParentWardenConversation,
  sendMessage,
  markConversationRead,
} from "@/lib/messaging.functions";

interface Msg {
  id: string;
  body: string | null;
  sender_user_id: string;
  sent_at: string;
  message_type: string;
}

interface MsgGroup {
  key: string;
  label: string;
  messages: Msg[];
}

function groupMessagesByDay(messages: Msg[]): MsgGroup[] {
  const groups: MsgGroup[] = [];
  for (const m of messages) {
    const d = new Date(m.sent_at);
    const key = format(d, "yyyy-MM-dd");
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.messages.push(m);
      continue;
    }
    const label = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "d MMM yyyy");
    groups.push({ key, label, messages: [m] });
  }
  return groups;
}

export function WardenChatThread({
  studentId,
  currentUserId,
  studentName,
}: {
  studentId: string;
  currentUserId: string;
  studentName: string;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const openFn = useServerFn(openParentWardenConversation);
  const sendFn = useServerFn(sendMessage);
  const markFn = useServerFn(markConversationRead);

  const openQ = useQuery({
    queryKey: ["pw-conversation", studentId],
    queryFn: () => openFn({ data: { student_id: studentId } }),
    staleTime: 60_000,
  });
  const conversationId = openQ.data?.conversation_id ?? null;
  const noWarden = openQ.data && openQ.data.warden_count === 0;

  const messagesQ = useQuery({
    queryKey: ["messages", conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<Msg[]> => {
      const { data } = await supabase
        .from("messages")
        .select("id, body, sender_user_id, sent_at, message_type")
        .eq("conversation_id", conversationId!)
        .is("deleted_at", null)
        .order("sent_at", { ascending: true })
        .limit(200);
      return (data ?? []) as Msg[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;
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

  // Mark read on load / new messages
  useEffect(() => {
    if (conversationId) void markFn({ data: { conversation_id: conversationId } });
  }, [conversationId, messagesQ.data?.length, markFn]);

  const [body, setBody] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [messagesQ.data?.length]);

  const send = useMutation({
    mutationFn: () => sendFn({ data: { conversation_id: conversationId!, body: body.trim() } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to send"),
  });

  const groups = useMemo(() => groupMessagesByDay(messagesQ.data ?? []), [messagesQ.data]);

  if (openQ.isLoading) return <Skeleton className="h-[70vh] w-full rounded-2xl sm:h-[75vh]" />;
  if (openQ.error) {
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        {openQ.error instanceof Error ? openQ.error.message : "Failed to open chat"}
      </p>
    );
  }
  if (noWarden) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        {t("parent.messages.noWarden")}
      </p>
    );
  }

  const langAttr = i18n.language?.startsWith("hi") ? "hi" : "en";
  const initial = studentName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card-ambient sm:h-[75vh]">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary ring-1 ring-primary/20"
          aria-hidden="true"
        >
          {initial}
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold text-foreground">
            {studentName}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {t("parent.messages.headerSubtitle")}
          </p>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex-1 space-y-1 overflow-y-auto p-3 sm:p-4"
        lang={langAttr}
      >
        {groups.map((group) => (
          <div key={group.key}>
            <div className="my-3 flex justify-center first:mt-0">
              <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
                {group.label}
              </span>
            </div>
            {group.messages.map((m) => {
              const mine = m.sender_user_id === currentUserId;
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "flex max-w-[82%] flex-col sm:max-w-[70%]",
                      mine ? "items-end" : "items-start",
                    )}
                  >
                    <div
                      className={cn(
                        "break-words rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                        mine
                          ? "rounded-br-sm bg-primary text-primary-foreground"
                          : "rounded-bl-sm bg-muted text-foreground",
                      )}
                    >
                      {m.body}
                    </div>
                    <span className="mt-1 px-1 text-[10px] text-muted-foreground">
                      {format(new Date(m.sent_at), "h:mm a")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {(messagesQ.data ?? []).length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {t("parent.messages.systemJoined")}
          </p>
        )}
      </div>
      <form
        className="flex items-center gap-2 border-t border-border p-2.5 sm:p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim() && conversationId) send.mutate();
        }}
      >
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("parent.messages.startPlaceholder")}
          className="min-h-11 rounded-full"
          lang={langAttr}
        />
        <Button
          type="submit"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full"
          disabled={!body.trim() || send.isPending || !conversationId}
          aria-label={t("common.send")}
        >
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
