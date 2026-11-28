import type { ReactNode } from "react";
import {
  Banknote,
  CircleEllipsis,
  FileText,
  Info,
  Landmark,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  OFFLINE_PAYMENT_MODES,
  PAYMENT_MODES_NEEDING_REFERENCE,
  offlinePaymentModeEnum,
  type OfflinePaymentMode,
} from "@/schemas/student";

/* ------------------------------------------------------------------------- */
/* Shared field chrome for the Students tab forms                             */
/* ------------------------------------------------------------------------- */

export interface FieldA11yProps {
  id: string;
  "aria-invalid": boolean;
  "aria-required"?: boolean;
  "aria-describedby"?: string;
}

/** Label + control + hint/error, wiring ids so the error is announced with the control. */
export function StudentField({
  id,
  label,
  isRequired = false,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  isRequired?: boolean;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: (a11y: FieldA11yProps) => ReactNode;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {isRequired && (
          <span aria-hidden="true" className="ml-0.5 text-destructive">
            *
          </span>
        )}
      </Label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-required": isRequired || undefined,
        "aria-describedby": describedBy || undefined,
      })}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Text input with a leading rupee sign; the value stays the typed rupee text. */
export function RupeeInput({
  value,
  onChange,
  placeholder,
  disabled,
  ...a11y
}: FieldA11yProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-muted-foreground"
      >
        ₹
      </span>
      <Input
        {...a11y}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="pl-8 tabular-nums"
        placeholder={placeholder ?? "0"}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
      />
    </div>
  );
}

/** Native date input whose picker icon follows the app theme. */
export const DATE_INPUT_CLASS =
  "[color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer";

/* ------------------------------------------------------------------------- */
/* Payment method + reference                                                 */
/* ------------------------------------------------------------------------- */

const MODE_META: Record<OfflinePaymentMode, { label: string; icon: LucideIcon }> = {
  CASH: { label: "Cash", icon: Banknote },
  UPI: { label: "UPI", icon: Smartphone },
  BANK_TRANSFER: { label: "Bank transfer", icon: Landmark },
  CHEQUE: { label: "Cheque", icon: FileText },
  OTHER: { label: "Other", icon: CircleEllipsis },
};

const REFERENCE_LABEL: Record<OfflinePaymentMode, string> = {
  CASH: "",
  UPI: "UPI transaction ID",
  BANK_TRANSFER: "Transaction ID / UTR",
  CHEQUE: "Cheque number",
  OTHER: "Reference",
};

