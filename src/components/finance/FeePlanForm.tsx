import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
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
      className="space-y-4 rounded-md border border-border bg-card p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Name</Label>
          <Input placeholder="e.g. Standard Rent Plan" {...form.register("name")} />
          {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div>
          <Label>Code</Label>
          <Input placeholder="e.g. STD-RENT" {...form.register("code")} />
          {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code.message}</p>}
        </div>
        <div>
          <Label>Billing frequency</Label>
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
        </div>
        <div>
          <Label>Due day (1–28)</Label>
          <Input
            type="number"
            min={1}
            max={28}
            {...form.register("due_day", { valueAsNumber: true })}
          />
        </div>
        <div>
          <Label>Grace days</Label>
          <Input
            type="number"
            min={0}
            max={30}
            {...form.register("grace_period_days", { valueAsNumber: true })}
          />
        </div>
        <div>
          <Label>Effective from</Label>
          <Input type="date" {...form.register("effective_from")} />
        </div>
        <div>
          <Label>Status</Label>
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
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Components</Label>
          <Button type="button" size="sm" variant="outline" onClick={() => append(emptyComponent)}>
            <Plus size={14} className="mr-1" />
            Add
          </Button>
        </div>
        {fields.map((f, i) => {
          const amountError = errors.components?.[i]?.amount_paise;
          const allowZero = form.watch(`components.${i}.allow_zero_amount`);
          return (
            <div key={f.id} className="space-y-1 rounded border border-border p-2">
              <div className="grid gap-2 sm:grid-cols-4">
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
                <Button type="button" size="sm" variant="ghost" onClick={() => remove(i)}>
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

      <div className="flex gap-2">
        <Button type="submit" disabled={m.isPending}>
          {m.isPending ? "Saving…" : isEdit ? "Save changes" : "Create fee plan"}
        </Button>
        {isEdit && (
          <Button type="button" variant="ghost" onClick={() => onSaved?.()}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
