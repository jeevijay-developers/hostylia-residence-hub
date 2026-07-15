import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
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

export function WardenChatThread({
  studentId,
  currentUserId,
}: {
  studentId: string;
  currentUserId: string;
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
    mutationFn: () =>
      sendFn({ data: { conversation_id: conversationId!, body: body.trim() } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to send"),
  });

  if (openQ.isLoading) return <Skeleton className="h-64 w-full" />;
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

  return (
    <div className="flex h-[70vh] flex-col rounded-lg border border-border bg-card">
      <div ref={scrollerRef} className="flex-1 space-y-2 overflow-y-auto p-3" lang={langAttr}>
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
        {(messagesQ.data ?? []).length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {t("parent.messages.systemJoined")}
          </p>
        )}
      </div>
      <form
        className="flex items-center gap-2 border-t border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim() && conversationId) send.mutate();
        }}
      >
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("parent.messages.startPlaceholder")}
          className="min-h-11"
          lang={langAttr}
        />
        <Button
          type="submit"
          className="min-h-11"
          disabled={!body.trim() || send.isPending || !conversationId}
        >
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
