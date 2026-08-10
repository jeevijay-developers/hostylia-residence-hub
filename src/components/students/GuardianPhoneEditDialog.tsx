import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { guardianPhoneUpdateSchema } from "@/schemas/guardian";
import { displayIndianPhone } from "@/schemas/auth";
import { updateGuardianPhone } from "@/lib/guardian.functions";
import { getErrorMessage } from "@/lib/utils";

interface GuardianPhoneEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  guardian: { id: string; full_name: string; phone: string };
}

export function GuardianPhoneEditDialog({
  open,
  onOpenChange,
  studentId,
  guardian,
}: GuardianPhoneEditDialogProps) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateGuardianPhone);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPhone(displayIndianPhone(guardian.phone));
      setError(null);
    }
  }, [open, guardian.phone]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = guardianPhoneUpdateSchema.parse({
        student_id: studentId,
        guardian_id: guardian.id,
        phone,
      });
      return updateFn({ data: parsed });
    },
    onSuccess: () => {
      toast.success("Guardian phone number updated");
      qc.invalidateQueries({ queryKey: ["student-guardians", studentId] });
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const withIssues = e as { issues?: Array<{ message: string }> };
      if (withIssues?.issues?.length) {
        setError(withIssues.issues[0].message);
        return;
      }
      toast.error(getErrorMessage(e, "Could not update phone number"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit guardian phone</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Guardian</Label>
            <p className="text-sm text-muted-foreground">{guardian.full_name}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guardian-phone">Phone</Label>
            <Input
              id="guardian-phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setError(null);
              }}
              placeholder="+91 98765 43210"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={save.isPending || phone.trim() === ""}
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
