import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function EditProfileDialog({ open, onOpenChange, userId }: EditProfileDialogProps) {
  const qc = useQueryClient();
  const profileQ = useQuery({
    queryKey: ["my-profile", userId],
    enabled: open && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, preferred_name, phone, email")
        .eq("id", userId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [fullName, setFullName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (profileQ.data) {
      setFullName(profileQ.data.full_name ?? "");
      setPreferredName(profileQ.data.preferred_name ?? "");
      setPhone(profileQ.data.phone ?? "");
      setEmail(profileQ.data.email ?? "");
    }
  }, [profileQ.data]);

  const nameValid = /\p{L}/u.test(fullName) && fullName.trim().length >= 2;
  const emailValid = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          preferred_name: preferredName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
        })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["my-profile", userId] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update profile"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
        </DialogHeader>
        {profileQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="pf-name">Full name</Label>
              <Input id="pf-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              {!nameValid && fullName.trim().length > 0 && (
                <p className="text-xs text-destructive">Enter a valid name (letters only, at least 2 characters).</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf-preferred">Preferred name (optional)</Label>
              <Input id="pf-preferred" value={preferredName} onChange={(e) => setPreferredName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf-phone">Phone</Label>
              <Input id="pf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf-email">Email</Label>
              <Input id="pf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {!emailValid && (
                <p className="text-xs text-destructive">Enter a valid email address.</p>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!nameValid || !emailValid || save.isPending || profileQ.isLoading}
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
