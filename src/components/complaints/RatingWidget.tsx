import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { ComplaintRow } from "@/lib/complaint";

export function RatingWidget({ complaint }: { complaint: ComplaintRow }) {
  const [rating, setRating] = useState<number>(complaint.rating ?? 0);
  const [comment, setComment] = useState<string>(complaint.rating_comment ?? "");
  const qc = useQueryClient();

  const canRate = complaint.status === "RESOLVED" || complaint.status === "CLOSED";
  const canReopen =
    (complaint.status === "RESOLVED" || complaint.status === "CLOSED") &&
    complaint.reopen_until != null &&
    new Date(complaint.reopen_until).getTime() > Date.now();

  const saveRating = useMutation({
    mutationFn: async () => {
      if (rating < 1) throw new Error("Pick 1–5 stars");
      const { error } = await supabase
        .from("complaints")
        .update({ rating, rating_comment: comment || null })
        .eq("id", complaint.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Thanks for the feedback");
      qc.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const reopen = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("complaints")
        .update({ status: "REOPENED" })
        .eq("id", complaint.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Complaint reopened");
      qc.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Reopen failed"),
  });

  if (!canRate) return null;

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-3">
      <p className="text-sm font-medium">Rate this resolution</p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`Rate ${n} stars`}
            onClick={() => setRating(n)}
            className="p-0.5"
          >
            <Star
              size={22}
              className={n <= rating ? "fill-warning text-warning" : "text-muted-foreground"}
            />
          </button>
        ))}
      </div>
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="Optional comment"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => saveRating.mutate()} disabled={saveRating.isPending}>
          Save rating
        </Button>
        {canReopen && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => reopen.mutate()}
            disabled={reopen.isPending}
          >
            <RotateCcw size={14} className="mr-1" /> Reopen
          </Button>
        )}
        {!canReopen && (
          <span className="self-center text-xs text-muted-foreground">Reopen window closed.</span>
        )}
      </div>
    </div>
  );
}
