import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  adminComplaintSaveSchema,
  adminCreatableStatuses,
  complaintCategoryCreateSchema,
  COMPLAINT_STATUS_TRANSITIONS,
  resolutionSummaryError,
  type ComplaintStatus,
} from "@/schemas/complaint";

/**
 * Admin writes for a property's Complaints tab (New / Edit complaint, status changes, Assign
 * warden, inline New category).
 *
 * A Hostel Admin may write complaints directly under RLS ("complaints admin all"), but that policy
 * only checks the tenant: nothing stops a browser call from pointing a complaint at another
 * property's student, room or category, and audit_logs has no client INSERT policy. So every write
 * goes through here: the tenant is always taken from the stored property / complaint (never from
 * the client), the caller must hold HOSTEL_ADMIN in that tenant, the student / room / bed /
 * category / warden must all belong to this property, and the write itself uses the caller's own
 * client so RLS and every complaint trigger (status transitions, resolution summary, assignee
 * scope, notifications) still apply. Only the audit row uses the service role.
 */

type Db = SupabaseClient<Database>;
type ComplaintRow = Database["public"]["Tables"]["complaints"]["Row"];
type ComplaintUpdate = Database["public"]["Tables"]["complaints"]["Update"];

const OPEN_LIKE: readonly string[] = ["OPEN", "REOPENED"];

/** A friendly message for a failed write, never a raw JSON / constraint dump. */
function friendly(e: unknown, fallback: string): Error {
  if (e && typeof e === "object") {
    const code = "code" in e ? String((e as { code?: unknown }).code ?? "") : "";
    const message = "message" in e ? String((e as { message?: unknown }).message ?? "") : "";
    if (code === "23505") return new Error("That already exists — please review and try again.");
    if (code === "42501" && !message) return new Error("You don't have permission to do that.");
    if (message.startsWith("assigned_to ")) {
      return new Error("That warden can't take complaints for this property or block.");
    }
    if (message) return new Error(message);
  }
  return new Error(fallback);
}

async function assertTenantAdmin(db: Db, userId: string, tenantId: string) {
  const { data, error } = await db.rpc("has_tenant_role", {
    _user_id: userId,
    _tenant_id: tenantId,
    _role: "HOSTEL_ADMIN",
  });
  if (error) throw friendly(error, "We couldn't check your access. Please try again.");
  if (!data) throw new Error("Only a Hostel Admin can manage this property's complaints.");
}

