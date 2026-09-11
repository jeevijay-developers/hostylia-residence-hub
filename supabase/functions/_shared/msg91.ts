/**
 * MSG91 Flow SMS helpers for Edge Functions.
 * Secrets: MSG91_AUTH_KEY (required). Optional: MSG91_SENDER_ID, MSG91_DLT_TE_ID,
 * MSG91_TEMPLATE_* (Flow template ids). Never put MSG91_AUTH_KEY in VITE_ / client.
 *
 * Code fallbacks below are existing MSG91 Flow ids (not JIO DLT TE ids).
 * Operator-approved DLT + MSG91 template list is still pending — override via env
 * without another code hunt. Do not invent DLT template IDs.
 *
 * Recipient object keys must match ##var## names in each Flow template.
 */

export const MSG91_FLOW_URL = "https://control.msg91.com/api/v5/flow/";

/** App registry: Flow variable names. templateId is a fallback only. */
export const MSG91_SMS_TEMPLATES = {
  AUTH_LOGIN_OTP: {
    templateId: "6a9eb6ac68ace313a608c543",
    envKeys: ["MSG91_TEMPLATE_AUTH_LOGIN_OTP", "MSG91_TEMPLATE_ID"] as const,
    variables: ["otp", "minutes"] as const,
  },
  SUB_EXPIRY: {
    templateId: "6a9eb68c0eeea3182c08c252",
    envKeys: ["MSG91_TEMPLATE_SUB_EXPIRY"] as const,
    variables: ["name", "plan", "expiry_date"] as const,
  },
  GATE_PASS_APPROVED: {
    templateId: "6a9eb669278d1571d90577d2",
    envKeys: ["MSG91_TEMPLATE_GATE_PASS_APPROVED"] as const,
    variables: ["name", "pass_id", "return_by"] as const,
  },
  PAY_OVERDUE: {
    templateId: "6a9eb644e9631d930409e4d3",
    envKeys: ["MSG91_TEMPLATE_PAY_OVERDUE"] as const,
    variables: ["name", "invoice", "amount", "due_date"] as const,
  },
  LATE_ENTRY: {
    templateId: "6a9eb449c0616f3bd4002282",
    envKeys: ["MSG91_TEMPLATE_LATE_ENTRY"] as const,
    variables: ["name", "property", "time"] as const,
  },
  ADMISSION_APPROVED: {
    templateId: "6a9e804a6de6fe3702048a43",
    envKeys: ["MSG91_TEMPLATE_ADMISSION_APPROVED"] as const,
    variables: ["name", "admission_id", "hostel"] as const,
  },
  STAFF_ACCESS_REVOKED: {
    templateId: "6a9e7796e09cdf3ea905bed2",
    envKeys: ["MSG91_TEMPLATE_STAFF_ACCESS_REVOKED"] as const,
    variables: ["name", "property"] as const,
  },
} as const;

export type Msg91SmsTemplateKey = keyof typeof MSG91_SMS_TEMPLATES;

/** Map send-notification `templateKey` → MSG91 registry key. */
export const NOTIFICATION_TEMPLATE_TO_MSG91: Record<string, Msg91SmsTemplateKey> = {
  auth_login_otp: "AUTH_LOGIN_OTP",
  gate_pass_approved: "GATE_PASS_APPROVED",
  late_entry: "LATE_ENTRY",
  pay_overdue: "PAY_OVERDUE",
  fee_reminder_student: "PAY_OVERDUE",
  fee_reminder_parent: "PAY_OVERDUE",
  admission_approved: "ADMISSION_APPROVED",
  staff_access_revoked: "STAFF_ACCESS_REVOKED",
  sub_expiry: "SUB_EXPIRY",
  subscription_expiry: "SUB_EXPIRY",
};

export function envNameForSmsType(templateKey: string): string {
  return `MSG91_TEMPLATE_${templateKey.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}`;
}

function firstEnv(names: readonly string[]): string | null {
  for (const name of names) {
    const v = Deno.env.get(name)?.trim();
    if (v) return v;
  }
  return null;
}

/** Flow template id: env override, then registry fallback, else null. */
export function resolveMsg91TemplateId(templateKey: string): string | null {
  const direct = firstEnv([envNameForSmsType(templateKey)]);
  if (direct) return direct;
  const mapped = NOTIFICATION_TEMPLATE_TO_MSG91[templateKey];
  if (!mapped) return null;
  const fromMappedEnv = firstEnv(MSG91_SMS_TEMPLATES[mapped].envKeys);
  if (fromMappedEnv) return fromMappedEnv;
  return MSG91_SMS_TEMPLATES[mapped].templateId || null;
}

