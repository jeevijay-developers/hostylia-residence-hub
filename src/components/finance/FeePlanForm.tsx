import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowRight,
  Calendar,
  ClipboardList,
  Clock,
  Package,
  Plus,
  ShieldCheck,
  Tag,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconFormField as FormField } from "@/components/ui/icon-field";
import { feePlanFormSchema, type FeePlanFormInput } from "@/schemas/finance";
import { upsertFeePlan } from "@/lib/finance.functions";

const emptyComponent = {
  name: "",
  component_type: "RENT" as const,
  amount_paise: 0,
  allow_zero_amount: false,
  is_refundable: false,
  is_taxable: false,
  tax_rate_basis_points: 0,
};

function blankValues(propertyId: string): FeePlanFormInput {
  return {
    property_id: propertyId,
    name: "",
    code: "",
    billing_frequency: "MONTHLY",
    due_day: 1,
    grace_period_days: 3,
    late_fee_type: "NONE",
    late_fee_value: 0,
    status: "ACTIVE",
    effective_from: new Date().toISOString().slice(0, 10),
    components: [{ ...emptyComponent, name: "Rent" }],
  };
}

export function FeePlanForm({
  propertyId,
  plan,
  onSaved,
}: {
  propertyId: string;
  /** Present in edit mode — prefills the form and edits this plan in place. */
  plan?: FeePlanFormInput;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const submit = useServerFn(upsertFeePlan);
  const isEdit = !!plan?.id;
  const form = useForm<FeePlanFormInput>({
    resolver: zodResolver(feePlanFormSchema) as never,
    defaultValues: plan ?? blankValues(propertyId),
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "components" });

  useEffect(() => {
    form.reset(plan ?? blankValues(propertyId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id]);

  const m = useMutation({
    mutationFn: async (values: FeePlanFormInput) => submit({ data: values }),
    onSuccess: () => {
      toast.success(isEdit ? "Fee plan updated" : "Fee plan created");
      qc.invalidateQueries({ queryKey: ["fee_plans"] });
      if (isEdit) {
        onSaved?.();
      } else {
        form.reset(blankValues(propertyId));
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const errors = form.formState.errors;

  return (
    <form
      onSubmit={form.handleSubmit((v) => m.mutate(v as FeePlanFormInput))}
      className="space-y-6 rounded-2xl border border-border/80 bg-card p-4 shadow-card-ambient sm:p-6"
    >
      <div className="flex items-center gap-3 border-b border-border/80 pb-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-neutral-accent/15 text-neutral-accent shadow-tone-glow">
          <ClipboardList className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-foreground sm:text-xl">
            {isEdit ? "Edit Fee Plan" : "Create Fee Plan"}
          </h2>
          <p className="text-sm text-muted-foreground">Add a new fee plan with billing details</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField icon={User} label="Name" htmlFor="fee-plan-name" error={errors.name?.message}>
          <Input id="fee-plan-name" placeholder="e.g. Standard Rent Plan" {...form.register("name")} />
        </FormField>
        <FormField icon={Tag} label="Code" htmlFor="fee-plan-code" error={errors.code?.message}>
          <Input id="fee-plan-code" placeholder="e.g. STD-RENT" {...form.register("code")} />
        </FormField>
        <FormField icon={Calendar} label="Billing frequency">
          <Select
            value={form.watch("billing_frequency")}
            onValueChange={(v) => form.setValue("billing_frequency", v as never)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "ONE_TIME", "CUSTOM"].map((x) => (
                <SelectItem key={x} value={x}>
                  {x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField icon={Calendar} label="Due day (1–28)" htmlFor="fee-plan-due-day">
          <Input
            id="fee-plan-due-day"
            type="number"
            min={1}
            max={28}
            {...form.register("due_day", { valueAsNumber: true })}
          />
        </FormField>
        <FormField icon={Clock} label="Grace days" htmlFor="fee-plan-grace-days">
          <Input
            id="fee-plan-grace-days"
            type="number"
            min={0}
            max={30}
            {...form.register("grace_period_days", { valueAsNumber: true })}
          />
        </FormField>
        <FormField icon={Calendar} label="Effective from" htmlFor="fee-plan-effective-from">
          <Input id="fee-plan-effective-from" type="date" {...form.register("effective_from")} />
        </FormField>
        <FormField icon={ShieldCheck} label="Status">
          <Select
            value={form.watch("status")}
            onValueChange={(v) => form.setValue("status", v as never)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"].map((x) => (
                <SelectItem key={x} value={x}>
                  {x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="space-y-3 rounded-2xl border border-border/80 bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-neutral-accent/15 text-neutral-accent">
              <Package className="h-4 w-4" />
            </span>
            <Label className="text-sm font-semibold">Components</Label>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => append(emptyComponent)}>
            <Plus size={14} />
            Add
          </Button>
        </div>
        {fields.map((f, i) => {
          const amountError = errors.components?.[i]?.amount_paise;
          const allowZero = form.watch(`components.${i}.allow_zero_amount`);
          return (
            <div
              key={f.id}
              className="space-y-2 rounded-xl border border-border/80 bg-card p-3 shadow-sm"
            >
              <div className="grid gap-2 sm:grid-cols-[2fr_1.2fr_1fr_auto]">
                <Input placeholder="Name" {...form.register(`components.${i}.name`)} />
                <Select
                  value={form.watch(`components.${i}.component_type`)}
                  onValueChange={(v) => form.setValue(`components.${i}.component_type`, v as never)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "RENT",
                      "MESS",
                      "DEPOSIT",
                      "MAINTENANCE",
                      "ONE_TIME",
                      "LATE_FEE",
                      "OTHER",
                    ].map((x) => (
                      <SelectItem key={x} value={x}>
                        {x}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="Amount (paise)"
                  min={allowZero ? 0 : 1}
                  {...form.register(`components.${i}.amount_paise`, { valueAsNumber: true })}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => remove(i)}
                  aria-label="Remove component"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
              <div className="flex items-center gap-2 pl-1">
                <Checkbox
                  id={`allow-zero-${f.id}`}
                  checked={allowZero}
                  onCheckedChange={(v) =>
                    form.setValue(`components.${i}.allow_zero_amount`, v === true)
                  }
                />
                <Label
                  htmlFor={`allow-zero-${f.id}`}
                  className="text-xs font-normal text-muted-foreground"
                >
                  Allow zero amount (intentional zero-charge component)
                </Label>
              </div>
              {amountError && (
                <p className="pl-1 text-xs text-destructive">{amountError.message}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" size="lg" disabled={m.isPending} className="sm:flex-1">
          {m.isPending ? "Saving…" : isEdit ? "Save changes" : "Create fee plan"}
          {!m.isPending && <ArrowRight className="h-4 w-4" />}
        </Button>
        {isEdit && (
          <Button type="button" variant="ghost" size="lg" onClick={() => onSaved?.()}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
