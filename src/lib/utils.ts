import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Semantic icon/accent tones for KPI-style tiles and action rows — never
 * hardcode hex, always route through the existing design tokens (Design.md
 * Sec 4.2: status colours stay disjoint from the brand gold/teal `primary`).
 */
export type SemanticTone = "primary" | "success" | "destructive" | "warning" | "info" | "muted";

export const toneClasses: Record<SemanticTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  destructive: "bg-destructive/10 text-destructive",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  muted: "bg-muted text-muted-foreground",
};

/** Text-only variant — for bare icons with no background container. */
export const toneTextClasses: Record<SemanticTone, string> = {
  primary: "text-primary",
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-warning",
  info: "text-info",
  muted: "text-muted-foreground",
};

/**
 * Supabase/PostgREST errors are plain objects, not `instanceof Error`, so a
 * bare `e instanceof Error` check silently swallows the real reason (e.g. a
 * unique-constraint violation) behind a generic fallback. Pull `.message`
 * off anything error-shaped instead, and translate a unique-constraint
 * violation (Postgres code 23505) into a generic actionable hint.
 */
export function getErrorMessage(
  e: unknown,
  fallback: string,
  duplicateMessage = "That already exists — please review and try again.",
): string {
  if (e && typeof e === "object") {
    const code = "code" in e ? String((e as { code?: unknown }).code) : undefined;
    const message = "message" in e ? String((e as { message?: unknown }).message ?? "") : "";
    if (code === "23505" || message.toLowerCase().includes("duplicate key")) {
      return duplicateMessage;
    }
    if (message) return message;
  }
  return fallback;
}
