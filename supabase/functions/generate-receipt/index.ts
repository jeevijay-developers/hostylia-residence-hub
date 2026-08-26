// Generates a self-contained, styled HTML payment receipt (matches the
// approved Hostylia receipt design), uploads it to the `receipts` bucket,
// and registers a documents row. WhatsApp/email delivery is stubbed with a
// TODO — Phase 2 flagged Twilio as pending manual setup, so no real
// provider is wired.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { payment_id } = await req.json();
    if (!payment_id) return json({ error: "payment_id required" }, 400, cors);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pay, error } = await admin
      .from("payments")
      .select(
        "id, tenant_id, property_id, student_id, invoice_id, payment_number, amount_paise, mode, status, offline_reference, provider_payment_ref, notes, recorded_by, paid_at, created_at, students(full_name), invoices(invoice_number)",
      )
      .eq("id", payment_id)
      .single();
    if (error || !pay) return json({ error: "Payment not found" }, 404, cors);

    let capturedBy = "System";
    if (pay.recorded_by) {
      const { data: recorder } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", pay.recorded_by)
        .maybeSingle();
      if (recorder?.full_name) capturedBy = recorder.full_name;
    }

    const contents = renderReceiptHtml({
      receiptNo: pay.payment_number,
      date: pay.paid_at ?? pay.created_at,
      studentName: pay.students?.full_name ?? "—",
      invoiceNumber: pay.invoices?.invoice_number ?? "—",
      mode: pay.mode,
      paymentDate: pay.paid_at ?? pay.created_at,
      amountPaise: pay.amount_paise,
      reference: pay.offline_reference,
      notes: pay.notes,
      capturedBy,
      capturedOn: pay.created_at,
      transactionId: pay.provider_payment_ref ?? pay.id,
      status: pay.status,
    });

    const path = `${pay.tenant_id}/${pay.property_id}/${pay.id}.html`;
    const { error: upErr } = await admin.storage.from("receipts").upload(path, contents, {
      contentType: "text/html",
      upsert: true,
    });
    if (upErr) return json({ error: upErr.message }, 500, cors);

    await admin.from("documents").insert({
      tenant_id: pay.tenant_id,
      property_id: pay.property_id,
      owner_type: "RECEIPT",
      owner_id: pay.id,
      document_type: "PAYMENT_RECEIPT",
      storage_bucket: "receipts",
      storage_path: path,
      original_filename: `${pay.payment_number}.html`,
      mime_type: "text/html",
      size_bytes: contents.length,
      status: "AVAILABLE",
      verification_status: "PENDING",
    });

    // Dispatch notifications via unified sender (Phase 10).
    try {
      const { data: student } = await admin
        .from("students")
        .select("id, profile_id, email")
        .eq("id", pay.student_id)
        .maybeSingle();

      const dispatch = async (opts: {
        channel: "IN_APP" | "SMS" | "WHATSAPP" | "EMAIL";
        userId?: string;
        phone?: string;
        email?: string;
      }) => {
        await admin.functions.invoke("send-notification", {
          body: {
            channel: opts.channel,
            templateKey: "payment_receipt",
            recipient: { userId: opts.userId, phone: opts.phone, email: opts.email },
            variables: { payment_number: pay.payment_number, amount_paise: pay.amount_paise },
            eventType: "PAYMENT_RECEIPT",
            tenantId: pay.tenant_id,
            propertyId: pay.property_id,
            referenceId: pay.id,
          },
        });
      };
      if (student?.profile_id) await dispatch({ channel: "IN_APP", userId: student.profile_id });
      if (student?.email) await dispatch({ channel: "EMAIL", email: student.email });
      // Parents with can_pay_fees
      const { data: gs } = await admin
        .from("student_guardians")
        .select("can_pay_fees, guardians(profile_id, phone, email)")
        .eq("student_id", pay.student_id)
        .is("unlinked_at", null);
      for (const g of gs ?? []) {
        if (!g.can_pay_fees) continue;
        const uid = (g as any).guardians?.profile_id ?? undefined;
        const phone = (g as any).guardians?.phone ?? undefined;
        const email = (g as any).guardians?.email ?? undefined;
        if (uid) await dispatch({ channel: "IN_APP", userId: uid });
        if (phone) await dispatch({ channel: "WHATSAPP", phone });
        if (email) await dispatch({ channel: "EMAIL", email });
      }
    } catch (e) {
      console.warn("[generate-receipt] notify failed", e);
    }

    return json({ ok: true, path }, 200, cors);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Internal" }, 500, cors);
  }
});

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

