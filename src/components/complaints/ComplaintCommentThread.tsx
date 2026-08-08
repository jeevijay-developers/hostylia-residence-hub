import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { useComplaintComments, type ComplaintWithRelations } from "@/lib/complaint";
import { complaintCommentSchema } from "@/schemas/complaint";

export function ComplaintCommentThread({
  complaint, userId,
}: {
  complaint: Pick<ComplaintWithRelations, "id" | "tenant_id" | "property_id">;
  userId: string | null;
}) {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const commentsQ = useComplaintComments(complaint.id);

  const postComment = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("You must be signed in to comment");
      const parsed = complaintCommentSchema.parse({ body: comment });
      const { error } = await supabase.from("complaint_comments").insert({
        tenant_id: complaint.tenant_id,
        property_id: complaint.property_id,
        complaint_id: complaint.id,
        author_user_id: userId,
        body: parsed.body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["complaint-comments", complaint.id] });
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not post comment")),
  });

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1 text-xs"><MessageSquare className="h-3 w-3" /> Conversation</Label>
      {commentsQ.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {!commentsQ.isLoading && (commentsQ.data ?? []).length === 0 && (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      )}
      <div className="max-h-56 space-y-2 overflow-y-auto">
        {(commentsQ.data ?? []).map((m) => (
          <div key={m.id} className="rounded-md border border-border p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground">{m.profiles?.full_name ?? "User"}</span>
              <span className="text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
            </div>
            <p className="mt-1 text-muted-foreground">{m.body}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Textarea
          placeholder="Add a comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          className="flex-1"
        />
        <Button size="sm" disabled={postComment.isPending || !comment.trim()} onClick={() => postComment.mutate()}>
          Post
        </Button>
      </div>
    </div>
  );
}
