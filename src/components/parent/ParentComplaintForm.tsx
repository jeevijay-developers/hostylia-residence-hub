import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useComplaintCategories } from "@/lib/complaint";
import { complaintFormSchema } from "@/schemas/complaint";
import type { ParentChild } from "@/lib/parent";

/**
 * Parent-side "file a complaint for my child" form — modeled on
 * ComplaintForm.tsx (student self-service) but targets an explicit child
 * (ParentPageFrame's selected student) instead of useStudentSelf(), and
 * skips the anonymous-submission option (hiding the author from staff
 * doesn't make sense for a parent-filed complaint) and KYC/photo gating
 * (parent-specific, not the student's own KYC state). RLS enforces the
 * guardian link + can_create_complaints ("complaints parent insert",
 * 20260821104351_parent_module_permissions.sql) — this form is UX only.
 */
export function ParentComplaintForm({
  child,
  userId,
  onDone,
}: {
  child: ParentChild;
  userId: string;
  onDone?: () => void;
}) {
  const cats = useComplaintCategories(child.property_id);
  const qc = useQueryClient();

  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("");

  const submit = useMutation({
    mutationFn: async () => {
      const parsed = complaintFormSchema.parse({
        category_id: categoryId,
        title,
        description,
        priority: priority || undefined,
        is_anonymous: false,
      });
      const { error } = await supabase.from("complaints").insert({
        tenant_id: child.tenant_id,
        property_id: child.property_id,
        student_id: child.student_id,
        category_id: parsed.category_id,
        title: parsed.title,
        description: parsed.description,
        priority: parsed.priority ?? "MEDIUM",
        is_anonymous: false,
        created_by: userId,
        complaint_number: "", // trigger fills
        sla_due_at: new Date().toISOString(), // trigger overwrites
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Complaint submitted");
      setCategoryId("");
      setTitle("");
      setDescription("");
      setPriority("");
      qc.invalidateQueries({ queryKey: ["complaints"] });
      onDone?.();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to submit"),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a category" />
            </SelectTrigger>
            <SelectContent>
              {(cats.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            required
            placeholder="Enter title"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={4000}
          required
          placeholder={`Describe the issue for ${child.student_name}…`}
        />
      </div>
      <div className="space-y-1 sm:w-1/2">
        <Label>Priority (optional)</Label>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger>
            <SelectValue placeholder="Use category default" />
          </SelectTrigger>
          <SelectContent>
            {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="rounded-full" disabled={submit.isPending}>
        {submit.isPending ? "Submitting…" : "Submit complaint"}
      </Button>
    </form>
  );
}
