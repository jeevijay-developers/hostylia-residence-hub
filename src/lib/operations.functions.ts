// Phase 11A — server functions for gate pass QR issue/scan and approvals.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dispatchNotification } from "@/lib/dispatch-notification";
import { formatGateTime } from "@/lib/gate-time";

// --- token helpers (Web Crypto, Worker-safe) ---
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Guards visitor/gate-pass "expected" date inputs against typo'd years
 * (e.g. "202-08-20" or "20255-08-20") — a malformed year still parses as a
 * valid Date, so a plain Number.isNaN check on `new Date(...)` misses it.
 */
export function isExpectedYearValid(dateStr: string): boolean {
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return false;
  const year = parsed.getFullYear();
  const currentYear = new Date().getFullYear();
  return year >= currentYear && year <= currentYear + 1;
}

const createPassSchema = z.object({
  student_id: z.string().uuid(),
  reason: z.string().min(3).max(200),
  destination: z.string().max(200).optional(),
  out_at: z.string(),
  expected_in_at: z.string(),
  qr_token_hash: z.string().length(64),
});

export const createGatePass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => createPassSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: s, error: sErr } = await supabase
      .from("students")
      .select("id, tenant_id, property_id")
      .eq("id", data.student_id)
      .maybeSingle();
    if (sErr || !s) throw new Error("Student not found");
    // Every student (minor or adult) requests straight from the Warden — no parent step.
    const { data: gp, error } = await supabase
      .from("gate_passes")
      .insert({
        tenant_id: s.tenant_id,
        property_id: s.property_id,
        student_id: s.id,
        pass_number: "",
        reason: data.reason,
        destination: data.destination ?? null,
        out_at: data.out_at,
        expected_in_at: data.expected_in_at,
        status: "PENDING_WARDEN",
        requires_parent_approval: false,
        qr_token_hash: data.qr_token_hash,
        qr_expires_at: data.expected_in_at,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return gp;
  });

const reissueQrSchema = z.object({
  pass_id: z.string().uuid(),
  qr_token_hash: z.string().length(64),
});

/**
 * Re-issues a gate pass's QR (rotates qr_token_hash). The token itself is
 * still generated client-side and only its hash reaches here — same as
 * createGatePass — so the plaintext never touches the server or gets
 * persisted anywhere. This is what makes the QR retrievable from *any*
 * device after login: the student's browser calls this on demand instead of
 * relying on a token that was only ever saved to localStorage on the device
 * that created the pass. Scanning (scanGatePass) is untouched — it already
 * just compares a hash, so it doesn't care which device issued the token it's
 * currently checking.
 */
export const reissueGatePassQrToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => reissueQrSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: gp, error: gErr } = await supabase
      .from("gate_passes")
      .select("id, status")
      .eq("id", data.pass_id)
      .maybeSingle();
    if (gErr || !gp) throw new Error("Gate pass not found");
    if (!["APPROVED", "ACTIVE"].includes(gp.status)) {
      throw new Error(`Cannot issue a QR for a ${gp.status.toLowerCase()} pass`);
    }
    const { error } = await supabase
      .from("gate_passes")
      .update({ qr_token_hash: data.qr_token_hash })
      .eq("id", data.pass_id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const createVisitorSchema = z.object({
  host_student_id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(20),
  purpose: z.string().trim().min(2).max(200),
  expected_at: z.string().optional(),
});

/**
 * Registers a visitor against an existing student host. Wardens already have
 * FOR ALL access to `visitors` via the `vis_warden` RLS policy
 * (warden_can_read_property) — this just fills in the previously-missing
 * server function + validation; no policy changes needed. `status` is left
 * off the insert so the column default ('REQUESTED') applies, reusing the
 * existing lifecycle checkVisitor already drives forward.
 */
export const createVisitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => createVisitorSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: s, error: sErr } = await supabase
      .from("students")
      .select("id, tenant_id, property_id")
      .eq("id", data.host_student_id)
      .maybeSingle();
    if (sErr || !s) throw new Error("Student not found");
    const { data: v, error } = await supabase
      .from("visitors")
      .insert({
        tenant_id: s.tenant_id,
        property_id: s.property_id,
        host_student_id: s.id,
        name: data.name,
        phone: data.phone,
        purpose: data.purpose,
        expected_at: data.expected_at ?? null,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return v;
  });

const decisionSchema = z.object({
  pass_id: z.string().uuid(),
  role: z.enum(["WARDEN", "HOSTEL_ADMIN"]),
  decision: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().max(300).optional(),
});