// ---- Amount-in-words (Indian numbering: lakh/crore) ----
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? " " + ONES[o] : "");
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return (h ? ONES[h] + " Hundred" + (rest ? " " : "") : "") + (rest ? twoDigits(rest) : "");
}

function numberToIndianWords(n: number): string {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  const parts: string[] = [];
  if (crore) parts.push(threeDigits(crore) + " Crore");
  if (lakh) parts.push(threeDigits(lakh) + " Lakh");
  if (thousand) parts.push(threeDigits(thousand) + " Thousand");
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(" ");
}

function amountInWords(amountPaise: number): string {
  const rupees = Math.floor(amountPaise / 100);
  return `${numberToIndianWords(rupees)} Rupees Only`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

function formatInr(amountPaise: number): string {
  return `₹${(amountPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---- Icons (inline SVG, lucide-style outline) ----
const ICON = {
  document:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  calendar:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  user:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>',
  card:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
  rupee:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10"/></svg>',
  list:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  shieldCheck:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>',
  building:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/></svg>',
  mail:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>',
  globe:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
};

interface ReceiptData {
  receiptNo: string;
  date: string;
  studentName: string;
  invoiceNumber: string;
  mode: string;
  paymentDate: string;
  amountPaise: number;
  reference: string | null;
  notes: string | null;
  capturedBy: string;
  capturedOn: string;
  transactionId: string;
  status: string;
}

function renderReceiptHtml(d: ReceiptData): string {
  const dash = (v: string | null | undefined) => (v && v.trim() ? esc(v) : "—");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Receipt ${esc(d.receiptNo)}</title>
<style>
  :root {
    --navy: #12132c;
    --purple: #5b4fe0;
    --purple-light: #eeecfd;
    --text: #171923;
    --muted: #6b7280;
    --border: #e5e7eb;
    --stripe: #f6f5fe;
    --green-bg: #dcfce8;
    --green-text: #15803d;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    background: #e9eaf3;
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--text);
  }
  .receipt {
    max-width: 640px;
    margin: 0 auto;
    background: #fff;
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(18, 19, 44, 0.15);
  }
  .header {
    background: var(--navy);
    color: #fff;
    padding: 28px 32px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
    font-size: 20px;
    letter-spacing: 0.5px;
  }
  .brand-mark {
    width: 30px;
    height: 30px;
    color: #5eead4;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .header-title {
    text-align: right;
  }
  .header-title .t1 {
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  .header-title .t2 {
    font-size: 12px;
    color: #b9bad2;
    margin-top: 2px;
  }
  .header-badge {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .header-badge svg {
    width: 22px;
    height: 22px;
    color: #c8c4ff;
  }
  .accent-line {
    height: 4px;
    background: linear-gradient(90deg, var(--purple), #8b7bff);
  }
  .body-pad {
    padding: 28px 32px 32px;
  }
  .row-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 24px;
  }
  .label {
    font-size: 12px;
    color: var(--muted);
    margin: 0 0 4px;
  }
  .value-lg {
    font-size: 22px;
    font-weight: 800;
    color: var(--purple);
    margin: 0;
  }
  .field-with-icon {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .field-with-icon svg {
    width: 15px;
    height: 15px;
    color: var(--purple);
  }
  .field-with-icon .value {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
  }
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 22px 20px;
    margin-bottom: 26px;
  }
  .info-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .icon-circle {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--purple-light);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .icon-circle svg {
    width: 16px;
    height: 16px;
    color: var(--purple);
  }
  .icon-circle.solid {
    background: var(--purple);
  }
  .icon-circle.solid svg {
    color: #fff;
  }
  .info-item .label {
    margin-bottom: 3px;
  }
  .info-item .value {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
  }
  .section {
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    margin-bottom: 22px;
  }
  .section-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 18px;
  }
  .section-head h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
  }
  .summary-table {
    width: 100%;
    border-collapse: collapse;
  }
  .summary-table tr {
    border-top: 1px solid var(--border);
  }
  .summary-table tr:nth-child(odd) {
    background: var(--stripe);
  }
  .summary-table td {
    padding: 12px 18px;
    font-size: 14px;
  }
  .summary-table td:first-child {
    color: var(--muted);
  }
  .summary-table td:last-child {
    text-align: right;
    font-weight: 700;
    color: var(--text);
  }
  .summary-table tr.amount td:last-child {
    color: var(--purple);
    font-size: 16px;
  }
  .transaction-card {
    background: var(--purple-light);
    border-radius: 14px;
    padding: 18px 20px;
    margin-bottom: 8px;
  }
  .transaction-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
  }
  .transaction-head svg {
    width: 15px;
    height: 15px;
    color: var(--purple);
  }
  .transaction-head h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
  }
  .transaction-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px 20px;
  }
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--green-bg);
    color: var(--green-text);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.3px;
    padding: 5px 12px;
    border-radius: 999px;
  }
  .status-pill svg {
    width: 11px;
    height: 11px;
  }
  .footer-note {
    text-align: center;
    margin-top: 24px;
  }
  .footer-note .divider {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  .footer-note .divider .line {
    width: 60px;
    height: 1px;
    background: var(--border);
  }
  .footer-note .divider svg {
    width: 22px;
    height: 22px;
    color: var(--purple);
  }
  .footer-note h3 {
    margin: 0 0 4px;
    font-size: 18px;
    font-weight: 800;
  }
  .footer-note p {
    margin: 0;
    font-size: 12.5px;
    color: var(--muted);
  }
  .bottom-bar {
    background: var(--navy);
    color: #cfd0e6;
    font-size: 12px;
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 22px;
    flex-wrap: wrap;
  }
  .bottom-bar span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .bottom-bar svg {
    width: 13px;
    height: 13px;
  }
  @media print {
    body { background: #fff; padding: 0; }
    .receipt { box-shadow: none; border-radius: 0; max-width: 100%; }
  }
</style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="brand">
        <svg class="brand-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/></svg>
        HOSTYLIA
      </div>
      <div class="header-right">
        <div class="header-title">
          <div class="t1">PAYMENT RECEIPT</div>
          <div class="t2">Thank you for your payment</div>
        </div>
        <div class="header-badge">${ICON.document}</div>
      </div>
    </div>
    <div class="accent-line"></div>

    <div class="body-pad">
      <div class="row-top">
        <div>
          <p class="label">Receipt No.</p>
          <p class="value-lg">${esc(d.receiptNo)}</p>
        </div>
        <div>
          <p class="label">Date</p>
          <div class="field-with-icon">${ICON.calendar}<span class="value">${esc(formatDateTime(d.date))}</span></div>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-item">
          <span class="icon-circle">${ICON.user}</span>
          <div>
            <p class="label">Student Name</p>
            <p class="value">${dash(d.studentName)}</p>
          </div>
        </div>
        <div class="info-item">
          <span class="icon-circle">${ICON.document}</span>
          <div>
            <p class="label">Invoice No.</p>
            <p class="value">${dash(d.invoiceNumber)}</p>
          </div>
        </div>
        <div class="info-item">
          <span class="icon-circle">${ICON.card}</span>
          <div>
            <p class="label">Payment Mode</p>
            <p class="value">${esc(d.mode)}</p>
          </div>
        </div>
        <div class="info-item">
          <span class="icon-circle">${ICON.calendar}</span>
          <div>
            <p class="label">Payment Date</p>
            <p class="value">${esc(formatDateTime(d.paymentDate))}</p>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-head">
          <span class="icon-circle solid">${ICON.rupee}</span>
          <h2>Payment Summary</h2>
        </div>
        <table class="summary-table">
          <tr class="amount"><td>Amount (INR)</td><td>${esc(formatInr(d.amountPaise))}</td></tr>
          <tr><td>Amount in Words</td><td>${esc(amountInWords(d.amountPaise))}</td></tr>
          <tr><td>Reference</td><td>${dash(d.reference)}</td></tr>
          <tr><td>Notes</td><td>${dash(d.notes)}</td></tr>
        </table>
      </div>

      <div class="transaction-card">
        <div class="transaction-head">
          ${ICON.list}
          <h2>Transaction Details</h2>
        </div>
        <div class="transaction-grid">
          <div>
            <p class="label">Captured By</p>
            <p class="value">${esc(d.capturedBy)}</p>
          </div>
          <div>
            <p class="label">Captured On</p>
            <p class="value">${esc(formatDateTime(d.capturedOn))}</p>
          </div>
          <div>
            <p class="label">Transaction ID</p>
            <p class="value">${esc(d.transactionId)}</p>
          </div>
          <div>
            <p class="label">Status</p>
            <span class="status-pill">${ICON.check} ${esc(d.status)}</span>
          </div>
        </div>
      </div>

      <div class="footer-note">
        <div class="divider">
          <span class="line"></span>
          ${ICON.shieldCheck}
          <span class="line"></span>
        </div>
        <h3>Thank you.</h3>
        <p>This is a system generated receipt and does not require a signature.</p>
      </div>
    </div>

    <div class="bottom-bar">
      <span>${ICON.building} Hostylia Management System</span>
      <span>${ICON.mail} support@hostylia.com</span>
      <span>${ICON.globe} www.hostylia.com</span>
    </div>
  </div>
</body>
</html>`;
}
