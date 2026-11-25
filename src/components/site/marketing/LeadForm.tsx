import { useServerFn } from "@tanstack/react-start";
import { useId, useState, type FormEvent } from "react";
import { CalendarCheck, Send, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TurnstileWidget } from "@/components/site/TurnstileWidget";
import { submitPublicLead } from "@/lib/public-lead.functions";
import { publicLeadSchema, type PublicLeadInput } from "@/schemas/public-lead";

type LeadKind = PublicLeadInput["kind"];
type LeadFieldName = Exclude<keyof PublicLeadInput, "kind" | "captchaToken">;

type FieldSpec = {
  name: LeadFieldName;
  label: string;
  control?: "input" | "textarea" | "select";
  type?: "text" | "email" | "tel";
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "numeric" | "tel";
  minLength?: number;
  /** Mirrors the publicLeadSchema max length for this field. */
  maxLength: number;
  options?: readonly string[];
  /** Span both columns on sm+. */
  isWide?: boolean;
};

type LeadConfig = {
  title: string;
  subtitle: string;
  submitLabel: string;
  submittingLabel: string;
  submitIcon: LucideIcon;
  successTitle: string;
  successDescription: string;
  errorMessage: string;
  fields: readonly FieldSpec[];
};

const NAME: FieldSpec = {
  name: "name",
  label: "Full name",
  placeholder: "Your name",
  autoComplete: "name",
  required: true,
  minLength: 2,
  maxLength: 120,
};
const EMAIL: FieldSpec = {
  name: "email",
  label: "Work email",
  type: "email",
  placeholder: "you@property.com",
  autoComplete: "email",
  required: true,
  maxLength: 255,
};
const BEDS: FieldSpec = {
  name: "beds",
  label: "Number of beds",
  placeholder: "e.g. 250",
  inputMode: "numeric",
  autoComplete: "off",
  maxLength: 40,
};

// One config per lead kind; field names are the publicLeadSchema keys, so the
// FormData maps 1:1 onto the server payload.
const LEAD_CONFIG: Record<LeadKind, LeadConfig> = {
  contact: {
    title: "Send us a message",
    subtitle: "We reply within one business day.",
    submitLabel: "Send Message",
    submittingLabel: "Sending...",
    submitIcon: Send,
    successTitle: "Message sent",
    successDescription: "Our team will get back to you within one business day.",
    errorMessage: "Could not send your message. Please try again.",
    fields: [
      NAME,
      EMAIL,
      {
        name: "propertyName",
        label: "Property name",
        placeholder: "e.g. Sunrise Hostels",
        autoComplete: "organization",
        maxLength: 160,
      },
      BEDS,
      {
        name: "message",
        label: "Message",
        control: "textarea",
        placeholder: "How can we help?",
        required: true,
        maxLength: 4000,
        isWide: true,
      },
    ],
  },
  demo: {
    title: "Request your demo",
    subtitle: "We'll reach out to schedule a time that suits you.",
    submitLabel: "Request Demo",
    submittingLabel: "Submitting...",
    submitIcon: CalendarCheck,
    successTitle: "Demo request received",
    successDescription: "We'll reach out shortly to schedule your walkthrough.",
    errorMessage: "Could not send your request. Please try again.",
    fields: [
      NAME,
      EMAIL,
      {
        name: "phone",
        label: "Phone",
        type: "tel",
        placeholder: "+91 ...",
        autoComplete: "tel",
        inputMode: "tel",
        maxLength: 40,
      },
      {
        name: "propertyName",
        label: "Property name",
        placeholder: "e.g. Sunrise Hostels",
        autoComplete: "organization",
        required: true,
        maxLength: 160,
      },
      {
        name: "city",
        label: "City",
        placeholder: "e.g. Kota",
        autoComplete: "address-level2",
        maxLength: 80,
      },
      BEDS,
      {
        name: "propertyType",
        label: "Property type",
        control: "select",
        placeholder: "Select a property type",
        maxLength: 80,
        options: [
          "Student Hostel",
          "PG / Co-Living",
          "Boarding School",
          "Coaching Hostel",
          "College / University Dorm",
          "Multi-Property",
        ],
        isWide: true,
      },
      {
        name: "message",
        label: "Anything we should know?",
        control: "textarea",
        placeholder: "Tell us about your operations",
        maxLength: 4000,
        isWide: true,
      },
    ],
  },
};