export const decideGatePass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => decisionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: gp, error } = await supabase
      .from("gate_passes")
      .select("*")
      .eq("id", data.pass_id)
      .maybeSingle();
    if (error || !gp) throw new Error("Pass not found");

    const now = new Date().toISOString();
    const patch: Record<string, string | null> = {};
    // Warden / Admin — the only approver. (PENDING_PARENT is legacy: no new pass gets it, and the
    // migration moves existing ones to PENDING_WARDEN; it stays decidable so none can be stuck.)
    if (!["PENDING_WARDEN", "PENDING_PARENT", "DRAFT"].includes(gp.status)) {
      throw new Error(`Cannot decide from status ${gp.status}`);
    }
    if (data.decision === "REJECTED") {
      patch.status = "REJECTED";
      patch.decision_reason = data.reason ?? null;
    } else {
      // QR token hash was set at creation; approval just finalizes status.
      patch.warden_approved_by = userId;
      patch.warden_approved_at = now;
      patch.status = "APPROVED";
    }

    const { data: updated, error: uErr } = await supabase
      .from("gate_passes")
      .update(patch as never)
      .eq("id", data.pass_id)
      .select("*")
      .single();
    if (uErr) throw new Error(uErr.message);

    await supabase.from("gate_pass_approvals").insert({
      tenant_id: gp.tenant_id,
      property_id: gp.property_id,
      gate_pass_id: gp.id,
      approver_type: data.role,
      approver_user_id: userId,
      decision: data.decision,
      reason: data.reason ?? null,
    });

    if (data.decision === "APPROVED") {
      try {
        const { data: student } = await supabase
          .from("students")
          .select("full_name, phone")
          .eq("id", gp.student_id)
          .maybeSingle();
        const phone = student?.phone?.trim();
        if (phone) {
          const returnBy = gp.expected_return_at
            ? new Date(gp.expected_return_at).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "-";
          await dispatchNotification(supabase, {
            channel: "SMS",
            templateKey: "gate_pass_approved",
            recipient: { phone },
            variables: {
              name: student?.full_name ?? "Student",
              pass_id: gp.pass_number ?? gp.id.slice(0, 8),
              return_by: returnBy,
            },
            eventType: "GATE_PASS_APPROVED",
            tenantId: gp.tenant_id,
            propertyId: gp.property_id,
            referenceId: gp.id,
          });
        }
      } catch (e) {
        console.warn("[decideGatePass] SMS notify failed", e);
      }
    }

    return { pass: updated };
  });

const scanSchema = z.object({
  pass_id: z.string().uuid(),
  token: z.string().min(8),
  direction: z.enum(["IN", "OUT"]),
  device_id: z.string().optional(),
});

/**
 * Active wardens who may be told about a late entry on this pass: WARDEN role assignments in the pass's tenant
 * that cover its property (property-wide or this property) and its block (all blocks or this block) - the same
 * scope rule as warden_can_write_scope. Read with the server client because a warden's own session cannot read
 * other wardens' assignments. Never throws: a lookup failure just means no warden is notified.
 */
async function listPropertyWardenIds(gp: {
  tenant_id: string;
  property_id: string;
  block_id: string | null;
}): Promise<string[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const wardens = supabaseAdmin
      .from("role_assignments")
      .select("user_id")
      .eq("tenant_id", gp.tenant_id)
      .eq("role", "WARDEN")
      .eq("is_active", true)
      .or(`property_id.is.null,property_id.eq.${gp.property_id}`);
    const { data } = gp.block_id
      ? await wardens.or(`block_id.is.null,block_id.eq.${gp.block_id}`)
      : await wardens.is("block_id", null);
    return [...new Set((data ?? []).map((r: { user_id: string }) => r.user_id))];
  } catch (e) {
    console.warn("[scanGatePass] warden lookup failed", e);
    return [];
  }
}

