import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  publicAdmissionSchema,
  studentBulkRowSchema,
  allocationCreateSchema,
  clickConsentSchema,
} from "@/schemas/student";

function adminClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function getClientIp(): string {
  try {
    const req = getRequest();
    const xff = getRequestHeader("x-forwarded-for") || req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    const real = getRequestHeader("x-real-ip") || req.headers.get("x-real-ip");
    return real || "unknown";
  } catch {
    return "unknown";
  }
}

function nextAdmissionNumber(): string {
  const y = new Date().getFullYear().toString().slice(-2);
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `A${y}-${rand}`;
}

/**
 * PUBLIC UNAUTHENTICATED admission submission. Only entry point where
 * anonymous callers can write to public.students. Uses service role after
 * validating the property slug + IP rate limit.
 */
export const submitPublicAdmission = createServerFn({ method: "POST" })
  .inputValidator((data) => publicAdmissionSchema.parse(data))
  .handler(async ({ data }) => {
    const ip = getClientIp();
    const admin = adminClient();

    const { data: allowed, error: rlErr } = await admin.rpc("check_rate_limit", {
      p_bucket_key: `admission:${ip}`,
      p_limit: 10,
      p_window_seconds: 3600,
    });
    if (rlErr) throw new Error("Rate limiter unavailable");
    if (!allowed) throw new Error("Too many applications from this network. Please try again later.");

    const { data: props, error: pErr } = await admin
      .from("properties")
      .select("id, tenant_id, status")
      .eq("slug", data.property_slug)
      .is("deleted_at", null)
      .limit(2);
    if (pErr) throw new Error(pErr.message);
    if (!props?.length) throw new Error("Property not found");
    if (props.length > 1) throw new Error("Property slug is ambiguous — contact the hostel");
    const property = props[0];
    if (property.status !== "ACTIVE") throw new Error("Property is not accepting applications");

    const dob = data.date_of_birth || null;
    const isMinor = dob
      ? new Date().getFullYear() - new Date(dob).getFullYear() < 18
      : false;

    const { data: student, error: sErr } = await admin
      .from("students")
      .insert({
        tenant_id: property.tenant_id,
        property_id: property.id,
        admission_number: nextAdmissionNumber(),
        full_name: data.full_name,
        phone: data.phone,
        email: data.email || null,
        date_of_birth: dob,
        gender: data.gender ?? null,
        academic_institute: data.academic_institute || null,
        course_name: data.course_name || null,
        academic_year: data.academic_year || null,
        is_minor: isMinor,
        status: "APPLICANT",
        metadata: { source: "public_admission", ip },
      })
      .select("id, admission_number")
      .single();
    if (sErr) throw new Error(sErr.message);

    // Upsert guardian by (tenant, phone), then link.
    const normalizedPhone = data.guardian_phone.startsWith("+")
      ? data.guardian_phone
      : `+${data.guardian_phone}`;

    const { data: existingG } = await admin
      .from("guardians")
      .select("id")
      .eq("tenant_id", property.tenant_id)
      .eq("phone", normalizedPhone)
      .limit(1)
      .maybeSingle();

    let guardianId = existingG?.id;
    if (!guardianId) {
      const { data: gIns, error: gErr } = await admin
        .from("guardians")
        .insert({
          tenant_id: property.tenant_id,
          full_name: data.guardian_name,
          phone: normalizedPhone,
        })
        .select("id")
        .single();
      if (gErr) throw new Error(gErr.message);
      guardianId = gIns.id;
    }

    await admin.from("student_guardians").insert({
      tenant_id: property.tenant_id,
      student_id: student.id,
      guardian_id: guardianId!,
      relationship: data.guardian_relationship,
      is_primary: true,
      is_emergency_contact: true,
    });

    return { ok: true as const, admission_number: student.admission_number };
  });

const bulkImportSchema = z.object({
  tenant_id: z.string().uuid(),
  property_id: z.string().uuid(),
  rows: z.array(studentBulkRowSchema).min(1).max(1000),
});

export const bulkImportStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => bulkImportSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const errors: { row: number; error: string }[] = [];
    let inserted = 0;
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      try {
        const dob = r.date_of_birth && /^\d{4}-\d{2}-\d{2}$/.test(r.date_of_birth) ? r.date_of_birth : null;
        const { data: student, error } = await supabase
          .from("students")
          .insert({
            tenant_id: data.tenant_id,
            property_id: data.property_id,
            admission_number: nextAdmissionNumber(),
            full_name: r.full_name,
            phone: r.phone || null,
            email: r.email || null,
            date_of_birth: dob,
            gender: r.gender || null,
            academic_institute: r.academic_institute || null,
            course_name: r.course_name || null,
            is_minor: dob ? new Date().getFullYear() - new Date(dob).getFullYear() < 18 : false,
            status: "APPLICANT",
          })
          .select("id")
          .single();
        if (error) throw error;

        if (r.guardian_phone && r.guardian_name) {
          const phone = r.guardian_phone.startsWith("+") ? r.guardian_phone : `+${r.guardian_phone}`;
          const { data: eg } = await supabase
            .from("guardians")
            .select("id")
            .eq("tenant_id", data.tenant_id)
            .eq("phone", phone)
            .maybeSingle();
          let gid = eg?.id;
          if (!gid) {
            const { data: gi } = await supabase
              .from("guardians")
              .insert({ tenant_id: data.tenant_id, full_name: r.guardian_name, phone })
              .select("id")
              .single();
            gid = gi?.id;
          }
          if (gid) {
            await supabase.from("student_guardians").insert({
              tenant_id: data.tenant_id,
              student_id: student.id,
              guardian_id: gid,
              relationship: "GUARDIAN",
              is_primary: true,
            });
          }
        }
        inserted += 1;
      } catch (e) {
        errors.push({ row: i + 1, error: e instanceof Error ? e.message : "unknown" });
      }
    }
    return { inserted, failed: errors.length, errors };
  });

