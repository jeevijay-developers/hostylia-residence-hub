/**
 * Which provider serves a notification channel, and whether its credentials are present.
 *
 * ONE decision, used by both `send-notification` (to actually send) and its internal
 * `provider_status` action (to tell the Notice Composer which channels it may offer), so what the
 * UI enables is exactly what the sender can deliver. Reads Edge Function secrets only; returns
 * booleans / reasons, never a secret value. Env var NAMES (`missing`) are for server logs and the
 * internal error message and must not be forwarded to browsers.
 *
 * Providers (existing integrations, nothing new):
 *   SMS       MSG91 Flow when MSG91_AUTH_KEY is set AND the template has a Flow id (see msg91.ts),
 *             else Twilio when TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER are set
 *   WHATSAPP  Twilio: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM
 *   EMAIL     Resend: RESEND_API_KEY (RESEND_FROM is optional, defaults to noreply@hostylia.com)
 *   IN_APP    database only, always available
 */
import { envNameForSmsType, msg91AuthKey, resolveMsg91TemplateId } from "./msg91.ts";

export type Channel = "IN_APP" | "SMS" | "WHATSAPP" | "EMAIL";
export type ProviderState = "CONFIGURED" | "PARTIAL" | "NOT_CONFIGURED";

export interface ChannelProvider {
  provider: "msg91" | "twilio" | "resend" | "none";
  configured: boolean;
  state: ProviderState;
  /** Env var names still needed. Server-side use only. */
  missing: string[];
  /** SMS only: MSG91 is set up but this template has no Flow id. */
  templateMissing: boolean;
}

function env(name: string): string | undefined {
  return Deno.env.get(name)?.trim() || undefined;
}

export function resolveChannelProvider(channel: Channel, templateKey: string): ChannelProvider {
  if (channel === "IN_APP") {
    return {
      provider: "none",
      configured: true,
      state: "CONFIGURED",
      missing: [],
      templateMissing: false,
    };
  }

  if (channel === "EMAIL") {
    const ok = !!env("RESEND_API_KEY");
    return {
      provider: "resend",
      configured: ok,
      state: ok ? "CONFIGURED" : "NOT_CONFIGURED",
      missing: ok ? [] : ["RESEND_API_KEY"],
      templateMissing: false,
    };
  }

  const sid = env("TWILIO_ACCOUNT_SID");
  const tok = env("TWILIO_AUTH_TOKEN");

  if (channel === "WHATSAPP") {
    const from = env("TWILIO_WHATSAPP_FROM");
    const missing = [
      ["TWILIO_ACCOUNT_SID", sid],
      ["TWILIO_AUTH_TOKEN", tok],
      ["TWILIO_WHATSAPP_FROM", from],
    ]
      .filter(([, v]) => !v)
      .map(([n]) => n as string);
    const ok = missing.length === 0;
    return {
      provider: "twilio",
      configured: ok,
      state: ok ? "CONFIGURED" : missing.length === 3 ? "NOT_CONFIGURED" : "PARTIAL",
      missing,
      templateMissing: false,
    };
  }

  // SMS
  const from = env("TWILIO_FROM_NUMBER");
  const hasMsg91 = !!msg91AuthKey();
  const msg91Mapped = !!resolveMsg91TemplateId(templateKey);
  if (hasMsg91 && msg91Mapped) {
    return {
      provider: "msg91",
      configured: true,
      state: "CONFIGURED",
      missing: [],
      templateMissing: false,
    };
  }
  if (sid && tok && from) {
    return {
      provider: "twilio",
      configured: true,
      state: "CONFIGURED",
      missing: [],
      templateMissing: false,
    };
  }
  const twilioMissing = [
    ["TWILIO_ACCOUNT_SID", sid],
    ["TWILIO_AUTH_TOKEN", tok],
    ["TWILIO_FROM_NUMBER", from],
  ]
    .filter(([, v]) => !v)
    .map(([n]) => n as string);
  const anyTwilio = twilioMissing.length < 3;
  const missing: string[] = [];
  if (hasMsg91 && !msg91Mapped) missing.push(envNameForSmsType(templateKey));
  if (!hasMsg91) missing.push("MSG91_AUTH_KEY");
  if (anyTwilio) missing.push(...twilioMissing);
  return {
    provider: hasMsg91 ? "msg91" : "twilio",
    configured: false,
    state: hasMsg91 || anyTwilio ? "PARTIAL" : "NOT_CONFIGURED",
    missing,
    templateMissing: hasMsg91 && !msg91Mapped,
  };
}

export interface ChannelAvailability {
  available: boolean;
  state: ProviderState;
  /** Safe to show to a tenant admin: no variable names, no values. Null when available. */
  reason: string | null;
}

const CHANNELS: Channel[] = ["IN_APP", "SMS", "WHATSAPP", "EMAIL"];

export function channelAvailability(templateKey: string): Record<Channel, ChannelAvailability> {
  const out = {} as Record<Channel, ChannelAvailability>;
  for (const ch of CHANNELS) {
    const p = resolveChannelProvider(ch, templateKey);
    let reason: string | null = null;
    if (!p.configured) {
      if (p.templateMissing)
        reason = "SMS provider is set up, but the notice SMS template is not configured";
      else if (p.state === "PARTIAL") reason = "Provider partially configured";
      else reason = "Provider not configured";
    }
    out[ch] = { available: p.configured, state: p.state, reason };
  }
  return out;
}
