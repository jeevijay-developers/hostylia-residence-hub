import { ZodError } from "zod";

import {
  propertyCrossFieldIssues,
  propertyFormSchema,
  type PropertyFormField,
  type PropertyFormInput,
} from "@/schemas/hostel";

/** Shared look for every control in the property wizard (red outline when invalid). */
export const FIELD_CONTROL =
  "h-11 rounded-xl border-border bg-background text-sm shadow-xs aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/15";

export type PropertyFormValues = {
  [K in PropertyFormField]: string;
};

export type PropertyFieldErrors = Partial<Record<PropertyFormField, string>>;

export interface PropertyStep {
  key: "basics" | "location" | "contact";
  title: string;
  description: string;
  fields: PropertyFormField[];
}

export const PROPERTY_STEPS: PropertyStep[] = [
  {
    key: "basics",
    title: "Basics",
    description: "What the property is called and who it is for.",
    fields: ["name", "property_type", "gender_policy"],
  },
  {
    key: "location",
    title: "Location",
    description: "Where the property is. Used on invoices, receipts and the admission page.",
    fields: [
      "postal_code",
      "city",
      "state",
      "country_code",
      "address_line_1",
      "address_line_2",
      "landmark",
      "timezone",
    ],
  },
  {
    key: "contact",
    title: "Contact & review",
    description: "The number students and parents call, then a final check of everything.",
    fields: ["phone", "email"],
  },
];

export const EMPTY_PROPERTY_FORM: PropertyFormValues = {
  name: "",
  property_type: "",
  gender_policy: "",
  address_line_1: "",
  address_line_2: "",
  landmark: "",
  city: "",
  state: "",
  postal_code: "",
  country_code: "IN",
  timezone: "Asia/Kolkata",
  phone: "",
  email: "",
};

/** First readable message per field, for the whole form. */
export function validatePropertyForm(values: PropertyFormValues): {
  data: PropertyFormInput | null;
  errors: PropertyFieldErrors;
} {
  const errors: PropertyFieldErrors = {};
  const result = propertyFormSchema.safeParse(values);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as PropertyFormField | undefined;
      if (field && !errors[field]) errors[field] = issue.message;
    }
  }
  for (const issue of propertyCrossFieldIssues(values)) {
    if (!errors[issue.path]) errors[issue.path] = issue.message;
  }
  const ok = result.success && Object.keys(errors).length === 0;
  return { data: ok ? result.data : null, errors };
}

/** Errors limited to the given fields (one wizard step). */
export function pickErrors(errors: PropertyFieldErrors, fields: PropertyFormField[]) {
  const out: PropertyFieldErrors = {};
  for (const f of fields) if (errors[f]) out[f] = errors[f];
  return out;
}

/** Looks like an internal/technical message rather than one written for people. */
const TECHNICAL =
  /violates|constraint|column|relation|syntax|null value|invalid input|duplicate key|row-level security|permission denied|jwt|pgrst|^\s*[[{]/i;

/**
 * Turns any error from saving a property into a sentence a hostel admin can
 * act on — never raw Zod/Postgres/PostgREST output.
 */
export function friendlyPropertyError(e: unknown, fallback: string): string {
  if (e instanceof ZodError) return e.issues[0]?.message ?? fallback;
  if (!e || typeof e !== "object") return fallback;
  const code = "code" in e ? String((e as { code?: unknown }).code ?? "") : "";
  const message = "message" in e ? String((e as { message?: unknown }).message ?? "") : "";
  const lower = message.toLowerCase();

  if (code === "23505" || lower.includes("duplicate key")) {
    return "A property with these details already exists. Please check the name and try again.";
  }
  if (
    code === "42501" ||
    lower.includes("row-level security") ||
    lower.includes("permission denied")
  ) {
    return "You don't have permission to make this change. Only a Hostel Admin can manage properties.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Couldn't reach the server. Check your internet connection and try again.";
  }
  if (
    lower.includes("jwt") ||
    lower.includes("unauthorized") ||
    lower.includes("not authenticated")
  ) {
    return "Your session has expired. Please sign in again.";
  }
  // Zod issues serialised across the server-function boundary arrive as JSON text.
  if (message.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(message) as { message?: string }[];
      const first = parsed[0]?.message;
      if (first && !TECHNICAL.test(first)) return first;
    } catch {
      // not JSON — fall through
    }
  }
  if (message && !TECHNICAL.test(message)) return message;
  return fallback;
}
