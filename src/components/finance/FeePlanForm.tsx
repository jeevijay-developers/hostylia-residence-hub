import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { feePlanFormSchema, type FeePlanFormInput } from "@/schemas/finance";
import { upsertFeePlan } from "@/lib/finance.functions";

export function FeePlanForm({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const submit = useServerFn(upsertFeePlan);
  const form = useForm<FeePlanFormInput>({
    resolver: zodResolver(feePlanFormSchema) as never,
    defaultValues: {
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
      components: [
        { name: "Rent", component_type: "RENT", amount_paise: 0,
          is_refundable: false, is_taxable: false, tax_rate_basis_points: 0 },
      ],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "components" });

  const m = useMutation({
    mutationFn: async (values: FeePlanFormInput) => submit({ data: values }),
    onSuccess: () => {
      toast.success("Fee plan created");
      qc.invalidateQueries({ queryKey: ["fee_plans"] });
      form.reset();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <form
      onSubmit={form.handleSubmit((v) => m.mutate(v))}
      className="space-y-4 rounded-md border border-border bg-card p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Name</Label>
          <Input {...form.register("name")} />
        </div>
        <div>
          <Label>Code</Label>
          <Input {...form.register("code")} />
        </div>
        <div>
          <Label>Billing frequency</Label>
          <Select
            value={form.watch("billing_frequency")}
            onValueChange={(v) => form.setValue("billing_frequency", v as never)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["MONTHLY","QUARTERLY","HALF_YEARLY","YEARLY","ONE_TIME","CUSTOM"].map((x) => (
                <SelectItem key={x} value={x}>{x}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Due day (1–28)</Label>
          <Input type="number" min={1} max={28}
            {...form.register("due_day", { valueAsNumber: true })} />
        </div>
        <div>
          <Label>Grace days</Label>
          <Input type="number" min={0} max={30}
            {...form.register("grace_period_days", { valueAsNumber: true })} />
        </div>
        <div>
          <Label>Effective from</Label>
          <Input type="date" {...form.register("effective_from")} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Components</Label>
          <Button type="button" size="sm" variant="outline"
            onClick={() => append({
              name: "", component_type: "RENT", amount_paise: 0,
              is_refundable: false, is_taxable: false, tax_rate_basis_points: 0,
            })}>
            <Plus size={14} className="mr-1" />Add
          </Button>
        </div>
        {fields.map((f, i) => (
          <div key={f.id} className="grid gap-2 rounded border border-border p-2 sm:grid-cols-4">
            <Input placeholder="Name" {...form.register(`components.${i}.name`)} />
            <Select
              value={form.watch(`components.${i}.component_type`)}
              onValueChange={(v) => form.setValue(`components.${i}.component_type`, v as never)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["RENT","MESS","DEPOSIT","MAINTENANCE","ONE_TIME","LATE_FEE","OTHER"].map((x) => (
                  <SelectItem key={x} value={x}>{x}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" placeholder="Amount (paise)"
              {...form.register(`components.${i}.amount_paise`, { valueAsNumber: true })} />
            <Button type="button" size="sm" variant="ghost" onClick={() => remove(i)}>
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>

      <Button type="submit" disabled={m.isPending}>
        {m.isPending ? "Saving…" : "Create fee plan"}
      </Button>
    </form>
  );
}
