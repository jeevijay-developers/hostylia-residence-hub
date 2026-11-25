import { useServerFn } from "@tanstack/react-start";
import { useId, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TurnstileWidget } from "@/components/site/TurnstileWidget";
import { submitPublicLead } from "@/lib/public-lead.functions";
import { publicLeadSchema } from "@/schemas/public-lead";

/** Support/contact lead form: Turnstile-verified, submitted via submitPublicLead. */
export function ContactForm() {
  const submitLead = useServerFn(submitPublicLead);
  const [isLoading, setIsLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [widgetKey, setWidgetKey] = useState(0);

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
    const payload = {
      kind: "contact" as const,
      captchaToken: turnstileToken,
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      propertyName: String(data.get("property") ?? ""),
      beds: String(data.get("beds") ?? ""),
      message: String(data.get("message") ?? ""),
    };
    // Same shared schema the server validates with, so users see a readable
    // message instead of a rejected request (e.g. a 1-letter name or a blank message).
    const parsed = publicLeadSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form and try again.");
      return;
    }
    setIsLoading(true);
    try {
      const result = await submitLead({ data: payload });
      if (!result.ok) {
        toast.error(result.message ?? "Could not send your message.");
        resetWidget();
        return;
      }
      form.reset();
      resetWidget();
      toast.success("Message sent", {
        description: "Our team will get back to you within one business day.",
      });
    } catch {
      toast.error("Could not send your message. Please try again.");
      resetWidget();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-labelledby="contact-form-title"
      className="relative rounded-[2rem] border border-border bg-card p-6 shadow-card-ambient sm:p-8"
    >
      <h2 id="contact-form-title" className="text-xl font-extrabold text-foreground">
        Send us a message
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">We reply within one business day.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field
          label="Full name"
          name="name"
          placeholder="Your name"
          autoComplete="name"
          minLength={2}
          maxLength={120}
          required
        />
        <Field
          label="Work email"
          name="email"
          type="email"
          placeholder="you@property.com"
          autoComplete="email"
          maxLength={255}
          required
        />
        <Field
          label="Property name"
          name="property"
          placeholder="e.g. Sunrise Hostels"
          autoComplete="organization"
          maxLength={160}
        />
        <Field
          label="Beds"
          name="beds"
          placeholder="e.g. 250"
          inputMode="numeric"
          autoComplete="off"
          maxLength={40}
        />
      </div>
      <Field
        label="Message"
        name="message"
        maxLength={4000}
        placeholder="How can we help?"
        isTextarea
        required
        className="mt-4"
      />

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
        <Send /> {isLoading ? "Sending..." : "Send Message"}
      </Button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
  autoComplete,
  inputMode,
  minLength,
  maxLength,
  isTextarea,
  className,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "numeric";
  minLength?: number;
  maxLength?: number;
  isTextarea?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <span aria-hidden className="text-brand-green">
            {" "}
            *
          </span>
        )}
      </Label>
      {isTextarea ? (
        <Textarea
          id={id}
          name={name}
          placeholder={placeholder}
          required={required}
          maxLength={maxLength}
          rows={5}
          className="mt-1.5"
        />
      ) : (
        <Input
          id={id}
          name={name}
          type={type}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          inputMode={inputMode}
          minLength={minLength}
          maxLength={maxLength}
          className="mt-1.5 h-11"
        />
      )}
    </div>
  );
}
