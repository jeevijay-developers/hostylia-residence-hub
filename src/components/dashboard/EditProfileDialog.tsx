import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { profileUpdateSchema } from "@/schemas/profile";

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export async function fetchOwnProfile() {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, preferred_name, phone, email")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

export function EditProfileDialog({ open, onOpenChange }: EditProfileDialogProps) {
  const qc = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["own-profile"],
    queryFn: fetchOwnProfile,
    enabled: open,
  });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
      setErrors({});
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = profileUpdateSchema.parse({ fullName, phone });
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: parsed.fullName,
          phone: parsed.phone || null,
        })
        .eq("id", profile!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["own-profile"] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      if (e?.issues) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of e.issues) fieldErrors[issue.path[0]] = issue.message;
        setErrors(fieldErrors);
        return;
      }
      toast.error(e.message ?? "Failed to update profile");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-full-name">Full name</Label>
            <Input
              id="edit-full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-phone">Phone</Label>
            <Input id="edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input id="edit-email" value={profile?.email ?? ""} disabled />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!profile || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
