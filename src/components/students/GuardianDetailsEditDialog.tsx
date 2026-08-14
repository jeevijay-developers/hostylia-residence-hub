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
import { guardianStaffEditSchema } from "@/schemas/guardian";
import { displayIndianPhone } from "@/schemas/auth";
import { updateGuardianDetails } from "@/lib/guardian.functions";
import { getErrorMessage } from "@/lib/utils";
import type { GuardianAddress } from "@/components/students/GuardianCard";

interface GuardianDetailsEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  guardian: {
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    occupation: string | null;
    address: GuardianAddress | null;
  };
}

export function GuardianDetailsEditDialog({
  open,
  onOpenChange,
  studentId,
  guardian,
}: GuardianDetailsEditDialogProps) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateGuardianDetails);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [occupation, setOccupation] = useState("");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setFullName(guardian.full_name ?? "");
    setPhone(displayIndianPhone(guardian.phone ?? ""));
    setEmail(guardian.email ?? "");
    setOccupation(guardian.occupation ?? "");
    setLine1(guardian.address?.line1 ?? "");
    setCity(guardian.address?.city ?? "");
    setState(guardian.address?.state ?? "");
    setPincode(guardian.address?.pincode ?? "");
    setFieldErrors({});
  }, [open, guardian]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = guardianStaffEditSchema.safeParse({
        student_id: studentId,
        guardian_id: guardian.id,
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        occupation: occupation.trim(),
        address: { line1: line1.trim(), city: city.trim(), state: state.trim(), pincode: pincode.trim() },
      });
      if (!parsed.success) {
        const errs: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0];
          if (typeof key === "string" && !errs[key]) errs[key] = issue.message;
        }
        setFieldErrors(errs);
        throw new Error("Please fix the highlighted fields");
      }
      setFieldErrors({});
      return updateFn({ data: parsed.data });
    },
    onSuccess: () => {
      toast.success("Guardian details updated");
      qc.invalidateQueries({ queryKey: ["student-guardians", studentId] });
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      if (e instanceof Error && e.message === "Please fix the highlighted fields") return;
      toast.error(getErrorMessage(e, "Could not update guardian details"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit guardian / parent details</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="gd-name">Full name</Label>
            <Input id="gd-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            {fieldErrors.fullName && (
              <p className="text-xs text-destructive">{fieldErrors.fullName}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gd-phone">Phone</Label>
            <Input
              id="gd-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
            />
            {fieldErrors.phone && <p className="text-xs text-destructive">{fieldErrors.phone}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gd-email">Email</Label>
            <Input
              id="gd-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="gd-occupation">Occupation</Label>
            <Input
              id="gd-occupation"
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="gd-address">Permanent home address</Label>
            <Input
              id="gd-address"
              placeholder="House / street / area"
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gd-city">City</Label>
            <Input id="gd-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gd-state">State</Label>
            <Input id="gd-state" value={state} onChange={(e) => setState(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gd-pincode">Pincode</Label>
            <Input id="gd-pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={save.isPending || fullName.trim() === ""}
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
