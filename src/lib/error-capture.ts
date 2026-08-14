// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}

// The client (browser) disconnecting mid-SSR-stream — navigated away,
// refreshed, or closed the tab before the response finished — surfaces as
// Node's `_http_server` "aborted"/ECONNRESET error. It's expected traffic
// noise, not an application bug: the client is already gone, so there's no
// one to show an error page to.
export function isClientAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: unknown; message?: unknown; cause?: unknown };
  if (err.code === "ECONNRESET" || err.message === "aborted") return true;
  return isClientAbortError(err.cause);
}

// TanStack Start's dev-server middleware (@tanstack/start-plugin-core's
// dev-server-plugin) has its own try/catch around writing the SSR response
// to the raw Node socket, and logs via a plain `console.error(e)` we don't
// control (third-party node_modules code — not something to patch there).
// That catch fires *after* our own server.ts fetch handler has already
// returned successfully, when the client aborts while the response body is
// still being written, so `request.signal.aborted` in server.ts can't see
// it. This is the one safe interception point: filter only this exact
// benign shape out of console.error, globally — every other error still
// logs completely unchanged.
const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  if (args.some(isClientAbortError)) return;
  originalConsoleError(...args);
};
