/**
 * One-shot: create Razorpay website-review student (email/password).
 * Usage: bun scripts/create-razorpay-review-student.mjs
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const raw = readFileSync(resolve(".env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

loadEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const EMAIL = "arjun.mehta@hostylia.com";
const PASSWORD = "HostyliaPay2026!";
const FULL_NAME = "Arjun Mehta";
const PHONE = "+919876501234";
const TENANT_ID = "fc9a1181-e282-44c6-84bb-6ed4178f35bb";
const PROPERTY_ID = "fd32ddaf-65d7-4570-bf56-07e9db6b1ba8";

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  // Idempotent: if user exists, reset password and ensure links
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = listed.data?.users?.find((u) => u.email === EMAIL);

  if (!user) {
    const created = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: FULL_NAME,
        intended_role: "STUDENT",
        phone: PHONE,
      },
    });
    if (created.error) throw created.error;
    user = created.data.user;
    console.log("Created auth user", user.id);
  } else {
    const upd = await admin.auth.admin.updateUserById(user.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        ...user.user_metadata,
        full_name: FULL_NAME,
        intended_role: "STUDENT",
        phone: PHONE,
      },
      ban_duration: "none",
    });
    if (upd.error) throw upd.error;
    user = upd.data.user;
    console.log("Updated existing auth user", user.id);
  }

  await admin.from("profiles").upsert(
    {
      id: user.id,
      full_name: FULL_NAME,
      email: EMAIL,
      phone: PHONE,
    },
    { onConflict: "id" },
  );

  const { error: mErr } = await admin.from("tenant_memberships").upsert(
    {
      tenant_id: TENANT_ID,
      user_id: user.id,
      status: "ACTIVE",
      joined_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,user_id" },
  );
  if (mErr) throw mErr;

  const { data: existingRole } = await admin
    .from("role_assignments")
    .select("id")
    .eq("user_id", user.id)
    .eq("tenant_id", TENANT_ID)
    .eq("role", "STUDENT")
    .is("revoked_at", null)
    .limit(1);

  if (!existingRole?.length) {
    const { error: rErr } = await admin.from("role_assignments").insert({
      tenant_id: TENANT_ID,
      user_id: user.id,
      role: "STUDENT",
      property_id: PROPERTY_ID,
      is_active: true,
      granted_at: new Date().toISOString(),
    });
    if (rErr) throw rErr;
  }

  let { data: student } = await admin
    .from("students")
    .select("id")
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!student) {
    const admission = `RZPY-${Date.now().toString(36).toUpperCase()}`;
    const { data: inserted, error: sErr } = await admin
      .from("students")
      .insert({
        tenant_id: TENANT_ID,
        property_id: PROPERTY_ID,
        profile_id: user.id,
        full_name: FULL_NAME,
        email: EMAIL,
        phone: PHONE,
        admission_number: admission,
        portal_access_enabled: true,
        status: "ACTIVE",
      })
      .select("id")
      .single();
    if (sErr) throw sErr;
    student = inserted;
    console.log("Created student", student.id, admission);
  } else {
    await admin
      .from("students")
      .update({
        portal_access_enabled: true,
        status: "ACTIVE",
        full_name: FULL_NAME,
        email: EMAIL,
        phone: PHONE,
      })
      .eq("id", student.id);
    console.log("Linked existing student", student.id);
  }

  const { data: openInv } = await admin
    .from("invoices")
    .select("id, invoice_number, balance_paise, status")
    .eq("student_id", student.id)
    .in("status", ["ISSUED", "OVERDUE", "PARTIALLY_PAID"])
    .gt("balance_paise", 0)
    .is("deleted_at", null)
    .limit(1);

  if (!openInv?.length) {
    const due = new Date();
    due.setDate(due.getDate() + 14);
    const invNo = `INV-RZPY-${Date.now().toString(36).toUpperCase()}`;
    const total = 500000; // ₹5,000.00
    const { error: iErr } = await admin.from("invoices").insert({
      tenant_id: TENANT_ID,
      property_id: PROPERTY_ID,
      student_id: student.id,
      invoice_number: invNo,
      status: "ISSUED",
      currency: "INR",
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: due.toISOString().slice(0, 10),
      issued_at: new Date().toISOString(),
      subtotal_paise: total,
      tax_paise: 0,
      discount_paise: 0,
      late_fee_paise: 0,
      total_paise: total,
      paid_paise: 0,
      refunded_paise: 0,
      balance_paise: total,
      gst_invoice: false,
      notes: "Razorpay website review sample hostel fee invoice",
    });
    if (iErr) throw iErr;
    console.log("Created open invoice", invNo, "₹5000");
  } else {
    console.log("Open invoice already exists", openInv[0].invoice_number);
  }

  console.log("\n=== Razorpay review credentials ===");
  console.log("Login URL: https://www.hostylia.com/login");
  console.log("Email:   ", EMAIL);
  console.log("Password:", PASSWORD);
  console.log("Steps:   Email & Password tab → login → Student → Fees → Pay");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
