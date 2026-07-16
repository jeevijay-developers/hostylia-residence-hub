// Phase 11A — server functions for gate pass QR issue/scan and approvals.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// --- token helpers (Web Crypto, Worker-safe) ---
function randomToken(len = 24): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

const createPassSchema = z.object({
  student_id: z.string().uuid(),
  reason: z.string().min(3).max(200),
  destination: z.string().max(200).optional(),
  out_at: z.string(),
  expected_in_at: z.string(),
});

export const createGatePass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createPassSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: s, error: sErr } = await supabase
      .from("students")
      .select("id, tenant_id, property_id, is_minor")
      .eq("id", data.student_id)
      .maybeSingle();
    if (sErr || !s) throw new Error("Student not found");
    const requiresParent = !!s.is_minor;
    const initialStatus = requiresParent ? "PENDING_PARENT" : "PENDING_WARDEN";
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
        status: initialStatus,
        requires_parent_approval: requiresParent,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return gp;
  });

const decisionSchema = z.object({
  pass_id: z.string().uuid(),
  role: z.enum(["WARDEN", "PARENT", "HOSTEL_ADMIN"]),
  decision: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().max(300).optional(),
});

export const decideGatePass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => decisionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: gp, error } = await supabase
      .from("gate_passes").select("*").eq("id", data.pass_id).maybeSingle();
    if (error || !gp) throw new Error("Pass not found");

    const now = new Date().toISOString();
    const patch: Record<string, string | null> = {};
    if (data.role === "PARENT") {
      if (gp.status !== "PENDING_PARENT") throw new Error("Not awaiting parent approval");
      if (data.decision === "REJECTED") {
        patch.status = "REJECTED";
        patch.decision_reason = data.reason ?? null;
      } else {
        patch.parent_approved_by = userId;
        patch.parent_approved_at = now;
        patch.status = "PENDING_WARDEN";
      }
    } else {
      // Warden / Admin
      if (!["PENDING_WARDEN", "PENDING_PARENT", "DRAFT"].includes(gp.status)) {
        throw new Error(`Cannot decide from status ${gp.status}`);
      }
      if (data.decision === "REJECTED") {
        patch.status = "REJECTED";
        patch.decision_reason = data.reason ?? null;
      } else {
        // Issue QR token
        const raw = randomToken(24);
        const hash = await sha256Hex(raw);
        patch.warden_approved_by = userId;
        patch.warden_approved_at = now;
        patch.status = "APPROVED";
        patch.qr_token_hash = hash;
        patch.qr_expires_at = gp.expected_in_at;
        (patch as Record<string, string>)._raw_token = raw;
      }
    }

    const rawToken = (patch as { _raw_token?: string })._raw_token;
    delete (patch as { _raw_token?: string })._raw_token;

    const { data: updated, error: uErr } = await supabase
      .from("gate_passes").update(patch).eq("id", data.pass_id).select("*").single();
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

    return { pass: updated, qr_token: rawToken ?? null };
  });

const scanSchema = z.object({
  pass_id: z.string().uuid(),
  token: z.string().min(8),
  direction: z.enum(["IN", "OUT"]),
  device_id: z.string().optional(),
});

export const scanGatePass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scanSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: gp } = await supabase
      .from("gate_passes").select("*").eq("id", data.pass_id).maybeSingle();
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
    await supabase.from("gate_passes").update(passPatch).eq("id", gp.id);

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
        await supabase.functions.invoke("send-notification", {
          body: {
            channel: "IN_APP",
            templateKey: "gate_event",
            recipient: { userId: uid },
            variables: { direction: data.direction, pass_number: gp.pass_number },
            eventType: "GATE_EVENT",
            tenantId: gp.tenant_id,
            propertyId: gp.property_id,
            referenceId: `${gp.id}-${data.direction}-${bucket}`,
          },
        });
      }

      // Late entry → notify warden
      if (data.direction === "IN" && gp.warden_approved_by) {
        const { data: latestEvent } = await supabase
          .from("gate_events").select("is_late")
          .eq("gate_pass_id", gp.id).eq("direction", "IN")
          .order("event_at", { ascending: false }).limit(1).maybeSingle();
        if (latestEvent?.is_late) {
          await supabase.functions.invoke("send-notification", {
            body: {
              channel: "IN_APP",
              templateKey: "late_entry",
              recipient: { userId: gp.warden_approved_by },
              variables: { pass_number: gp.pass_number },
              eventType: "LATE_ENTRY",
              tenantId: gp.tenant_id,
              propertyId: gp.property_id,
              referenceId: `${gp.id}-late-${bucket}`,
            },
          });
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
  .inputValidator((d: unknown) => visitorScanSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: v } = await supabase
      .from("visitors").select("*").eq("id", data.visitor_id).maybeSingle();
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
    await supabase.from("visitors").update(
      data.direction === "IN"
        ? { status: "CHECKED_IN", checked_in_at: now }
        : { status: "CHECKED_OUT", checked_out_at: now },
    ).eq("id", v.id);

    // Notify host student
    try {
      const { data: st } = await supabase
        .from("students").select("profile_id").eq("id", v.host_student_id).maybeSingle();
      if (st?.profile_id) {
        await supabase.functions.invoke("send-notification", {
          body: {
            channel: "IN_APP",
            templateKey: "visitor_gate",
            recipient: { userId: st.profile_id },
            variables: { name: v.name, direction: data.direction },
            eventType: "VISITOR_GATE",
            tenantId: v.tenant_id,
            propertyId: v.property_id,
            referenceId: `${v.id}-${data.direction}-${bucket}`,
          },
        });
      }
    } catch { /* noop */ }
    return { ok: true };
  });

const bulkAttendanceSchema = z.object({
  property_id: z.string().uuid(),
  block_id: z.string().uuid().nullable().optional(),
  attendance_date: z.string(),
  session: z.enum(["DAILY", "MORNING", "EVENING"]).default("DAILY"),
  entries: z.array(z.object({
    student_id: z.string().uuid(),
    status: z.enum(["PRESENT", "ABSENT", "ON_LEAVE", "OUT_PASS", "NOT_MARKED"]),
    notes: z.string().optional(),
  })).min(1).max(1000),
});

export const bulkMarkAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkAttendanceSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prop } = await supabase
      .from("properties").select("tenant_id").eq("id", data.property_id).maybeSingle();
    if (!prop) throw new Error("Property not found");
    const rows = data.entries.map((e) => ({
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
      .from("attendance").upsert(rows, { onConflict: "student_id,attendance_date,session" });
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });
