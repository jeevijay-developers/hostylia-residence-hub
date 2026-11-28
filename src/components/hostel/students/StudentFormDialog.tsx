import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  BedSingle,
  CheckCircle2,
  CircleDashed,
  Clock,
  GraduationCap,
  IndianRupee,
  Loader2,
  ReceiptIndianRupee,
  RotateCw,
  Save,
  ShieldCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBedLabel } from "@/lib/bed-label";
import { formatIstDate } from "@/lib/ist";
import { invalidateStudentsTab, useStudentForEdit } from "@/lib/property-students";
import {
  addStudentCharge,
  admitStudent,
  updateStudentDetails,
  type StudentEditSnapshot,
} from "@/lib/student-admin.functions";
import { formatRupees, usePropertyToday } from "@/lib/student-placement";
import { cn, getErrorMessage } from "@/lib/utils";
import {
  addStudentChargeSchema,
  admitStudentSchema,
  rupeesTextField,
  rupeesTextToPaise,
  studentDetailsSchema,
  updateStudentDetailsSchema,
  type AddStudentChargeInput,
  type AdmitStudentInput,
  type StudentDetailsInput,
  type UpdateStudentDetailsInput,
} from "@/schemas/student";

import { RecordPaymentDialog } from "./RecordPaymentDialog";
import {
  DATE_INPUT_CLASS,
  StudentChargeFields,
  StudentField,
  type StudentChargeErrors,
  type StudentChargeValue,
} from "./StudentChargeFields";
import {
  StudentPlacementFields,
  type StudentPlacementErrors,
  type StudentPlacementValue,
} from "./StudentPlacementFields";
import { StudentStatusPill } from "./StudentStatusPill";

/* ------------------------------------------------------------------------- */
/* Form state                                                                 */
/* ------------------------------------------------------------------------- */

const RELATIONSHIP_OPTIONS = [
  "Father",
  "Mother",
  "Guardian",
  "Brother",
  "Sister",
  "Relative",
  "Other",
] as const;
type RelationshipOption = (typeof RELATIONSHIP_OPTIONS)[number];

type Gender = "" | "MALE" | "FEMALE" | "OTHER";
const GENDER_UNSET = "UNSET";

type DetailsKey = keyof StudentDetailsInput;

interface DetailsState {
  full_name: string;
  admission_number: string;
  phone: string;
  email: string;
  date_of_birth: string;
  gender: Gender;
  academic_institute: string;
  course_name: string;
  academic_year: string;
  guardian_name: string;
  guardian_phone: string;
  relationshipChoice: RelationshipOption;
  relationshipOther: string;
  guardian_email: string;
}

interface FormState {
  details: DetailsState;
  initialStatus: "APPLICANT" | "VERIFIED";
  assignBed: boolean;
  placement: StudentPlacementValue;
  addCharge: boolean;
  charge: StudentChargeValue;
}

const EMPTY_DETAILS: DetailsState = {
  full_name: "",
  admission_number: "",
  phone: "",
  email: "",
  date_of_birth: "",
  gender: "",
  academic_institute: "",
  course_name: "",
  academic_year: "",
  guardian_name: "",
  guardian_phone: "",
  relationshipChoice: "Father",
  relationshipOther: "",
  guardian_email: "",
};

const EMPTY_STUDENT_PLACEMENT: StudentPlacementValue = {
  bedId: "",
  feePlanId: "",
  startDate: "",
  rentRupees: "",
  depositRupees: "",
};

const EMPTY_STUDENT_CHARGE: StudentChargeValue = {
  amountRupees: "",
  dueDate: "",
  note: "",
  paidNow: false,
  paidRupees: "",
  mode: "CASH",
  reference: "",
  chequeDate: "",
};

const EMPTY_FORM: FormState = {
  details: EMPTY_DETAILS,
  initialStatus: "APPLICANT",
  assignBed: false,
  placement: EMPTY_STUDENT_PLACEMENT,
  addCharge: false,
  charge: EMPTY_STUDENT_CHARGE,
};

function detailsFromSnapshot(d: StudentDetailsInput): DetailsState {
  const rel = d.guardian_relationship.trim();
  // Older rows hold free text ("GUARDIAN", "Parent"): match a preset case-insensitively.
  const preset = RELATIONSHIP_OPTIONS.find(
    (o) => o !== "Other" && o.toLowerCase() === rel.toLowerCase(),
  );
  return {
    full_name: d.full_name,
    admission_number: d.admission_number ?? "",
    phone: d.phone ?? "",
    email: d.email ?? "",
    date_of_birth: d.date_of_birth ?? "",
    gender: d.gender ?? "",
    academic_institute: d.academic_institute ?? "",
    course_name: d.course_name ?? "",
    academic_year: d.academic_year ?? "",
    guardian_name: d.guardian_name,
    guardian_phone: d.guardian_phone,
    relationshipChoice: preset ?? (rel ? "Other" : "Father"),
    relationshipOther: preset || !rel ? "" : rel,
    guardian_email: d.guardian_email ?? "",
  };
}