/** Segmented offline payment-method picker (arrow keys move between methods). */
export function PaymentModeToggle({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: OfflinePaymentMode;
  onChange: (mode: OfflinePaymentMode) => void;
  disabled?: boolean;
}) {
  const labelId = `${id}-label`;
  return (
    <div className="space-y-1.5">
      <span id={labelId} className="text-sm font-medium leading-none">
        Payment method
      </span>
      <ToggleGroup
        id={id}
        type="single"
        variant="outline"
        aria-labelledby={labelId}
        className="flex-wrap justify-start gap-2"
        disabled={disabled}
        value={value}
        onValueChange={(next) => {
          // Radix sends "" when the active item is clicked again; a method is always required.
          const parsed = offlinePaymentModeEnum.safeParse(next);
          if (parsed.success) onChange(parsed.data);
        }}
      >
        {OFFLINE_PAYMENT_MODES.map((mode) => {
          const { label, icon: Icon } = MODE_META[mode];
          return (
            <ToggleGroupItem
              key={mode}
              value={mode}
              className="h-10 rounded-xl px-3 data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
            >
              <Icon aria-hidden="true" />
              {label}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}

/** Reference / cheque-date inputs for the chosen method (none for cash). */
export function PaymentReferenceFields({
  idPrefix,
  mode,
  reference,
  chequeDate,
  onReferenceChange,
  onChequeDateChange,
  errors,
  disabled,
}: {
  idPrefix: string;
  mode: OfflinePaymentMode;
  reference: string;
  chequeDate: string;
  onReferenceChange: (value: string) => void;
  onChequeDateChange: (value: string) => void;
  errors?: { reference?: string; chequeDate?: string };
  disabled?: boolean;
}) {
  if (mode === "CASH") return null;
  const isReferenceRequired = PAYMENT_MODES_NEEDING_REFERENCE.includes(mode);
  return (
    <>
      <StudentField
        id={`${idPrefix}-reference`}
        label={isReferenceRequired ? REFERENCE_LABEL[mode] : `${REFERENCE_LABEL[mode]} (optional)`}
        isRequired={isReferenceRequired}
        error={errors?.reference}
        className={mode === "CHEQUE" ? undefined : "sm:col-span-2"}
      >
        {(a11y) => (
          <Input
            {...a11y}
            autoComplete="off"
            maxLength={120}
            disabled={disabled}
            value={reference}
            onChange={(e) => onReferenceChange(e.target.value)}
          />
        )}
      </StudentField>
      {mode === "CHEQUE" && (
        <StudentField
          id={`${idPrefix}-cheque-date`}
          label="Cheque date"
          isRequired
          error={errors?.chequeDate}
        >
          {(a11y) => (
            <Input
              {...a11y}
              type="date"
              className={DATE_INPUT_CLASS}
              disabled={disabled}
              value={chequeDate}
              onChange={(e) => onChequeDateChange(e.target.value)}
            />
          )}
        </StudentField>
      )}
    </>
  );
}

/* ------------------------------------------------------------------------- */
/* One-off charge (opening dues) + optional payment                           */
/* ------------------------------------------------------------------------- */

export interface StudentChargeValue {
  amountRupees: string;
  dueDate: string;
  note: string;
  paidNow: boolean;
  paidRupees: string;
  mode: OfflinePaymentMode;
  reference: string;
  chequeDate: string;
}
export type StudentChargeErrors = Partial<Record<keyof StudentChargeValue, string>>;

export function StudentChargeFields({
  value,
  onChange,
  errors = {},
  idPrefix = "charge",
  disabled,
}: {
  value: StudentChargeValue;
  onChange: (value: StudentChargeValue) => void;
  errors?: StudentChargeErrors;
  idPrefix?: string;
  disabled?: boolean;
}) {
  const patch = (next: Partial<StudentChargeValue>) => onChange({ ...value, ...next });
  const paidNowId = `${idPrefix}-paid-now`;

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-xs text-foreground">
        <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
        For admission fee, back-dues or other one-off charges. Rent and deposit are billed
        automatically after the agreement is signed.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StudentField
          id={`${idPrefix}-amount`}
          label="Amount due"
          isRequired
          error={errors.amountRupees}
        >
          {(a11y) => (
            <RupeeInput
              {...a11y}
              disabled={disabled}
              value={value.amountRupees}
              onChange={(amountRupees) => patch({ amountRupees })}
            />
          )}
        </StudentField>
        <StudentField
          id={`${idPrefix}-due-date`}
          label="Due date"
          isRequired
          error={errors.dueDate}
        >
          {(a11y) => (
            <Input
              {...a11y}
              type="date"
              className={DATE_INPUT_CLASS}
              disabled={disabled}
              value={value.dueDate}
              onChange={(e) => patch({ dueDate: e.target.value })}
            />
          )}
        </StudentField>
        <StudentField
          id={`${idPrefix}-note`}
          label="What is it for?"
          error={errors.note}
          className="sm:col-span-2"
        >
          {(a11y) => (
            <Input
              {...a11y}
              maxLength={200}
              placeholder="e.g. Admission fee, back-dues for October"
              disabled={disabled}
              value={value.note}
              onChange={(e) => patch({ note: e.target.value })}
            />
          )}
        </StudentField>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-muted/30 px-3 py-3">
        <div className="min-w-0">
          <Label htmlFor={paidNowId}>Payment received now</Label>
          <p id={`${paidNowId}-hint`} className="mt-1 text-xs text-muted-foreground">
            Records an offline payment against this charge and issues a receipt.
          </p>
        </div>
        <Switch
          id={paidNowId}
          aria-describedby={`${paidNowId}-hint`}
          disabled={disabled}
          checked={value.paidNow}
          onCheckedChange={(paidNow) =>
            patch({
              paidNow,
              // Most offline collections are the full amount; seed it once.
              paidRupees: paidNow && !value.paidRupees ? value.amountRupees : value.paidRupees,
            })
          }
        />
      </div>

      {value.paidNow && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StudentField
            id={`${idPrefix}-paid`}
            label="Amount received"
            isRequired
            error={errors.paidRupees}
          >
            {(a11y) => (
              <RupeeInput
                {...a11y}
                disabled={disabled}
                value={value.paidRupees}
                onChange={(paidRupees) => patch({ paidRupees })}
              />
            )}
          </StudentField>
          <div className="sm:col-span-2">
            <PaymentModeToggle
              id={`${idPrefix}-mode`}
              disabled={disabled}
              value={value.mode}
              onChange={(mode) => patch({ mode })}
            />
            {errors.mode && (
              <p className="mt-1.5 text-xs font-medium text-destructive">{errors.mode}</p>
            )}
          </div>
          <PaymentReferenceFields
            idPrefix={idPrefix}
            mode={value.mode}
            reference={value.reference}
            chequeDate={value.chequeDate}
            onReferenceChange={(reference) => patch({ reference })}
            onChequeDateChange={(chequeDate) => patch({ chequeDate })}
            errors={{ reference: errors.reference, chequeDate: errors.chequeDate }}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
