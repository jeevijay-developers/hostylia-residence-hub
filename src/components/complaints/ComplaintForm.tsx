import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { registerDocument } from "@/lib/student.functions";
import { useComplaintCategories, useStudentSelf } from "@/lib/complaint";
import { complaintFormSchema } from "@/schemas/complaint";

export function ComplaintForm({ onDone }: { onDone?: () => void }) {
  const student = useStudentSelf();
  const propId = student.data?.property_id ?? null;
  const cats = useComplaintCategories(propId);
  const qc = useQueryClient();
  const registerFn = useServerFn(registerDocument);

  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("");
  const [photo, setPhoto] = useState<File | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      const parsed = complaintFormSchema.parse({
        category_id: categoryId,
        title,
        description,
        priority: priority || undefined,
      });
      if (!student.data) throw new Error("Student profile not found");
      const s = student.data;
      const { data: inserted, error } = await supabase
        .from("complaints")
        .insert({
          tenant_id: s.tenant_id,
          property_id: s.property_id,
          student_id: s.id,
          block_id: s.allocation?.block_id ?? null,
          room_id: s.allocation?.room_id ?? null,
          bed_id: s.allocation?.bed_id ?? null,
          category_id: parsed.category_id,
          title: parsed.title,
          description: parsed.description,
          priority: parsed.priority ?? "MEDIUM",
          complaint_number: "", // trigger fills
          sla_due_at: new Date().toISOString(), // trigger overwrites
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      if (photo) {
        const path = `${s.tenant_id}/${s.property_id}/${inserted.id}/${Date.now()}-${photo.name}`;
        const { error: upErr } = await supabase.storage
          .from("complaint-media")
          .upload(path, photo, { contentType: photo.type, upsert: false });
        if (upErr) throw upErr;
        await registerFn({
          data: {
            tenant_id: s.tenant_id,
            property_id: s.property_id,
            owner_type: "COMPLAINT",
            owner_id: inserted.id,
            document_type: "PHOTO",
            storage_bucket: "complaint-media",
            storage_path: path,
            original_filename: photo.name,
            mime_type: photo.type || "image/jpeg",
            size_bytes: photo.size,
          },
        });
      }
      return inserted.id;
    },
    onSuccess: () => {
      toast.success("Complaint submitted");
      setCategoryId(""); setTitle(""); setDescription(""); setPhoto(null); setPriority("");
      qc.invalidateQueries({ queryKey: ["complaints"] });
      onDone?.();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to submit"),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}
    >
      <div className="space-y-1">
        <Label>Category</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger><SelectValue placeholder="Pick a category" /></SelectTrigger>
          <SelectContent>
            {(cats.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required />
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={4000}
          required
        />
      </div>
      <div className="space-y-1">
        <Label>Priority (optional)</Label>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger><SelectValue placeholder="Use category default" /></SelectTrigger>
          <SelectContent>
            {["LOW","MEDIUM","HIGH","URGENT"].map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Photo (optional)</Label>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
            <Camera size={16} /> Take photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
            <Upload size={16} /> Upload
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
          {photo && <span className="self-center truncate text-xs text-muted-foreground">{photo.name}</span>}
        </div>
      </div>
      {student.data?.allocation ? (
        <p className="text-xs text-muted-foreground">
          Auto-tagging room/bed from your current allocation.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          You don't have an active allocation — the complaint will be filed against the property.
        </p>
      )}
      <Button type="submit" disabled={submit.isPending}>
        {submit.isPending ? "Submitting…" : "Submit complaint"}
      </Button>
    </form>
  );
}