function detailsToInput(d: DetailsState): StudentDetailsInput {
  return {
    full_name: d.full_name,
    admission_number: d.admission_number,
    phone: d.phone,
    email: d.email,
    date_of_birth: d.date_of_birth,
    gender: d.gender,
    academic_institute: d.academic_institute,
    course_name: d.course_name,
    academic_year: d.academic_year,
    guardian_name: d.guardian_name,
    guardian_phone: d.guardian_phone,
    guardian_relationship:
      d.relationshipChoice === "Other" ? d.relationshipOther : d.relationshipChoice,
    guardian_email: d.guardian_email,
  };
}

/* ------------------------------------------------------------------------- */
/* Validation: shared Zod schemas, issues mapped back onto form fields         */
/* ------------------------------------------------------------------------- */

interface FormErrors {
  details: Partial<Record<DetailsKey, string>>;
  placement: StudentPlacementErrors;
  charge: StudentChargeErrors;
  general: string | null;
}

const DETAIL_KEYS = new Set<string>(Object.keys(studentDetailsSchema.shape));

const PLACEMENT_FIELD: Record<string, keyof StudentPlacementValue> = {
  bed_id: "bedId",
  fee_plan_id: "feePlanId",
  start_date: "startDate",
  rent_snapshot_paise: "rentRupees",
  deposit_snapshot_paise: "depositRupees",
};
const CHARGE_FIELD: Record<string, keyof StudentChargeValue> = {
  amount_paise: "amountRupees",
  due_date: "dueDate",
  note: "note",
};
const PAYMENT_FIELD: Record<string, keyof StudentChargeValue> = {
  amount_paise: "paidRupees",
  mode: "mode",
  reference: "reference",
  cheque_date: "chequeDate",
};

function emptyErrors(): FormErrors {
  return { details: {}, placement: {}, charge: {}, general: null };
}

function setOnce<K extends string>(
  bag: Partial<Record<K, string>>,
  key: K,
  message: string | null,
) {
  if (message && !bag[key]) bag[key] = message;
}

function rupeeTextError(text: string): string | null {
  const r = rupeesTextField.safeParse(text);
  return r.success ? null : (r.error.issues[0]?.message ?? "Enter a valid amount");
}

function placementToInput(v: StudentPlacementValue, errors: StudentPlacementErrors) {
  if (!v.bedId) errors.bedId = "Choose a vacant bed";
  if (!v.rentRupees.trim()) errors.rentRupees = "Enter the monthly rent";
  else setOnce(errors, "rentRupees", rupeeTextError(v.rentRupees));
  if (!v.depositRupees.trim()) errors.depositRupees = "Enter the security deposit (0 if none)";
  else setOnce(errors, "depositRupees", rupeeTextError(v.depositRupees));
  return {
    bed_id: v.bedId,
    fee_plan_id: v.feePlanId,
    start_date: v.startDate,
    rent_snapshot_paise: rupeesTextToPaise(v.rentRupees),
    deposit_snapshot_paise: rupeesTextToPaise(v.depositRupees),
  };
}

function chargeToInput(v: StudentChargeValue, errors: StudentChargeErrors) {
  setOnce(errors, "amountRupees", rupeeTextError(v.amountRupees));
  if (v.paidNow) setOnce(errors, "paidRupees", rupeeTextError(v.paidRupees));
  return {
    amount_paise: rupeesTextToPaise(v.amountRupees),
    due_date: v.dueDate,
    note: v.note,
    payment: v.paidNow
      ? {
          amount_paise: rupeesTextToPaise(v.paidRupees),
          mode: v.mode,
          reference: v.mode === "CASH" ? "" : v.reference,
          cheque_date: v.mode === "CHEQUE" ? v.chequeDate : "",
        }
      : undefined,
  };
}

/** Routes a charge-schema issue path (amount_paise, payment.reference, …) to its field. */
function chargeIssueField(path: (string | number)[]): keyof StudentChargeValue | undefined {
  return path[0] === "payment" ? PAYMENT_FIELD[String(path[1])] : CHARGE_FIELD[String(path[0])];
}

