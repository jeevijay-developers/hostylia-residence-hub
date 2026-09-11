// Supabase Auth "Send SMS" hook — delivers phone-login OTPs via MSG91 Flow.
// Configured in supabase/config.toml under [auth.hook.send_sms].
//
// Payload (Standard Webhooks signed): { user: { phone }, sms: { otp } }
// Expected response: {} with HTTP 200 on success; { error: { http_code, message } } otherwise.
//
// Secrets:
//   SEND_SMS_HOOK_SECRET — HMAC secret (v1,whsec_…)
//   MSG91_AUTH_KEY       — MSG91 auth key (never VITE_/client)
//   MSG91_TEMPLATE_ID / MSG91_TEMPLATE_AUTH_LOGIN_OTP — Flow id; DLT TE ids stay in MSG91 dashboard
//   MSG91_SENDER_ID      — optional DLT sender (e.g. JEEVJY)
//   MSG91_OTP_VAR        — optional; default "otp" (matches ##otp##)
//   MSG91_OTP_MINUTES    — optional; default "10" (matches ##minutes##)
//   DEV_TEST_PHONES      — optional allowlist when MSG91 unset
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import {
  normalizeMsg91Mobile,
  resolveMsg91TemplateId,
  sendMsg91Flow,
} from "../_shared/msg91.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");
  if (!hookSecret) {
    return json(
      { error: { http_code: 500, message: "Send SMS hook secret not configured." } },
      500,
    );
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  let event: { user?: { phone?: string }; sms?: { otp?: string } };
  try {
    const wh = new Webhook(hookSecret.replace("v1,whsec_", ""));
    event = wh.verify(payload, headers) as typeof event;
  } catch {
    return json({ error: { http_code: 401, message: "Invalid webhook signature." } }, 401);
  }

  const phone = event.user?.phone;
  const otp = event.sms?.otp;
  if (!phone || !otp) {
    return json(
      { error: { http_code: 400, message: "Missing user.phone or sms.otp in payload." } },
      400,
    );
  }

  const AUTH_KEY = Deno.env.get("MSG91_AUTH_KEY");
  const TEMPLATE_ID = resolveMsg91TemplateId("auth_login_otp");
  const OTP_VAR = Deno.env.get("MSG91_OTP_VAR")?.trim() || "otp";
  const MINUTES = Deno.env.get("MSG91_OTP_MINUTES")?.trim() || "10";

  if (!AUTH_KEY) {
    const testPhones = (Deno.env.get("DEV_TEST_PHONES") || "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (testPhones.includes(phone)) {
      console.log(`[send-sms-hook] DEV BYPASS (allowlisted test phone): phone=${phone} otp=${otp}`);
      return json({}, 200);
    }
    return json(
      {
        error: {
          http_code: 503,
          message: "MSG91 is not configured — add MSG91_AUTH_KEY.",
        },
      },
      503,
    );
  }

  if (!TEMPLATE_ID) {
    return json(
      {
        error: {
          http_code: 503,
          message: "MSG91 OTP template is not configured — set MSG91_TEMPLATE_AUTH_LOGIN_OTP or MSG91_TEMPLATE_ID.",
        },
      },
      503,
    );
  }

  const result = await sendMsg91Flow({
    templateId: TEMPLATE_ID,
    mobiles: normalizeMsg91Mobile(phone),
    variables: {
      [OTP_VAR]: otp,
      minutes: MINUTES,
      // Also set MSG91 default OTP var name if custom override is used
      ...(OTP_VAR !== "otp" ? { otp } : {}),
    },
  });

  if (!result.ok) {
    return json(
      { error: { http_code: 502, message: result.error } },
      502,
    );
  }

  return json({}, 200);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
