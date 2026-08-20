import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

/**
 * Icon-badge + label + control row — shared field layout for premium forms
 * (Design.md's neutral-accent icon treatment). Used by FeePlanForm,
 * PaymentEntryForm, and other multi-field forms.
 */
export function IconFormField({
  icon: Icon,
  label,
  htmlFor,
  error,
  children,
}: {
  icon: LucideIcon;
  label: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="mb-1.5 block">
        {label}
      </Label>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-neutral-accent/10 text-neutral-accent">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {error && <p className="mt-1 pl-14 text-xs text-destructive">{error}</p>}
    </div>
  );
}
