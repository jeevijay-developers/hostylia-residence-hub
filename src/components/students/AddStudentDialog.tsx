import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createStudentManual } from "@/lib/student.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  propertyId: string;
  onDone: () => void;
}

export function AddStudentDialog({ open, onOpenChange, tenantId, propertyId, onDone }: Props) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");

  const nameValid = fullName.trim().length >= 2;
  const guardianValid =
    guardianName.trim().length >= 2 && /^\+?[1-9]\d{7,14}$/.test(guardianPhone.trim());
  const canSubmit = nameValid && guardianValid;

  const createFn = useServerFn(createStudentManual);
  const createMut = useMutation({
    mutationFn: async () =>
      createFn({
        data: {
          tenant_id: tenantId,
          property_id: propertyId,
          full_name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          date_of_birth: dob,
          gender,
          guardian_name: guardianName.trim(),
          guardian_phone: guardianPhone.trim(),
        },
      }),
    onSuccess: (r) => {
      toast.success(`Student added — admission #${r.admission_number}`);
      onDone();
      onOpenChange(false);
      setFullName("");
      setPhone("");
      setEmail("");
      setGender("");
      setDob("");
      setGuardianName("");
      setGuardianPhone("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add student"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add student</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <Label htmlFor="s-name">Full name *</Label>
            <Input id="s-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="s-phone">Phone</Label>
              <Input
                id="s-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91…"
              />
            </div>
            <div>
              <Label htmlFor="s-email">Email</Label>
              <Input
                id="s-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="s-dob">Date of birth</Label>
              <Input id="s-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-t border-border pt-4">
            <div>
              <Label htmlFor="s-g-name">Guardian name *</Label>
              <Input
                id="s-g-name"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="s-g-phone">Guardian phone *</Label>
              <Input
                id="s-g-phone"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                placeholder="+91…"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit || createMut.isPending} onClick={() => createMut.mutate()}>
            <UserPlus className="h-4 w-4" /> Add student
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