export const createAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => allocationCreateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: bed, error: bErr } = await supabase
      .from("beds")
      .select("id, tenant_id, property_id, room_id, floor_id, block_id, status")
      .eq("id", data.bed_id)
      .single();
    if (bErr || !bed) throw new Error("Bed not found");
    if (bed.status !== "VACANT") throw new Error("Bed is not vacant");

    const { data: alloc, error: aErr } = await supabase
      .from("allocations")
      .insert({
        tenant_id: bed.tenant_id,
        property_id: bed.property_id,
        student_id: data.student_id,
        bed_id: bed.id,
        room_id: bed.room_id,
        floor_id: bed.floor_id,
        block_id: bed.block_id,
        status: "PENDING_AGREEMENT",
        start_date: data.start_date,
        expected_end_date: data.expected_end_date || null,
        rent_snapshot_paise: data.rent_snapshot_paise,
        deposit_snapshot_paise: data.deposit_snapshot_paise,
        billing_cycle_day: data.billing_cycle_day,
        lock_in_until: data.lock_in_until || null,
        notice_period_days: data.notice_period_days,
      })
      .select("id, tenant_id, property_id, student_id")
      .single();
    if (aErr) throw new Error(aErr.message);

    // Draft agreement
    const { data: agree, error: agErr } = await supabase
      .from("agreements")
      .insert({
        tenant_id: alloc.tenant_id,
        property_id: alloc.property_id,
        student_id: alloc.student_id,
        allocation_id: alloc.id,
        template_version: "v1",
        status: "SENT",
        sent_at: new Date().toISOString(),
        signature_method: "CLICK_CONSENT",
      })
      .select("id")
      .single();
    if (agErr) throw new Error(agErr.message);

    await supabase.from("allocations").update({ agreement_id: agree.id }).eq("id", alloc.id);
    return { allocation_id: alloc.id, agreement_id: agree.id };
  });

export const acceptAgreementClickwrap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => clickConsentSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ip = getClientIp();
    const ua = (() => {
      try { return getRequestHeader("user-agent") || getRequest().headers.get("user-agent") || "unknown"; }
      catch { return "unknown"; }
    })();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("agreements")
      .update({
        status: "SIGNED",
        signed_at: now,
        signed_by_user_id: userId,
        signature_method: "CLICK_CONSENT",
        signature_evidence: {
          accepted_at: now,
          ip_address: ip,
          user_agent: ua,
          document_hash: data.document_hash,
        },
      })
      .eq("id", data.agreement_id);
    if (error) throw new Error(error.message);

    // Advance allocation to PENDING_PAYMENT once signed
    const { data: agr } = await supabase
      .from("agreements")
      .select("allocation_id")
      .eq("id", data.agreement_id)
      .single();
    if (agr?.allocation_id) {
      await supabase
        .from("allocations")
        .update({ status: "PENDING_PAYMENT" })
        .eq("id", agr.allocation_id)
        .eq("status", "PENDING_AGREEMENT");
    }
    return { ok: true as const };
  });

const moveOutSchema = z.object({
  allocation_id: z.string().uuid(),
  actual_end_date: z.string().date(),
});

export const moveOutAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => moveOutSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: alloc, error: aErr } = await supabase
      .from("allocations")
      .update({
        status: "CLOSED",
        actual_end_date: data.actual_end_date,
        closed_at: new Date().toISOString(),
      })
      .eq("id", data.allocation_id)
      .select("student_id")
      .single();
    if (aErr) throw new Error(aErr.message);

    await supabase
      .from("students")
      .update({ status: "MOVED_OUT", moved_out_at: data.actual_end_date })
      .eq("id", alloc.student_id);

    return { ok: true as const };
  });

export const previewMoveOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ allocation_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: eDate }, { data: refund }] = await Promise.all([
      supabase.rpc("earliest_move_out_date", { p_allocation_id: data.allocation_id }),
      supabase.rpc("provisional_refund_paise", { p_allocation_id: data.allocation_id }),
    ]);
    return {
      earliest_move_out_date: eDate as string | null,
      provisional_refund_paise: (refund as number | null) ?? 0,
    };
  });

/**
 * Register a document row after a client-side signed upload has completed.
 * Client uploads to storage via signed URL, then calls this to record metadata.
 */
const registerDocSchema = z.object({
  tenant_id: z.string().uuid(),
  property_id: z.string().uuid().nullable(),
  owner_type: z.enum(["STUDENT", "GUARDIAN", "ALLOCATION", "PROPERTY", "COMPLAINT"]),
  owner_id: z.string().uuid(),
  document_type: z.string().min(1).max(40),
  storage_bucket: z.string().min(1),
  storage_path: z.string().min(1),
  original_filename: z.string().min(1).max(200),
  mime_type: z.string().min(1).max(120),
  size_bytes: z.number().int().min(0),
});

export const registerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => registerDocSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc, error } = await supabase
      .from("documents")
      .insert({
        ...data,
        status: "AVAILABLE",
        verification_status: "PENDING",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: doc.id };
  });
