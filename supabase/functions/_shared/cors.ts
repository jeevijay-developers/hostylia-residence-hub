const ALLOWED_ORIGINS = new Set([
  "https://www.hostylia.com",
  "https://hostylia.com",
  "https://hostylia-residence-hub.vercel.app",
  "http://localhost:8080",
]);

const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-hostylia-internal";

/** Echo Origin only when it is on the allowlist. Always send Vary: Origin. */
export function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  const origin = req.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