export const scanGatePass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => scanSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: gp } = await supabase
      .from("gate_passes")
      .select("*")
      .eq("id", data.pass_id)
      .maybeSingle();
    if (!gp) throw new Error("Pass not found");
    if (!gp.qr_token_hash) throw new Error("Pass has no QR issued");
    if (gp.qr_expires_at && new Date(gp.qr_expires_at) < new Date() && data.direction === "OUT") {
      throw new Error("QR expired");
    }
    const providedHash = await sha256Hex(data.token);
    if (providedHash !== gp.qr_token_hash) throw new Error("Invalid QR token");

    if (data.direction === "OUT" && !["APPROVED", "ACTIVE"].includes(gp.status)) {
      throw new Error(`Cannot check out from status ${gp.status}`);
    }
    if (data.direction === "IN" && gp.status !== "ACTIVE") {
      throw new Error("Pass not currently active");
    }

    // Idempotency: pass + direction + minute-bucket
    const bucket = Math.floor(Date.now() / 60000);
    const idem = `gp:${gp.id}:${data.direction}:${bucket}`;

    const { error: evErr } = await supabase.from("gate_events").insert({
      tenant_id: gp.tenant_id,
      property_id: gp.property_id,
      block_id: gp.block_id,
      student_id: gp.student_id,
      gate_pass_id: gp.id,
      direction: data.direction,
      method: "QR",
      recorded_by: userId,
      device_id: data.device_id ?? null,
      idempotency_key: idem,
    });
    if (evErr && !evErr.message.includes("duplicate")) throw new Error(evErr.message);

    const now = new Date().toISOString();
    const passPatch: Record<string, unknown> =
      data.direction === "OUT"
        ? { status: "ACTIVE", actual_out_at: now }
        : { status: "COMPLETED", actual_in_at: now };
    await supabase
      .from("gate_passes")
      .update(passPatch as never)
      .eq("id", gp.id);

    // Notify parent(s)
    try {
      const { data: guardians } = await supabase
        .from("student_guardians")
        .select("can_view_gate_events, guardians(profile_id)")
        .eq("student_id", gp.student_id)
        .is("unlinked_at", null);
      for (const g of guardians ?? []) {
        if (!g.can_view_gate_events) continue;
        const uid = (g as { guardians?: { profile_id?: string } }).guardians?.profile_id;
        if (!uid) continue;
        await dispatchNotification(supabase, {
          channel: "IN_APP",
          templateKey: "gate_event",
          recipient: { userId: uid },
          variables: { direction: data.direction, pass_number: gp.pass_number },
          eventType: "GATE_EVENT",
          tenantId: gp.tenant_id,
          propertyId: gp.property_id,
          referenceId: `${gp.id}-${data.direction}-${bucket}`,
        });
      }

      // Late entry → notify the property's wardens. Eligible: this student IN event, which the curfew
      // trigger marked late (whether or not the pass has an approving warden). Everything is keyed on the
      // gate event id, so processing the same scan again never notifies twice.
      if (data.direction === "IN") {
        const { data: lateEvent } = await supabase
          .from("gate_events")
          .select("id, is_late")
          .eq("tenant_id", gp.tenant_id)
          .eq("idempotency_key", idem)
          .maybeSingle();
        if (lateEvent?.is_late) {
          const { data: student } = await supabase
            .from("students")
            .select("full_name, phone")
            .eq("id", gp.student_id)
            .maybeSingle();
          const { data: property } = await supabase
            .from("properties")
            .select("name, timezone")
            .eq("id", gp.property_id)
            .maybeSingle();
          const time = formatGateTime(new Date(), property?.timezone);
          const lateVars = {
            name: student?.full_name ?? "Student",
            property: property?.name ?? "hostel",
            time,
            pass_number: gp.pass_number,
          };
          for (const wardenId of await listPropertyWardenIds(gp)) {
            await dispatchNotification(supabase, {
              channel: "IN_APP",
              templateKey: "late_entry",
              recipient: { userId: wardenId },
              variables: lateVars,
              eventType: "LATE_ENTRY",
              tenantId: gp.tenant_id,
              propertyId: gp.property_id,
              referenceId: `${lateEvent.id}-late`,
            });
          }
          const { data: guardianRows } = await supabase
            .from("student_guardians")
            .select("can_view_gate_events, guardians(phone)")
            .eq("student_id", gp.student_id)
            .is("unlinked_at", null);
          for (const row of guardianRows ?? []) {
            if (!row.can_view_gate_events) continue;
            const phone = (
              row as { guardians?: { phone?: string | null } }
            ).guardians?.phone?.trim();
            if (!phone) continue;
            await dispatchNotification(supabase, {
              channel: "SMS",
              templateKey: "late_entry",
              recipient: { phone },
              variables: lateVars,
              eventType: "LATE_ENTRY",
              tenantId: gp.tenant_id,
              propertyId: gp.property_id,
              referenceId: `${lateEvent.id}-late-sms-${phone.slice(-4)}`,
            });
          }
        }
      }
    } catch (e) {
      console.warn("[scanGatePass] notify failed", e);
    }
    return { ok: true };
  });

const visitorScanSchema = z.object({
  visitor_id: z.string().uuid(),
  direction: z.enum(["IN", "OUT"]),
});