function routeDetailsIssue(errors: FormErrors, path: (string | number)[], message: string) {
  const key = String(path[0]);
  if (DETAIL_KEYS.has(key)) setOnce(errors.details, key as DetailsKey, message);
  else errors.general ??= message;
}

function hasAnyError(e: FormErrors): boolean {
  return (
    Object.keys(e.details).length > 0 ||
    Object.keys(e.placement).length > 0 ||
    Object.keys(e.charge).length > 0 ||
    e.general !== null
  );
}

function validateAdd(
  form: FormState,
  tenantId: string,
  propertyId: string,
): { errors: FormErrors; input: AdmitStudentInput | null } {
  const errors = emptyErrors();
  const raw = {
    ...detailsToInput(form.details),
    tenant_id: tenantId,
    property_id: propertyId,
    initial_status: form.initialStatus,
    placement: form.assignBed ? placementToInput(form.placement, errors.placement) : undefined,
    charge: form.addCharge ? chargeToInput(form.charge, errors.charge) : undefined,
  };
  const parsed = admitStudentSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const [head, ...rest] = issue.path;
      if (head === "placement") {
        const field = PLACEMENT_FIELD[String(rest[0])];
        if (field) setOnce(errors.placement, field, issue.message);
      } else if (head === "charge") {
        const field = chargeIssueField(rest);
        if (field) setOnce(errors.charge, field, issue.message);
      } else {
        routeDetailsIssue(errors, issue.path, issue.message);
      }
    }
  }
  return { errors, input: parsed.success && !hasAnyError(errors) ? parsed.data : null };
}

/** Details are only validated (and saved) when changed, so a charge can be added to any record. */
function validateEdit(
  form: FormState,
  studentId: string,
  isDetailsDirty: boolean,
): {
  errors: FormErrors;
  details: UpdateStudentDetailsInput | null;
  charge: AddStudentChargeInput | null;
} {
  const errors = emptyErrors();
  const details = isDetailsDirty
    ? updateStudentDetailsSchema.safeParse({
        ...detailsToInput(form.details),
        student_id: studentId,
      })
    : null;
  if (details && !details.success) {
    for (const issue of details.error.issues) routeDetailsIssue(errors, issue.path, issue.message);
  }
  let charge: AddStudentChargeInput | null = null;
  if (form.addCharge) {
    const parsedCharge = addStudentChargeSchema.safeParse({
      ...chargeToInput(form.charge, errors.charge),
      student_id: studentId,
    });
    if (parsedCharge.success) charge = parsedCharge.data;
    else {
      for (const issue of parsedCharge.error.issues) {
        const field = chargeIssueField(issue.path);
        if (field) setOnce(errors.charge, field, issue.message);
        else errors.general ??= issue.message;
      }
    }
  }
  const isValid = !hasAnyError(errors);
  return {
    errors,
    details: isValid && details?.success ? details.data : null,
    charge: isValid ? charge : null,
  };
}

/* ------------------------------------------------------------------------- */
/* Presentation helpers                                                       */
/* ------------------------------------------------------------------------- */