/**
 * Turnstile-verified lead form for the Support (contact) and Book-a-demo pages.
 * Validates with the shared publicLeadSchema before calling submitPublicLead.
 */
export function LeadForm({ kind }: { kind: LeadKind }) {
  const config = LEAD_CONFIG[kind];
  const submitLead = useServerFn(submitPublicLead);
  const [isLoading, setIsLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [widgetKey, setWidgetKey] = useState(0);
  const titleId = useId();

  function resetWidget() {
    setTurnstileToken("");
    setWidgetKey((key) => key + 1);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!turnstileToken) {
      toast.error("Complete the verification check before sending.");
      return;
    }
    const data = new FormData(form);
    const parsed = publicLeadSchema.safeParse({
      kind,
      captchaToken: turnstileToken,
      ...Object.fromEntries(config.fields.map((f) => [f.name, String(data.get(f.name) ?? "")])),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form and try again.");
      return;
    }
    setIsLoading(true);
    try {
      const result = await submitLead({ data: parsed.data });
      if (!result.ok) {
        toast.error(result.message ?? config.errorMessage);
        resetWidget();
        return;
      }
      form.reset(); // also resets the Radix Select (it listens for the form's reset event)
      resetWidget();
      toast.success(config.successTitle, { description: config.successDescription });
    } catch {
      toast.error(config.errorMessage);
      resetWidget();
    } finally {
      setIsLoading(false);
    }
  }

  const SubmitIcon = config.submitIcon;
  return (
    <form
      onSubmit={onSubmit}
      aria-labelledby={titleId}
      className="relative rounded-[2rem] border border-border bg-card p-6 shadow-card-ambient sm:p-8"
    >
      <h2 id={titleId} className="text-xl font-extrabold text-foreground">
        {config.title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{config.subtitle}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {config.fields.map((field) => (
          <LeadField key={field.name} field={field} />
        ))}
      </div>

      <div className="mt-5">
        <TurnstileWidget key={widgetKey} onToken={setTurnstileToken} />
      </div>
      <Button
        type="submit"
        variant="brand"
        size="pill-lg"
        disabled={isLoading || !turnstileToken}
        className="mt-5 w-full sm:w-auto"
      >
        <SubmitIcon /> {isLoading ? config.submittingLabel : config.submitLabel}
      </Button>
    </form>
  );
}

function LeadField({ field }: { field: FieldSpec }) {
  const id = useId();
  const control = field.control ?? "input";
  return (
    <div className={cn(field.isWide && "sm:col-span-2")}>
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {field.label}
        {field.required && (
          <span aria-hidden className="text-brand-green">
            {" "}
            *
          </span>
        )}
      </Label>
      {control === "textarea" && (
        <Textarea
          id={id}
          name={field.name}
          placeholder={field.placeholder}
          required={field.required}
          maxLength={field.maxLength}
          rows={5}
          className="mt-1.5"
        />
      )}
      {control === "select" && (
        <Select name={field.name} required={field.required}>
          <SelectTrigger id={id} className="mt-1.5 h-11">
            <SelectValue placeholder={field.placeholder} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {control === "input" && (
        <Input
          id={id}
          name={field.name}
          type={field.type ?? "text"}
          placeholder={field.placeholder}
          required={field.required}
          autoComplete={field.autoComplete}
          inputMode={field.inputMode}
          minLength={field.minLength}
          maxLength={field.maxLength}
          className="mt-1.5 h-11"
        />
      )}
    </div>
  );
}