export const checkVisitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => visitorScanSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: v } = await supabase
      .from("visitors")
      .select("*")
      .eq("id", data.visitor_id)
      .maybeSingle();
    if (!v) throw new Error("Visitor not found");
    const now = new Date().toISOString();
    const bucket = Math.floor(Date.now() / 60000);
    const idem = `vis:${v.id}:${data.direction}:${bucket}`;
    const { error } = await supabase.from("gate_events").insert({
      tenant_id: v.tenant_id,
      property_id: v.property_id,
      visitor_id: v.id,
      direction: data.direction,
      method: "MANUAL",
      recorded_by: userId,
      idempotency_key: idem,
    });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    await supabase
      .from("visitors")
      .update(
        data.direction === "IN"
          ? { status: "CHECKED_IN", checked_in_at: now }
          : { status: "CHECKED_OUT", checked_out_at: now },
      )
      .eq("id", v.id);

    // Notify host student
    try {
      const { data: st } = await supabase
        .from("students")
        .select("profile_id")
        .eq("id", v.host_student_id)
        .maybeSingle();
      if (st?.profile_id) {
        await dispatchNotification(supabase, {
          channel: "IN_APP",
          templateKey: "visitor_gate",
          recipient: { userId: st.profile_id },
          variables: { name: v.name, direction: data.direction },
          eventType: "VISITOR_GATE",
          tenantId: v.tenant_id,
          propertyId: v.property_id,
          referenceId: `${v.id}-${data.direction}-${bucket}`,
        });
      }
    } catch {
      /* noop */
    }
    return { ok: true };
  });

const bulkAttendanceSchema = z
  .object({
    property_id: z.string().uuid(),
    block_id: z.string().uuid().nullable().optional(),
    attendance_date: z.string(),
    session: z.enum(["DAILY", "MORNING", "EVENING"]).default("DAILY"),
    entries: z
      .array(
        z.object({
          student_id: z.string().uuid(),
          status: z.enum(["PRESENT", "ABSENT", "LATE", "ON_LEAVE", "OUT_PASS", "NOT_MARKED"]),
          notes: z.string().optional(),
        }),
      )
      .min(1)
      .max(1000),
  })
  .superRefine((data, ctx) => {
    data.entries.forEach((e, i) => {
      if (e.status !== "PRESENT" && !e.notes?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A remark is required for any status other than Present",
          path: ["entries", i, "notes"],
        });
      }
    });
  });

export const bulkMarkAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => bulkAttendanceSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prop } = await supabase
      .from("properties")
      .select("tenant_id")
      .eq("id", data.property_id)
      .maybeSingle();
    if (!prop) throw new Error("Property not found");
    // Students on APPROVED leave for this date are locked: their attendance is
    // derived from the leave request (see fn_apply_leave_to_attendance), so any
    // entry for them — including "Mark all Present" — is dropped here instead of
    // overwriting it. fn_attendance_guard_leave() enforces the same in the DB.
    const { data: leaveRows, error: leaveErr } = await (
      supabase.from("leave_requests" as never) as unknown as LeaveLookup
    )
      .select("student_id")
      .eq("property_id", data.property_id)
      .eq("status", "APPROVED")
      .lte("start_date", data.attendance_date)
      .gte("end_date", data.attendance_date)
      .in(
        "student_id",
        data.entries.map((e) => e.student_id),
      );
    if (leaveErr) throw new Error(leaveErr.message);
    const onLeave = new Set((leaveRows ?? []).map((r) => r.student_id));
    // Out-Pass is derived from the gate records and never saved as an attendance
    // row (that would duplicate / fabricate it), so any such entry is dropped.
    const entries = data.entries.filter(
      (e) => !onLeave.has(e.student_id) && e.status !== "OUT_PASS",
    );

    // On Leave is never set by hand — only an approved leave request creates it.
    if (entries.some((e) => e.status === "ON_LEAVE")) {
      throw new Error("On Leave can only be set through an approved leave request");
    }
    if (entries.length === 0) return { inserted: 0, skipped_on_leave: onLeave.size };

    const rows = entries.map((e) => ({
      tenant_id: prop.tenant_id,
      property_id: data.property_id,
      block_id: data.block_id ?? null,
      student_id: e.student_id,
      attendance_date: data.attendance_date,
      session: data.session,
      status: e.status,
      marked_by: userId,
      source: "BULK" as const,
      notes: e.notes ?? null,
    }));
    const { error } = await supabase
      .from("attendance")
      .upsert(rows, { onConflict: "student_id,attendance_date,session" });
    if (error) throw new Error(error.message);
    return { inserted: rows.length, skipped_on_leave: onLeave.size };
  });

// leave_requests is not in the generated types until types.ts is regenerated
// after 20261102100000 is applied; minimal hand-typed builder for this lookup.
interface LeaveLookup {
  select(columns: string): LeaveLookup;
  eq(column: string, value: string): LeaveLookup;
  lte(column: string, value: string): LeaveLookup;
  gte(column: string, value: string): LeaveLookup;
  in(
    column: string,
    values: string[],
  ): PromiseLike<{ data: { student_id: string }[] | null; error: { message: string } | null }>;
}
