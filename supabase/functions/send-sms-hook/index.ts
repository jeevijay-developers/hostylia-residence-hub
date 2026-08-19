// Supabase Auth "Send SMS" hook — delivers phone-login OTPs via MSG91 instead
// of a natively supported provider. Configured in supabase/config.toml under
// [auth.hook.send_sms]; Supabase Auth POSTs here whenever it needs to send an
// OTP SMS (phone login, phone MFA challenge, etc).
//
// Payload (Standard Webhooks signed): { user: { phone }, sms: { otp } }
// Expected response: {} with HTTP 200 on success; { error: { http_code, message } } otherwise.
//
// Requires secrets:
//   SEND_SMS_HOOK_SECRET — shared HMAC secret, format "v1,whsec_<base64>",
//     must match the `secrets` value configured for this hook in config.toml.
//   MSG91_AUTH_KEY        — MSG91 account auth key.
//   MSG91_TEMPLATE_ID     — DLT-approved MSG91 Flow template id containing an
//     OTP variable placeholder.
//   MSG91_OTP_VAR         — optional, name of the template variable that holds
//     the OTP (defaults to "OTP", MSG91's own default variable name).
//   DEV_TEST_PHONES        — optional, comma-separated E.164 phone numbers (no
//     leading "+", matching how GoTrue passes user.phone) allowed to bypass
//     MSG91 while it's unconfigured (DLT approval pending). ONLY these numbers
//     get a logged OTP + fake success; every other number still fails closed
//     with 503 so real users never get a false "OTP sent" with no delivery.
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

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
  const TEMPLATE_ID = Deno.env.get("MSG91_TEMPLATE_ID");
  const OTP_VAR = Deno.env.get("MSG91_OTP_VAR") || "OTP";
  if (!AUTH_KEY || !TEMPLATE_ID) {
    // TEMPORARY (DLT approval pending): MSG91 isn't configured yet, so real SMS
    // can't go out. For real users this must still fail closed (503) — a fake
    // "success" with no delivery would strand them on the OTP screen with no
    // way to get a code. Only an explicit allowlist of test numbers gets a
    // logged OTP + fake success, so login can be smoke-tested without MSG91.
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
          message: "MSG91 is not configured — add MSG91_AUTH_KEY and MSG91_TEMPLATE_ID.",
        },
      },
      503,
    );
  }

  const mobile = phone.replace(/^\+/, "");

  try {
    const res = await fetch("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: AUTH_KEY,
      },
      body: JSON.stringify({
        template_id: TEMPLATE_ID,
        short_url: "0",
        recipients: [
          {
            mobiles: mobile,
            [OTP_VAR]: otp,
          },
        ],
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.type === "error") {
      return json(
        {
          error: { http_code: res.status, message: `MSG91 error: ${body?.message ?? "unknown"}` },
        },
        res.status || 502,
      );
    }

    return json({}, 200);
  } catch (e) {
    return json(
      {
        error: {
          http_code: 500,
          message: e instanceof Error ? e.message : "Failed to reach MSG91.",
        },
      },
      500,
    );
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
