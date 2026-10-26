type SiteverifyResponse = {
  success?: boolean;
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
      return { ok: false, message: "Captcha verification failed. Please try again." };
    }
    return { ok: true };
  } catch (err) {
    console.error("turnstile siteverify failed", err);
    return { ok: false, message: "Captcha verification failed. Please try again." };
  }
}
