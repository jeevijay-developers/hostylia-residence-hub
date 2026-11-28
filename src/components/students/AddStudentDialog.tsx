import { StudentFormDialog } from "@/components/hostel/students/StudentFormDialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  propertyId: string;
  onDone: () => void;
}

/** Kept for existing call sites; the Students tab form is the single Add student flow. */
export function AddStudentDialog({ open, onOpenChange, tenantId, propertyId, onDone }: Props) {
  return (
    <StudentFormDialog
      mode="add"
      open={open}
      onOpenChange={onOpenChange}
      tenantId={tenantId}
      propertyId={propertyId}
      onDone={onDone}
    />
  );
}
