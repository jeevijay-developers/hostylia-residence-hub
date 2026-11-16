import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { useComplaintComments, type ComplaintWithRelations } from "@/lib/complaint";
import { complaintCommentSchema } from "@/schemas/complaint";

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  STUDENT: { label: "Student", className: "border-border bg-muted text-muted-foreground" },
  WARDEN: { label: "Warden", className: "border-transparent bg-info/10 text-info" },
  ADMIN: { label: "Admin", className: "border-transparent bg-primary/10 text-primary" },
};

export function ComplaintCommentThread({
  complaint,
  userId,
  canWrite = true,
}: {
  complaint: Pick<ComplaintWithRelations, "id" | "tenant_id" | "property_id">;
  userId: string | null;
  /** Hides the composer for Read-tier students — RLS blocks the insert either way. */
  canWrite?: boolean;
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
      <Label className="flex items-center gap-1 text-xs">
        <MessageSquare className="h-3 w-3" /> Conversation
      </Label>
      {commentsQ.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {!commentsQ.isLoading && (commentsQ.data ?? []).length === 0 && (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      )}
      <div className="max-h-56 space-y-2 overflow-y-auto">
        {(commentsQ.data ?? []).map((m) => (
          <div key={m.id} className="rounded-md border border-border p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">
                  {m.is_anonymous_author ? "Anonymous student" : (m.author_full_name ?? "User")}
                </span>
                {m.author_role && ROLE_BADGE[m.author_role] && (
                  <Badge
                    variant="outline"
                    className={`px-1.5 py-0 text-[10px] ${ROLE_BADGE[m.author_role].className}`}
                  >
                    {ROLE_BADGE[m.author_role].label}
                  </Badge>
                )}
              </span>
              <span className="text-muted-foreground">
                {m.created_at ? new Date(m.created_at).toLocaleString() : ""}
              </span>
            </div>
            <p className="mt-1 text-muted-foreground">{m.body}</p>
          </div>
        ))}
      </div>
      {canWrite && (
        <div className="flex gap-2">
          <Textarea
            placeholder="Add a comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="flex-1"
          />
          <Button
            size="sm"
            disabled={postComment.isPending || !comment.trim()}
            onClick={() => postComment.mutate()}
          >
            Post
          </Button>
        </div>
      )}
    </div>
  );
}
