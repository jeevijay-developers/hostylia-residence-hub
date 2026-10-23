/**
 * Centralized entry point for every outgoing SMS/WhatsApp/Email/in-app
 * notification. Application code should call this instead of invoking the
 * `send-notification` edge function directly.
 *
 * This call itself resolves fast — it only waits for the notification job to
 * be queued (a DB insert), never for the email/SMS provider to actually
 * deliver it. The edge function inserts the PENDING notifications +
 * notification_attempts rows synchronously, then hands the real provider
 * call off to `EdgeRuntime.waitUntil` before responding. Delivery failures
 * are retried automatically by the `retry-failed-notifications` pg_cron job
 * (see supabase/migrations/20260826103712_notification_retry_worker.sql),
 * up to 5 attempts with exponential backoff — never by re-calling this
 * function, which would mint a second notification row.
 *
 * Never throws — a failed/unreachable edge function must not fail the
 * business operation it was queued from.
 */

type Channel = "IN_APP" | "SMS" | "WHATSAPP" | "EMAIL";

interface DispatchNotificationArgs {
  channel: Channel;
  templateKey: string;
  recipient: { userId?: string; phone?: string; email?: string };
  variables?: Record<string, unknown>;
  eventType: string;
  tenantId: string;
  propertyId?: string | null;
  referenceId?: string;
  locale?: string;
}

interface DispatchResult {
  ok: boolean;
  notification_id?: string;
  status?: string;
  error_code?: string;
  message?: string;
}

export async function dispatchNotification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: DispatchNotificationArgs,
): Promise<DispatchResult> {
  try {
    // Server env only. Do not read a VITE_ copy of this secret.
    const internalSecret = process.env.INTERNAL_FUNCTION_SECRET;
    if (!internalSecret) {
      console.warn("dispatchNotification: INTERNAL_FUNCTION_SECRET is not set");
      return { ok: false, message: "Notification dispatch is not configured" };
    }
    const { data, error } = await supabase.functions.invoke("send-notification", {
      body: args,
      headers: { "x-hostylia-internal": internalSecret },
    });
    if (error) {
      console.warn("dispatchNotification: edge function call failed", error);
      return { ok: false, message: error.message };
    }
    if (!data?.ok) {
      console.warn("dispatchNotification: provider rejected the notification", data);
    }
    return data as DispatchResult;
  } catch (e) {
    console.warn("dispatchNotification: unexpected failure", e);
    return { ok: false, message: e instanceof Error ? e.message : "unknown error" };
  }
}