/** The property (read with the caller's client, so RLS decides if it is visible) and admin check. */
async function loadPropertyAsAdmin(db: Db, userId: string, propertyId: string) {
  const { data, error } = await db
    .from("properties")
    .select("id, tenant_id")
    .eq("id", propertyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw friendly(error, "We couldn't load this property. Please try again.");
  if (!data) throw new Error("This property could not be found.");
  await assertTenantAdmin(db, userId, data.tenant_id);
  return data;
}

async function assertStudentInProperty(db: Db, studentId: string, propertyId: string) {
  const { data, error } = await db
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("property_id", propertyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw friendly(error, "We couldn't check the student. Please try again.");
  if (!data) throw new Error("That student is not a resident of this property.");
}

/** Room / bed must be in this property (and the bed in the room); block follows the room. */
async function resolvePlace(
  db: Db,
  propertyId: string,
  roomId: string | null,
  bedId: string | null,
): Promise<{ room_id: string | null; bed_id: string | null; block_id: string | null }> {
  if (!roomId) {
    if (bedId) throw new Error("Choose the room before choosing a bed.");
    return { room_id: null, bed_id: null, block_id: null };
  }
  const { data: room, error } = await db
    .from("rooms")
    .select("id, block_id")
    .eq("id", roomId)
    .eq("property_id", propertyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw friendly(error, "We couldn't check the room. Please try again.");
  if (!room) throw new Error("That room is not part of this property.");
  if (bedId) {
    const { data: bed, error: bedErr } = await db
      .from("beds")
      .select("id")
      .eq("id", bedId)
      .eq("room_id", roomId)
      .is("deleted_at", null)
      .maybeSingle();
    if (bedErr) throw friendly(bedErr, "We couldn't check the bed. Please try again.");
    if (!bed) throw new Error("That bed is not in the chosen room.");
  }
  return { room_id: roomId, bed_id: bedId, block_id: room.block_id };
}

async function assertCategory(db: Db, categoryId: string, propertyId: string) {
  const { data, error } = await db
    .from("complaint_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw friendly(error, "We couldn't check the category. Please try again.");
  if (!data) throw new Error("That category is not available for this property.");
}

/** Same rule as the Admin complaints page's warden list (and the database's assignee check). */
async function assertWarden(
  db: Db,
  tenantId: string,
  propertyId: string,
  blockId: string | null,
  wardenId: string,
) {
  const { data, error } = await db
    .from("role_assignments")
    .select("block_id, permissions")
    .eq("user_id", wardenId)
    .eq("tenant_id", tenantId)
    .eq("property_id", propertyId)
    .eq("role", "WARDEN")
    .eq("is_active", true);
  if (error) throw friendly(error, "We couldn't check the warden. Please try again.");
  const ok = (data ?? []).some((r) => {
    const perms =
      r.permissions && typeof r.permissions === "object" && !Array.isArray(r.permissions)
        ? (r.permissions as Record<string, Json | undefined>)
        : null;
    return (!r.block_id || r.block_id === blockId) && perms?.complaints !== false;
  });
  if (!ok) throw new Error("That warden can't take complaints for this property or block.");
}

function assertTransition(from: string, to: ComplaintStatus) {
  if (from === to) return;
  if (to === "CLOSED") {
    throw new Error("Complaints close automatically 48 hours after they are resolved.");
  }
  if (to === "REOPENED") {
    throw new Error("Use the reopen override to reopen a resolved or closed complaint.");
  }
  const allowed = COMPLAINT_STATUS_TRANSITIONS[from as ComplaintStatus] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(
      `A ${from.replaceAll("_", " ").toLowerCase()} complaint can't be moved to ${to
        .replaceAll("_", " ")
        .toLowerCase()}.`,
    );
  }
}

function requireSummary(summary: string | null | undefined): string {
  const value = summary ?? "";
  const err = resolutionSummaryError(value);
  if (err) throw new Error(err);
  return value.trim();
}

const toMs = (iso: string) => new Date(iso).getTime();

/** audit_logs has no client INSERT policy — service role only (same as the other *.functions.ts). */
async function writeAudit(row: {
  tenant_id: string;
  property_id: string;
  actor_user_id: string;
  action: string;
  entity_id: string;
  before_data: Json | null;
  after_data: Json | null;
  metadata?: Json;
  entity_type?: string;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("audit_logs")
      .insert({ ...row, entity_type: row.entity_type ?? "complaints" });
    if (error) console.warn("[property-complaints] audit_logs insert failed", error.message);
  } catch (e) {
    console.warn("[property-complaints] audit_logs insert failed", e);
  }
}

interface SaveComplaintResult {
  id: string;
  complaint_number: string;
  status: string;
  /** Set when the complaint was saved but something the Admin asked for could not be applied. */
  warning: string | null;
}

export const saveAdminComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => adminComplaintSaveSchema.parse(d))
  .handler(async ({ data, context }): Promise<SaveComplaintResult> => {
    const db: Db = context.supabase;
    const userId = context.userId;

    if (data.mode === "create") {
      const property = await loadPropertyAsAdmin(db, userId, data.property_id);
      const target = data.status;
      if (!(adminCreatableStatuses as readonly string[]).includes(target)) {
        throw new Error("A new complaint can be Open, Assigned, In progress or Resolved.");
      }
      if (target === "ASSIGNED" && !data.assigned_to) {
        throw new Error("Choose the warden to assign this complaint to.");
      }
      const summary = target === "RESOLVED" ? requireSummary(data.resolution_summary) : null;
      if (toMs(data.created_at) > Date.now() + 5 * 60_000) {
        throw new Error("The raised time can't be in the future.");
      }
      if (toMs(data.sla_due_at) <= toMs(data.created_at)) {
        throw new Error("The SLA due time must be after the raised time.");
      }
      await assertStudentInProperty(db, data.student_id, property.id);
      await assertCategory(db, data.category_id, property.id);
      const place = await resolvePlace(db, property.id, data.room_id, data.bed_id);
      if (data.assigned_to) {
        await assertWarden(db, property.tenant_id, property.id, place.block_id, data.assigned_to);
      }

      const nowIso = new Date().toISOString();
      const { data: created, error } = await db
        .from("complaints")
        .insert({
          tenant_id: property.tenant_id,
          property_id: property.id,
          ...place,
          student_id: data.student_id,
          category_id: data.category_id,
          // Generated by the database (C-YYMM-NNNN).
          complaint_number: "",
          title: data.title,
          description: data.description,
          priority: data.priority,
          status: data.assigned_to ? "ASSIGNED" : "OPEN",
          assigned_to: data.assigned_to,
          assigned_at: data.assigned_to ? nowIso : null,
          created_at: new Date(data.created_at).toISOString(),
          created_by: userId,
          // Replaced by the category SLA trigger; the chosen value is applied just below.
          sla_due_at: new Date(data.sla_due_at).toISOString(),
        })
        .select("id, complaint_number, status, tenant_id, property_id")
        .single();
      if (error || !created) throw friendly(error, "We couldn't create the complaint.");

      // On insert the database applies the category's default priority (over MEDIUM) and SLA from
      // "now"; apply the Admin's own priority and SLA due, then walk the status forward through
      // the normal transition rules.
      const patch: ComplaintUpdate = {
        priority: data.priority,
        sla_due_at: new Date(data.sla_due_at).toISOString(),
      };
      if ((target === "IN_PROGRESS" || target === "RESOLVED") && created.status !== target) {
        patch.status = target;
      }
      if (target === "RESOLVED") {
        patch.resolution_summary = summary;
        patch.resolved_by = userId;
      }
      let warning: string | null = null;
      let finalStatus = created.status;
      const { data: updated, error: updErr } = await db
        .from("complaints")
        .update(patch)
        .eq("id", created.id)
        .select("status")
        .single();
      if (updErr) {
        warning = `The complaint was created, but its ${
          patch.status ? "status, " : ""
        }priority and SLA due could not be applied: ${friendly(updErr, "unknown error").message}`;
      } else if (updated) {
        finalStatus = updated.status;
      }
      // Only when the database's auto-assign picked the warden — never for one the Admin chose
      // (a chosen warden always makes the new complaint Assigned).
      if (!warning && !data.assigned_to && target === "OPEN" && finalStatus === "ASSIGNED") {
        warning = "The property's warden was assigned automatically.";
      }

      await writeAudit({
        tenant_id: created.tenant_id,
        property_id: created.property_id,
        actor_user_id: userId,
        action: "COMPLAINT_CREATED_BY_ADMIN",
        entity_id: created.id,
        before_data: null,
        after_data: {
          complaint_number: created.complaint_number,
          student_id: data.student_id,
          room_id: place.room_id,
          bed_id: place.bed_id,
          category_id: data.category_id,
          priority: data.priority,
          status: finalStatus,
          assigned_to: data.assigned_to,
          created_at: data.created_at,
          sla_due_at: data.sla_due_at,
        },
      });
      return {
        id: created.id,
        complaint_number: created.complaint_number,
        status: finalStatus,
        warning,
      };
    }

    // ---- update ----
    const { data: existing, error: loadErr } = await db
      .from("complaints")
      .select("*")
      .eq("id", data.complaint_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (loadErr) throw friendly(loadErr, "We couldn't load the complaint. Please try again.");
    if (!existing) throw new Error("This complaint could not be found.");
    await assertTenantAdmin(db, userId, existing.tenant_id);

    const patch: ComplaintUpdate = {};
    const before: Partial<ComplaintRow> = {};
    const set = <K extends keyof ComplaintUpdate & keyof ComplaintRow>(
      key: K,
      value: ComplaintUpdate[K],
    ) => {
      patch[key] = value;
      before[key] = existing[key];
    };

    if (data.student_id !== undefined && data.student_id !== existing.student_id) {
      if (existing.is_anonymous) {
        throw new Error("This complaint was raised anonymously, so its student can't be changed.");
      }
      await assertStudentInProperty(db, data.student_id, existing.property_id);
      set("student_id", data.student_id);
    }

    let blockId = existing.block_id;
    if (data.room_id !== undefined || data.bed_id !== undefined) {
      const roomId = data.room_id !== undefined ? data.room_id : existing.room_id;
      const bedId = data.bed_id !== undefined ? data.bed_id : existing.bed_id;
      if (roomId !== existing.room_id || bedId !== existing.bed_id) {
        const place = await resolvePlace(db, existing.property_id, roomId, bedId);
        set("room_id", place.room_id);
        set("bed_id", place.bed_id);
        if (place.block_id !== existing.block_id) set("block_id", place.block_id);
        blockId = place.block_id;
      }
    }

    if (data.title !== undefined && data.title !== existing.title) set("title", data.title);
    if (data.description !== undefined && data.description !== existing.description) {
      set("description", data.description);
    }
    if (data.category_id !== undefined && data.category_id !== existing.category_id) {
      await assertCategory(db, data.category_id, existing.property_id);
      set("category_id", data.category_id);
    }
    if (data.priority !== undefined && data.priority !== existing.priority) {
      set("priority", data.priority);
    }

    const assignee = data.assigned_to !== undefined ? data.assigned_to : existing.assigned_to;
    if (data.assigned_to !== undefined && data.assigned_to !== existing.assigned_to) {
      if (data.assigned_to) {
        await assertWarden(db, existing.tenant_id, existing.property_id, blockId, data.assigned_to);
      }
      set("assigned_to", data.assigned_to);
      set("assigned_at", data.assigned_to ? new Date().toISOString() : null);
    } else if (assignee && blockId !== existing.block_id) {
      // The room moved to another block: the current warden must still cover it.
      await assertWarden(db, existing.tenant_id, existing.property_id, blockId, assignee);
    }

    let targetStatus = (data.status ?? existing.status) as ComplaintStatus;
    // Assigning a warden to an open complaint moves it to Assigned (same as the Assign action).
    if (
      data.status === undefined &&
      data.assigned_to &&
      data.assigned_to !== existing.assigned_to &&
      OPEN_LIKE.includes(existing.status)
    ) {
      targetStatus = "ASSIGNED";
    }
    if (targetStatus !== existing.status) {
      assertTransition(existing.status, targetStatus);
      set("status", targetStatus);
    }
    if (targetStatus === "ASSIGNED" && !assignee) {
      throw new Error("An assigned complaint needs a warden.");
    }
    if (targetStatus === "RESOLVED") {
      const entering = existing.status !== "RESOLVED";
      const summaryChanged =
        data.resolution_summary !== undefined &&
        (data.resolution_summary ?? "") !== (existing.resolution_summary ?? "");
      if (entering || summaryChanged) {
        set("resolution_summary", requireSummary(data.resolution_summary));
      }
      if (entering) set("resolved_by", userId);
    }

    const createdAt =
      data.created_at !== undefined ? new Date(data.created_at).toISOString() : existing.created_at;
    const slaDue =
      data.sla_due_at !== undefined ? new Date(data.sla_due_at).toISOString() : existing.sla_due_at;
    if (toMs(createdAt) !== toMs(existing.created_at)) {
      if (toMs(createdAt) > Date.now() + 5 * 60_000) {
        throw new Error("The raised time can't be in the future.");
      }
      set("created_at", createdAt);
    }
    if (toMs(slaDue) !== toMs(existing.sla_due_at)) {
      set("sla_due_at", slaDue);
      // A due time moved into the future is no longer breached; the SLA scan marks it again if
      // the new time passes.
      if (toMs(slaDue) > Date.now() && existing.sla_breached_at) set("sla_breached_at", null);
    }
    if (toMs(slaDue) <= toMs(createdAt)) {
      throw new Error("The SLA due time must be after the raised time.");
    }

    if (Object.keys(patch).length === 0) {
      return {
        id: existing.id,
        complaint_number: existing.complaint_number,
        status: existing.status,
        warning: null,
      };
    }

    const { data: updated, error: updErr } = await db
      .from("complaints")
      .update(patch)
      .eq("id", existing.id)
      .select("id, complaint_number, status")
      .single();
    if (updErr || !updated) throw friendly(updErr, "We couldn't save the complaint.");

    await writeAudit({
      tenant_id: existing.tenant_id,
      property_id: existing.property_id,
      actor_user_id: userId,
      action: "COMPLAINT_UPDATED_BY_ADMIN",
      entity_id: existing.id,
      before_data: before as Json,
      after_data: patch as Json,
      metadata: { complaint_number: existing.complaint_number },
    });
    return { ...updated, warning: null };
  });

export const createComplaintCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => complaintCategoryCreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const db: Db = context.supabase;
    const property = await loadPropertyAsAdmin(db, context.userId, data.property_id);

    const { data: last } = await db
      .from("complaint_categories")
      .select("display_order")
      .eq("property_id", property.id)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: created, error } = await db
      .from("complaint_categories")
      .insert({
        tenant_id: property.tenant_id,
        property_id: property.id,
        name: data.name,
        sla_minutes: Math.max(1, Math.round(data.sla_hours * 60)),
        default_priority: data.default_priority,
        display_order: (last?.display_order ?? 0) + 10,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error || !created) {
      if (error?.code === "23505") {
        throw new Error(
          "This property already has a category with that name (it may be switched off).",
        );
      }
      throw friendly(error, "We couldn't create the category.");
    }

    await writeAudit({
      tenant_id: property.tenant_id,
      property_id: property.id,
      actor_user_id: context.userId,
      action: "COMPLAINT_CATEGORY_CREATED",
      entity_type: "complaint_categories",
      entity_id: created.id,
      before_data: null,
      after_data: {
        name: created.name,
        sla_minutes: created.sla_minutes,
        default_priority: created.default_priority,
      },
    });
    return created;
  });
