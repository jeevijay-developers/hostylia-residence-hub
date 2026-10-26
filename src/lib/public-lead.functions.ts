import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { PUBLIC_EMAIL } from "@/lib/site";
import { publicLeadSchema, type PublicLeadInput } from "@/schemas/public-lead";
import { verifyTurnstileToken } from "@/lib/turnstile";

const LEAD_LIMIT = 5;
const LEAD_WINDOW_SECONDS = 3600;

function getClientIp(): string {
  try {
    const req = getRequest();
    const xff = getRequestHeader("x-forwarded-for") || req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    const real = getRequestHeader("x-real-ip") || req.headers.get("x-real-ip");
    return real || "unknown";
  } catch {
    return "unknown";
  }
}

function leadBody(data: PublicLeadInput): string {
  const lines = [`Kind: ${data.kind}`, `Name: ${data.name}`, `Email: ${data.email}`];
  if (data.phone) lines.push(`Phone: ${data.phone}`);
  if (data.propertyName) lines.push(`Property: ${data.propertyName}`);
  if (data.city) lines.push(`City: ${data.city}`);
  if (data.propertyType) lines.push(`Property type: ${data.propertyType}`);
  if (data.beds) lines.push(`Beds: ${data.beds}`);
  if (data.message) lines.push("", "Message:", data.message);
  return lines.join("\n");
}

/**
 * Public contact and demo intake. Verifies Turnstile, rate-limits by IP,
 * then emails info@jeevijay.com via Resend. Does not call send-notification:
 * notifications.tenant_id is NOT NULL and a marketing lead has no tenant.
 */
export const submitPublicLead = createServerFn({ method: "POST" })
  .validator((data) => publicLeadSchema.parse(data))
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return { ok: false as const, message: "Could not send your message right now." };
    }

    const ip = getClientIp();
    const captcha = await verifyTurnstileToken(data.captchaToken, ip);
    if (!captcha.ok) return { ok: false as const, message: captcha.message };

    const admin = createClient<Database>(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: allowed, error: rlErr } = await admin.rpc("check_rate_limit", {
      p_bucket_key: `lead:${ip}`,
      p_limit: LEAD_LIMIT,
      p_window_seconds: LEAD_WINDOW_SECONDS,
    });
    if (rlErr) {
      console.error("submitPublicLead rate limit failed", rlErr.message);
      return { ok: false as const, message: "Could not send your message right now." };
    }
    if (!allowed) {
      return {
        ok: false as const,
        message: "Too many messages from this network. Please try again later.",
      };
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error("submitPublicLead missing RESEND_API_KEY");
      return { ok: false as const, message: "Could not send your message right now." };
    }

    const subject = data.kind === "demo" ? "Hostylia demo request" : "Hostylia contact message";
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM ?? "noreply@hostylia.com",
          to: [PUBLIC_EMAIL],
          reply_to: data.email,
          subject,
          text: leadBody(data),
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        console.error("submitPublicLead resend failed", res.status, detail);
        return { ok: false as const, message: "Could not send your message right now." };
      }
    } catch (err) {
      console.error("submitPublicLead resend request failed", err);
      return { ok: false as const, message: "Could not send your message right now." };
    }

    return { ok: true as const };
  });
