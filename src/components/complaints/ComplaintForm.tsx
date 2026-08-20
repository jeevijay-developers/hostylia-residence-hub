import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, EyeOff, Info, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { registerDocument } from "@/lib/student.functions";
import { useComplaintCategories, useStudentSelf } from "@/lib/complaint";
import { complaintFormSchema } from "@/schemas/complaint";
import { useKycComplete } from "@/lib/kyc";
import { KycGateNotice } from "@/components/students/KycGateNotice";

export function ComplaintForm({ onDone }: { onDone?: () => void }) {
  const student = useStudentSelf();
  const propId = student.data?.property_id ?? null;
  const cats = useComplaintCategories(propId);
  const qc = useQueryClient();
  const registerFn = useServerFn(registerDocument);
  const { complete: kycComplete } = useKycComplete(student.data?.id);

  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      const parsed = complaintFormSchema.parse({
        category_id: categoryId,
        title,
        description,
        priority: priority || undefined,
        is_anonymous: isAnonymous,
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
          is_anonymous: parsed.is_anonymous,
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
      setCategoryId("");
      setTitle("");
      setDescription("");
      setPhoto(null);
      setPriority("");
      setIsAnonymous(false);
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
          placeholder="Describe your issue…"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
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
          </div>
          {photo && (
            <span className="block truncate text-xs text-muted-foreground">{photo.name}</span>
          )}
        </div>
      </div>
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3">
        <Checkbox
          id="complaint-anonymous"
          checked={isAnonymous}
          onCheckedChange={(v) => setIsAnonymous(v === true)}
          className="mt-0.5"
        />
        <div className="space-y-0.5">
          <Label htmlFor="complaint-anonymous" className="flex items-center gap-1.5 font-normal">
            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
            Submit anonymously
          </Label>
          <p className="text-xs text-muted-foreground">
            Your name won't be shown to the Hostel Admin or Warden. Status tracking works the same
            either way.
          </p>
        </div>
      </div>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {student.data?.allocation
          ? "Auto-tagging room/bed from your current allocation."
          : "You don't have an active allocation — the complaint will be filed against the property."}
      </p>
      {!kycComplete && <KycGateNotice message="Complete your KYC to submit a complaint." />}
      <Button type="submit" className="rounded-full" disabled={!kycComplete || submit.isPending}>
        {submit.isPending ? "Submitting…" : "Submit complaint"}
      </Button>
    </form>
  );
}