export function normalizeMsg91Mobile(mobile: string): string {
  return mobile.replace(/[^\d]/g, "");
}

export function msg91AuthKey(): string | null {
  return Deno.env.get("MSG91_AUTH_KEY")?.trim() || null;
}

const VAR_ALIASES: Record<string, string[]> = {
  otp: ["otp", "OTP"],
  minutes: ["minutes", "otp_expiry", "expiry_minutes"],
  name: ["name", "full_name", "student_name", "invitee_name"],
  plan: ["plan", "plan_name"],
  expiry_date: ["expiry_date", "expires_on", "end_date"],
  pass_id: ["pass_id", "pass_number", "gate_pass"],
  return_by: ["return_by", "expected_return_at", "return_at"],
  invoice: ["invoice", "invoice_number"],
  amount: ["amount", "balance_rupees", "amount_rupees"],
  due_date: ["due_date"],
  property: ["property", "property_name", "hostel", "hostel_name"],
  time: ["time", "event_at", "late_at"],
  admission_id: ["admission_id", "admission_number", "student_id"],
  hostel: ["hostel", "hostel_name", "property", "property_name"],
};

/**
 * Build Flow recipient vars from notification variables.
 * Accepts both MSG91 names (pass_id) and app aliases (pass_number, invoice_number, …).
 */
export function buildMsg91RecipientVars(
  key: Msg91SmsTemplateKey | null,
  vars: Record<string, unknown>,
): Record<string, string> {
  const names = key
    ? [...MSG91_SMS_TEMPLATES[key].variables]
    : Object.keys(vars).filter((k) => typeof vars[k] !== "object");

  const out: Record<string, string> = {};
  for (const varName of names) {
    const keys = VAR_ALIASES[varName] ?? [varName];
    let value = "";
    for (const k of keys) {
      const raw = vars[k];
      if (raw != null && String(raw).trim() !== "") {
        value = String(raw);
        break;
      }
    }
    if (!value && varName === "amount") {
      if (typeof vars.balance_paise === "number") value = String(vars.balance_paise / 100);
      else if (typeof vars.amount_paise === "number") value = String(vars.amount_paise / 100);
    }
    out[varName] = value || "-";
  }
  return out;
}

export async function sendMsg91Flow(params: {
  templateId: string;
  mobiles: string;
  variables: Record<string, string>;
}): Promise<{ ok: true; ref: string | null } | { ok: false; error: string }> {
  const authKey = msg91AuthKey();
  if (!authKey) return { ok: false, error: "MSG91_AUTH_KEY not configured" };

  const sender = Deno.env.get("MSG91_SENDER_ID")?.trim();
  const payload: Record<string, unknown> = {
    template_id: params.templateId,
    short_url: "0",
    realTimeResponse: "1",
    recipients: [
      {
        mobiles: normalizeMsg91Mobile(params.mobiles),
        ...params.variables,
      },
    ],
  };
  if (sender) payload.sender = sender;

  const res = await fetch(MSG91_FLOW_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: authKey,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.type === "error") {
    return {
      ok: false,
      error: `MSG91 ${res.status}: ${body?.message ?? JSON.stringify(body)}`,
    };
  }
  return {
    ok: true,
    ref: typeof body?.message === "string" ? body.message : body?.request_id ?? null,
  };
}

export async function sendMsg91TemplateSms(
  templateKey: string,
  phone: string,
  variables: Record<string, unknown>,
): Promise<{ ok: true; ref: string | null; provider: "msg91" } | { ok: false; error: string }> {
  const templateId = resolveMsg91TemplateId(templateKey);
  if (!templateId) {
    return { ok: false, error: `No MSG91 mapping for templateKey=${templateKey}` };
  }
  const mapped = NOTIFICATION_TEMPLATE_TO_MSG91[templateKey] ?? null;
  const result = await sendMsg91Flow({
    templateId,
    mobiles: phone,
    variables: buildMsg91RecipientVars(mapped, variables),
  });
  if (!result.ok) return result;
  return { ok: true, ref: result.ref, provider: "msg91" };
}
