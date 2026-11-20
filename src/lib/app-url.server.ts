import { getRequest } from "@tanstack/react-start/server";

/**
 * Origin the invite's `redirectTo` points at. It MUST be in Supabase's allowed
 * redirect URLs: otherwise Supabase silently falls back to the Site URL (the
 * public landing page) and the recovery token is never seen by /reset-password.
 * APP_URL wins; with it unset we use the origin of the request that triggered the
 * invite (the app's own host) rather than a hard-coded port nobody serves.
 */
export function resolveAppUrl(): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  try {
    return new URL(getRequest().url).origin;
  } catch {
    return "http://localhost:8080";
  }
}