function FormSection({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-4 py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-accent/10 text-neutral-accent">
            <Icon aria-hidden="true" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 id={id} className="text-sm font-semibold text-foreground">
              {title}
            </h3>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SectionToggle({
  id,
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="cursor-pointer text-sm">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

const STAY_LABEL: Record<string, string> = {
  PENDING_AGREEMENT: "Bed held — waiting for the agreement to be signed",
  PENDING_PAYMENT: "Agreement signed — waiting for the first payment",
  ACTIVE: "Staying",
  NOTICE_GIVEN: "Notice given",
  MOVE_OUT_INSPECTION: "Move-out inspection",
};

const INVOICE_STATE: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  ISSUED: { label: "Due", icon: Clock, tone: "text-info" },
  PARTIALLY_PAID: { label: "Part paid", icon: CircleDashed, tone: "text-warning" },
  OVERDUE: { label: "Overdue", icon: AlertTriangle, tone: "text-destructive" },
  PARTIALLY_REFUNDED: { label: "Part refunded", icon: CircleDashed, tone: "text-muted-foreground" },
};

function CurrentStay({ allocation }: { allocation: StudentEditSnapshot["openAllocation"] }) {
  if (!allocation) {
    return (
      <p className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
        No bed assigned. Use Actions → Assign bed on the students list.
      </p>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 px-3 py-3 text-sm">
      <p className="flex items-center gap-2 font-medium text-foreground">
        <BedSingle aria-hidden="true" className="h-4 w-4 shrink-0 text-bed-occupied" />
        {allocation.bed
          ? formatBedLabel(allocation.room, allocation.bed)
          : `Room ${allocation.room ?? "—"}`}
      </p>
      <p className="text-xs text-muted-foreground">
        {STAY_LABEL[allocation.status] ?? allocation.status.replace(/_/g, " ").toLowerCase()} ·
        since {formatIstDate(allocation.start_date)}
        {allocation.requested_move_out_date
          ? ` · moving out ${formatIstDate(allocation.requested_move_out_date)}`
          : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        To move the student, use Actions → Change bed.
      </p>
    </div>
  );
}

function OpenInvoicesList({ snapshot }: { snapshot: StudentEditSnapshot }) {
  if (snapshot.openInvoices.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
        <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-success" />
        No unpaid invoices.
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-border">
      <ul className="divide-y divide-border">
        {snapshot.openInvoices.map((inv) => {
          const state = INVOICE_STATE[inv.status] ?? INVOICE_STATE.ISSUED;
          const StateIcon = state.icon;
          return (
            <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{inv.invoice_number}</p>
                <p className="truncate text-xs text-muted-foreground">
                  Due {formatIstDate(inv.due_date)}
                  {inv.notes ? ` · ${inv.notes}` : ""}
                </p>
              </div>
              <span
                className={cn("inline-flex items-center gap-1 text-xs font-medium", state.tone)}
              >
                <StateIcon aria-hidden="true" className="h-3.5 w-3.5" />
                {state.label}
              </span>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {formatRupees(inv.balance_paise)}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Total outstanding</span>
        <span className="font-semibold tabular-nums text-foreground">
          {formatRupees(snapshot.duesPaise)}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Dialog                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Add / Edit student (Students tab). Add admits the student in one transaction (optionally with a
 * bed and opening dues). Edit saves details + primary guardian, and can add a one-off charge;
 * status and bed changes live in the row's Actions menu so they follow the stay lifecycle.
 */
export function StudentFormDialog({
  open,
  onOpenChange,
  mode,
  tenantId,
  propertyId,
  studentId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  tenantId: string;
  propertyId: string;
  studentId?: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = mode === "edit";
  const today = usePropertyToday(propertyId);
  const snapshotQ = useStudentForEdit(isEdit && open && studentId ? studentId : null);
  const snapshot = snapshotQ.data;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<{
    admission_number?: string;
    bedId?: string;
  }>({});
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Closing discards the draft: reopening always starts from a clean (or freshly loaded) form.
  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setHydratedId(null);
      setIsSubmitted(false);
      setServerErrors({});
      setIsPaymentOpen(false);
    }
  }, [open]);

  // Edit: fill the form once per opening (after any refetch of stale cached data); later
  // refetches, e.g. after recording a payment, leave the user's edits alone.
  const isRefreshingStale = snapshotQ.isFetching && snapshotQ.isStale;
  useEffect(() => {
    if (isEdit && open && snapshot && !isRefreshingStale && hydratedId !== snapshot.id) {
      setForm({ ...EMPTY_FORM, details: detailsFromSnapshot(snapshot.details) });
      setHydratedId(snapshot.id);
    }
  }, [isEdit, open, snapshot, isRefreshingStale, hydratedId]);

  // Move focus to the first invalid control after a failed submit.
  useEffect(() => {
    if (focusTick === 0) return;
    const el = bodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    el?.focus();
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusTick]);

  const setDetails = (next: Partial<DetailsState>) => {
    if ("admission_number" in next) setServerErrors((s) => ({ ...s, admission_number: undefined }));
    setForm((f) => ({ ...f, details: { ...f.details, ...next } }));
  };

  const addResult = useMemo(
    () => (isEdit ? null : validateAdd(form, tenantId, propertyId)),
    [isEdit, form, tenantId, propertyId],
  );
  const isDetailsDirty = useMemo(() => {
    if (!isEdit || !snapshot) return false;
    const baseline = detailsToInput(detailsFromSnapshot(snapshot.details));
    return JSON.stringify(detailsToInput(form.details)) !== JSON.stringify(baseline);
  }, [isEdit, snapshot, form.details]);
  const editResult = useMemo(
    () => (isEdit && studentId ? validateEdit(form, studentId, isDetailsDirty) : null),
    [isEdit, form, studentId, isDetailsDirty],
  );
  const validation = addResult?.errors ?? editResult?.errors ?? emptyErrors();
  const shown: FormErrors = isSubmitted ? validation : emptyErrors();
  const detailErrors = {
    ...shown.details,
    ...(serverErrors.admission_number ? { admission_number: serverErrors.admission_number } : {}),
  };
  const placementErrors = {
    ...shown.placement,
    ...(serverErrors.bedId ? { bedId: serverErrors.bedId } : {}),
  };

  async function invalidateAfterSave(touchedMoney: boolean) {
    const extra = touchedMoney ? [["invoices"], ["open-invoices"], ["payments"]] : [];
    await Promise.all([
      invalidateStudentsTab(qc, propertyId),
      ...extra.map((queryKey) => qc.invalidateQueries({ queryKey })),
    ]);
  }

  function showServerError(e: unknown, fallback: string) {
    const message = getErrorMessage(e, fallback);
    if (/admission id/i.test(message))
      setServerErrors((s) => ({ ...s, admission_number: message }));
    else if (/\bbed\b/i.test(message)) setServerErrors((s) => ({ ...s, bedId: message }));
    toast.error(message);
  }

  const admitFn = useServerFn(admitStudent);
  const admitMut = useMutation({
    mutationFn: (input: AdmitStudentInput) => admitFn({ data: input }),
    onSuccess: async (r) => {
      const extras = [
        r.allocation_id ? "bed held" : null,
        r.invoice_number ? `invoice ${r.invoice_number}` : null,
        r.payment_number ? `payment ${r.payment_number}` : null,
      ].filter(Boolean);
      toast.success(`Student added — admission ID ${r.admission_number}`, {
        description: extras.length ? `Also created: ${extras.join(", ")}.` : undefined,
      });
      if (r.portalWarning) toast.warning(`Portal invite not sent: ${r.portalWarning}`);
      if (r.receiptWarning) toast.warning(r.receiptWarning);
      await invalidateAfterSave(Boolean(r.invoice_id));
      onDone();
      onOpenChange(false);
    },
    onError: (e) => showServerError(e, "Could not add the student"),
  });

  const updateFn = useServerFn(updateStudentDetails);
  const chargeFn = useServerFn(addStudentCharge);
  const editMut = useMutation({
    mutationFn: async (vars: {
      details: UpdateStudentDetailsInput | null;
      charge: AddStudentChargeInput | null;
    }) => {
      if (vars.details) await updateFn({ data: vars.details });
      if (!vars.charge) return { detailsSaved: Boolean(vars.details), charge: null };
      try {
        const charge = await chargeFn({ data: vars.charge });
        return { detailsSaved: Boolean(vars.details), charge };
      } catch (e) {
        if (!vars.details) throw e;
        // The details already saved; the form stays open so only the charge needs a retry.
        await invalidateAfterSave(false);
        throw new Error(
          `Details saved, but the charge wasn't added: ${getErrorMessage(e, "unknown error")}`,
        );
      }
    },
    onSuccess: async ({ detailsSaved, charge }) => {
      if (charge) {
        toast.success(
          detailsSaved
            ? `Details saved and charge added — invoice ${charge.invoice_number ?? ""}`.trim()
            : `Charge added — invoice ${charge.invoice_number ?? ""}`.trim(),
          {
            description: charge.payment_number ? `Payment ${charge.payment_number}.` : undefined,
          },
        );
        if (charge.receiptWarning) toast.warning(charge.receiptWarning);
      } else {
        toast.success("Student details saved");
      }
      await invalidateAfterSave(Boolean(charge));
      onDone();
      onOpenChange(false);
    },
    onError: (e) => showServerError(e, "Could not save the student"),
  });

  const isBusy = admitMut.isPending || editMut.isPending;
  const isArchived = Boolean(snapshot?.deleted_at);
  const isReady = !isEdit || (snapshot !== undefined && hydratedId === snapshot.id);
  const hasEditChanges = isDetailsDirty || form.addCharge;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isBusy || !isReady) return;
    setIsSubmitted(true);
    if (hasAnyError(validation)) {
      setFocusTick((t) => t + 1);
      if (validation.general) toast.error(validation.general);
      return;
    }
    if (addResult?.input) {
      admitMut.mutate(addResult.input);
    } else if (editResult && (editResult.details || editResult.charge)) {
      editMut.mutate({ details: editResult.details, charge: editResult.charge });
    }
  }

  const d = form.details;
  const studentName = snapshot?.details.full_name ?? (d.full_name || "this student");

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (!o && isBusy ? undefined : onOpenChange(o))}>
        <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:max-w-3xl sm:rounded-2xl">
          <DialogHeader className="border-b border-border px-6 pb-4 pt-6 text-left">
            <DialogTitle>{isEdit ? "Edit student" : "Add student"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Update the student's details and guardian, or add a one-off charge."
                : "Admit a student with their guardian. A bed and opening dues are optional."}
            </DialogDescription>
          </DialogHeader>

          <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
            <div
              ref={bodyRef}
              className="min-h-0 flex-1 divide-y divide-border overflow-y-auto px-6 py-5"
            >
              {isEdit && snapshotQ.isError && !isReady ? (
                <div
                  role="alert"
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    {getErrorMessage(snapshotQ.error, "Couldn't load this student.")}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => snapshotQ.refetch()}
                  >
                    <RotateCw aria-hidden="true" className="h-3.5 w-3.5" /> Retry
                  </Button>
                </div>
              ) : !isReady ? (
                <div className="space-y-4" aria-busy="true">
                  {Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="space-y-3">
                      <Skeleton className="h-5 w-40" />
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Skeleton className="h-11 rounded-xl" />
                        <Skeleton className="h-11 rounded-xl" />
                      </div>
                    </div>
                  ))}
                  <span className="sr-only">Loading student…</span>
                </div>
              ) : (
                <>
                  {isArchived && (
                    <p
                      role="status"
                      className="mb-5 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-foreground"
                    >
                      <AlertTriangle
                        aria-hidden="true"
                        className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                      />
                      This student is archived, so their details can't be changed.
                    </p>
                  )}

                  {/* 1. Student */}
                  <FormSection icon={GraduationCap} title="Student">
                    <fieldset
                      disabled={isBusy || isArchived}
                      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
                    >
                      <StudentField
                        id="student-full-name"
                        label="Full name"
                        isRequired
                        error={detailErrors.full_name}
                        className="sm:col-span-2"
                      >
                        {(a11y) => (
                          <Input
                            {...a11y}
                            autoComplete="off"
                            maxLength={120}
                            value={d.full_name}
                            onChange={(e) => setDetails({ full_name: e.target.value })}
                          />
                        )}
                      </StudentField>
                      <StudentField
                        id="student-admission"
                        label="Admission ID"
                        error={detailErrors.admission_number}
                        hint={
                          isEdit
                            ? "Leave blank to keep the current ID."
                            : "Must be unique in this property."
                        }
                      >
                        {(a11y) => (
                          <Input
                            {...a11y}
                            autoComplete="off"
                            maxLength={40}
                            className="font-mono uppercase placeholder:font-sans placeholder:normal-case"
                            placeholder="Auto-generated if left blank"
                            value={d.admission_number}
                            onChange={(e) => setDetails({ admission_number: e.target.value })}
                          />
                        )}
                      </StudentField>
                      <StudentField
                        id="student-academic-year"
                        label="Academic year"
                        error={detailErrors.academic_year}
                      >
                        {(a11y) => (
                          <Input
                            {...a11y}
                            maxLength={40}
                            placeholder="e.g. 2026-27"
                            value={d.academic_year}
                            onChange={(e) => setDetails({ academic_year: e.target.value })}
                          />
                        )}
                      </StudentField>
                      <StudentField id="student-phone" label="Phone" error={detailErrors.phone}>
                        {(a11y) => (
                          <Input
                            {...a11y}
                            type="tel"
                            inputMode="tel"
                            autoComplete="off"
                            placeholder="9876543210"
                            value={d.phone}
                            onChange={(e) => setDetails({ phone: e.target.value })}
                          />
                        )}
                      </StudentField>
                      <StudentField
                        id="student-email"
                        label="Email"
                        error={detailErrors.email}
                        hint={isEdit ? undefined : "Used to invite the student to the portal."}
                      >
                        {(a11y) => (
                          <Input
                            {...a11y}
                            type="email"
                            autoComplete="off"
                            value={d.email}
                            onChange={(e) => setDetails({ email: e.target.value })}
                          />
                        )}
                      </StudentField>
                      <StudentField
                        id="student-dob"
                        label="Date of birth"
                        error={detailErrors.date_of_birth}
                      >
                        {(a11y) => (
                          <Input
                            {...a11y}
                            type="date"
                            max={today}
                            className={DATE_INPUT_CLASS}
                            value={d.date_of_birth}
                            onChange={(e) => setDetails({ date_of_birth: e.target.value })}
                          />
                        )}
                      </StudentField>
                      <StudentField id="student-gender" label="Gender" error={detailErrors.gender}>
                        {(a11y) => (
                          <Select
                            disabled={isBusy || isArchived}
                            value={d.gender || GENDER_UNSET}
                            onValueChange={(v) =>
                              setDetails({
                                gender: v === "MALE" || v === "FEMALE" || v === "OTHER" ? v : "",
                              })
                            }
                          >
                            <SelectTrigger {...a11y}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={GENDER_UNSET}>Not specified</SelectItem>
                              <SelectItem value="MALE">Male</SelectItem>
                              <SelectItem value="FEMALE">Female</SelectItem>
                              <SelectItem value="OTHER">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </StudentField>
                      <StudentField
                        id="student-institute"
                        label="Institute"
                        error={detailErrors.academic_institute}
                      >
                        {(a11y) => (
                          <Input
                            {...a11y}
                            maxLength={160}
                            placeholder="e.g. Allen Career Institute"
                            value={d.academic_institute}
                            onChange={(e) => setDetails({ academic_institute: e.target.value })}
                          />
                        )}
                      </StudentField>
                      <StudentField
                        id="student-course"
                        label="Course"
                        error={detailErrors.course_name}
                      >
                        {(a11y) => (
                          <Input
                            {...a11y}
                            maxLength={160}
                            placeholder="e.g. JEE Main + Advanced"
                            value={d.course_name}
                            onChange={(e) => setDetails({ course_name: e.target.value })}
                          />
                        )}
                      </StudentField>
                    </fieldset>
                  </FormSection>

                  {/* 2. Guardian */}
                  <FormSection
                    icon={Users}
                    title="Guardian"
                    description="Primary contact for fees, gate passes and emergencies."
                  >
                    <fieldset
                      disabled={isBusy || isArchived}
                      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
                    >
                      <StudentField
                        id="guardian-name"
                        label="Guardian name"
                        isRequired
                        error={detailErrors.guardian_name}
                      >
                        {(a11y) => (
                          <Input
                            {...a11y}
                            autoComplete="off"
                            maxLength={120}
                            value={d.guardian_name}
                            onChange={(e) => setDetails({ guardian_name: e.target.value })}
                          />
                        )}
                      </StudentField>
                      <StudentField
                        id="guardian-phone"
                        label="Guardian phone"
                        isRequired
                        error={detailErrors.guardian_phone}
                      >
                        {(a11y) => (
                          <Input
                            {...a11y}
                            type="tel"
                            inputMode="tel"
                            autoComplete="off"
                            placeholder="9876543210"
                            value={d.guardian_phone}
                            onChange={(e) => setDetails({ guardian_phone: e.target.value })}
                          />
                        )}
                      </StudentField>
                      <StudentField
                        id="guardian-relationship"
                        label="Relationship"
                        isRequired
                        error={
                          d.relationshipChoice === "Other"
                            ? undefined
                            : detailErrors.guardian_relationship
                        }
                      >
                        {(a11y) => (
                          <Select
                            disabled={isBusy || isArchived}
                            value={d.relationshipChoice}
                            onValueChange={(v) => {
                              const choice = RELATIONSHIP_OPTIONS.find((o) => o === v);
                              if (choice) setDetails({ relationshipChoice: choice });
                            }}
                          >
                            <SelectTrigger {...a11y}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RELATIONSHIP_OPTIONS.map((o) => (
                                <SelectItem key={o} value={o}>
                                  {o}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </StudentField>
                      {d.relationshipChoice === "Other" && (
                        <StudentField
                          id="guardian-relationship-other"
                          label="Specify relationship"
                          isRequired
                          error={detailErrors.guardian_relationship}
                        >
                          {(a11y) => (
                            <Input
                              {...a11y}
                              maxLength={60}
                              placeholder="e.g. Uncle, Local guardian"
                              value={d.relationshipOther}
                              onChange={(e) => setDetails({ relationshipOther: e.target.value })}
                            />
                          )}
                        </StudentField>
                      )}
                      <StudentField
                        id="guardian-email"
                        label="Guardian email"
                        error={detailErrors.guardian_email}
                      >
                        {(a11y) => (
                          <Input
                            {...a11y}
                            type="email"
                            autoComplete="off"
                            value={d.guardian_email}
                            onChange={(e) => setDetails({ guardian_email: e.target.value })}
                          />
                        )}
                      </StudentField>
                    </fieldset>
                  </FormSection>

                  {/* 3. Status */}
                  <FormSection
                    icon={ShieldCheck}
                    title="Status"
                    description={
                      isEdit
                        ? "Change status from the Actions menu, so every move follows the stay lifecycle."
                        : "A student becomes Active once they sign the agreement and the first invoice is paid."
                    }
                  >
                    {isEdit && snapshot ? (
                      <StudentStatusPill status={snapshot.status} />
                    ) : (
                      <StudentField
                        id="student-initial-status"
                        label="Initial status"
                        className="sm:max-w-xs"
                      >
                        {(a11y) => (
                          <Select
                            disabled={isBusy}
                            value={form.initialStatus}
                            onValueChange={(v) =>
                              setForm((f) => ({
                                ...f,
                                initialStatus: v === "VERIFIED" ? "VERIFIED" : "APPLICANT",
                              }))
                            }
                          >
                            <SelectTrigger {...a11y}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="APPLICANT">
                                Applicant — not yet verified
                              </SelectItem>
                              <SelectItem value="VERIFIED">Verified — documents checked</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </StudentField>
                    )}
                  </FormSection>

                  {/* 4. Room & bed */}
                  <FormSection
                    icon={BedSingle}
                    title="Room & bed"
                    description={isEdit ? undefined : "Optional — you can also assign a bed later."}
                    action={
                      isEdit ? undefined : (
                        <SectionToggle
                          id="student-assign-bed"
                          label="Assign a bed now"
                          disabled={isBusy}
                          checked={form.assignBed}
                          onCheckedChange={(assignBed) => {
                            setServerErrors((s) => ({ ...s, bedId: undefined }));
                            setForm((f) => ({
                              ...f,
                              assignBed,
                              placement: EMPTY_STUDENT_PLACEMENT,
                            }));
                          }}
                        />
                      )
                    }
                  >
                    {isEdit && snapshot ? (
                      <CurrentStay allocation={snapshot.openAllocation} />
                    ) : form.assignBed ? (
                      <StudentPlacementFields
                        propertyId={propertyId}
                        disabled={isBusy}
                        value={form.placement}
                        onChange={(placement) => {
                          if (placement.bedId !== form.placement.bedId) {
                            setServerErrors((s) => ({ ...s, bedId: undefined }));
                          }
                          setForm((f) => ({ ...f, placement }));
                        }}
                        errors={placementErrors}
                      />
                    ) : null}
                  </FormSection>

                  {/* 5. Fees & payment */}
                  <FormSection
                    icon={IndianRupee}
                    title="Fees & payment"
                    description={
                      isEdit
                        ? "Rent and deposit are billed automatically after the agreement is signed."
                        : "Optional — for admission fee, back-dues or other one-off charges."
                    }
                    action={
                      isEdit && isArchived ? undefined : (
                        <SectionToggle
                          id="student-add-charge"
                          label={isEdit ? "Add charge" : "Add opening dues"}
                          disabled={isBusy}
                          checked={form.addCharge}
                          onCheckedChange={(addCharge) =>
                            setForm((f) => ({
                              ...f,
                              addCharge,
                              charge: { ...EMPTY_STUDENT_CHARGE, dueDate: today },
                            }))
                          }
                        />
                      )
                    }
                  >
                    {isEdit && snapshot && (
                      <div className="space-y-3">
                        <OpenInvoicesList snapshot={snapshot} />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isBusy || snapshot.openInvoices.length === 0}
                          onClick={() => setIsPaymentOpen(true)}
                        >
                          <ReceiptIndianRupee aria-hidden="true" className="h-4 w-4" />
                          Record payment
                        </Button>
                      </div>
                    )}
                    {form.addCharge && (
                      <StudentChargeFields
                        idPrefix={isEdit ? "edit-charge" : "opening-dues"}
                        disabled={isBusy}
                        value={form.charge}
                        onChange={(charge) => setForm((f) => ({ ...f, charge }))}
                        errors={shown.charge}
                      />
                    )}
                  </FormSection>
                </>
              )}
            </div>

            <DialogFooter className="gap-2 border-t border-border bg-card px-6 py-4">
              <Button
                type="button"
                variant="ghost"
                disabled={isBusy}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isBusy || !isReady || isArchived || (isEdit && !hasEditChanges)}
              >
                {isBusy ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : isEdit ? (
                  <Save aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <UserPlus aria-hidden="true" className="h-4 w-4" />
                )}
                {isBusy ? "Saving…" : isEdit ? "Save changes" : "Add student"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {isEdit && studentId && (
        <RecordPaymentDialog
          open={isPaymentOpen}
          onOpenChange={setIsPaymentOpen}
          studentId={studentId}
          studentName={studentName}
          onDone={onDone}
        />
      )}
    </>
  );
}
