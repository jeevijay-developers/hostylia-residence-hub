type SiteverifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
  hostname?: string;
  action?: string;
  challenge_ts?: string;
};

/**
 * Verifies a Turnstile token with Cloudflare. The secret is read from
 * TURNSTILE_SECRET_KEY at call time and is never prefixed with VITE_.
 * Returns a user-facing message when verification fails.
 */
export async function verifyTurnstileToken(
  token: string,
  remoteIp: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("[turnstile] TURNSTILE_SECRET_KEY is not set in this runtime");
    return { ok: false, message: "Captcha is not configured." };
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = (await res.json()) as SiteverifyResponse;
    if (!res.ok || !payload.success) {
      // Diagnostic only, on failure: Cloudflare's own verdict. Never log the token or the secret.
      // error-codes tell the causes apart, e.g. invalid-input-secret (wrong secret),
      // invalid-input-response (token not issued for this secret's widget, or malformed),
      // timeout-or-duplicate (expired / already used), missing-input-response (empty token).
      console.warn("[turnstile] siteverify rejected", {
        httpStatus: res.status,
        success: payload.success ?? false,
        errorCodes: payload["error-codes"] ?? [],
        hostname: payload.hostname ?? null,
        action: payload.action ?? null,
        challengeTs: payload.challenge_ts ?? null,
        tokenLength: token.length,
        remoteIpSent: body.has("remoteip"),
      });
      return { ok: false, message: "Captcha verification failed. Please try again." };
    }
    return { ok: true };
  } catch (err) {
    console.error("turnstile siteverify failed", err);
    return { ok: false, message: "Captcha verification failed. Please try again." };
  }
}
