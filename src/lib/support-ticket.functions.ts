import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertSuper } from "@/lib/super-admin.functions";
import {
  createSupportTicketSchema,
  addSupportTicketMessageSchema,
  supportTicketPrioritySchema,
  supportTicketStatusSchema,
} from "@/schemas/support-ticket";

// -------- Hostel Admin --------

/**
 * Creates a Support ticket for the caller's own tenant. Deliberately
 * separate from `complaints` (student/operational) — this is the tenant
 * raising a platform issue with Hostylia itself. Gated by the
 * `support_tickets_insert_admin` RLS policy (HOSTEL_ADMIN of that tenant,
 * created_by = self) — no service-role writes involved.
 */
export const createSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => createSupportTicketSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("support_tickets")
      .insert({
        tenant_id: data.tenant_id,
        created_by: userId,
        subject: data.subject,
        category: data.category,
        priority: data.priority,
        description: data.description,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

/**
 * Hostel Admin's only permitted status transition — RESOLVED -> CLOSED — via
 * `fn_close_own_support_ticket` (SECURITY DEFINER), not a direct table
 * write; every other field mutation is Super-Admin-only.
 */
export const closeSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { ticket_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: out, error } = await supabase.rpc("fn_close_own_support_ticket", {
      p_ticket_id: data.ticket_id,
    });
    if (error) throw new Error(error.message);
    return out as { id: string; status: string; closed_at: string };
  });

/**
 * Adds a reply. Shared by both Hostel Admin (own tenant, never internal) and
 * Super Admin (any ticket, may be an internal note) — the
 * `support_ticket_messages_insert_scoped` RLS policy enforces both
 * constraints already, so one function serves both roles.
 */
export const addSupportTicketMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => addSupportTicketMessageSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ticket, error: tErr } = await supabase
      .from("support_tickets")
      .select("tenant_id")
      .eq("id", data.ticket_id)
      .single();
    if (tErr) throw tErr;
    const { data: row, error } = await supabase
      .from("support_ticket_messages")
      .insert({
        ticket_id: data.ticket_id,
        tenant_id: ticket.tenant_id,
        author_id: userId,
        is_internal_note: data.is_internal_note,
        message: data.message,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

// -------- Super Admin --------

/**
 * Platform-wide ticket list with tenant/raised-by/assignee names resolved.
 * `support_tickets_select_scoped` RLS already lets Super Admin read every
 * ticket directly, but `profiles` is self-access-only RLS (no
 * Super-Admin-inclusive policy exists), so names still need the same
 * service-role lookup pattern `getTenantHostelAdmins` already established.
 */
export const listSupportTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);
    const { data: tickets, error } = await supabase
      .from("support_tickets")
      .select("*, tenants(display_name)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userIds = Array.from(
      new Set(
        (tickets ?? []).flatMap((t) =>
          [t.created_by, t.assigned_to, t.resolved_by].filter((v): v is string => !!v),
        ),
      ),
    );
    const { data: profiles } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id,full_name,email").in("id", userIds)
      : { data: [] as { id: string; full_name: string; email: string | null }[] };
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));

    return (tickets ?? []).map((t) => ({
      ...t,
      created_by_profile: pmap.get(t.created_by) ?? null,
      assigned_to_profile: t.assigned_to ? (pmap.get(t.assigned_to) ?? null) : null,
      resolved_by_profile: t.resolved_by ? (pmap.get(t.resolved_by) ?? null) : null,
    }));
  });

/** Single ticket + its message thread, author names resolved (see above). */
export const getSupportTicketDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { ticket_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);

    const { data: ticket, error: tErr } = await supabase
      .from("support_tickets")
      .select("*, tenants(display_name)")
      .eq("id", data.ticket_id)
      .single();
    if (tErr) throw tErr;

    const { data: messages, error: mErr } = await supabase
      .from("support_ticket_messages")
      .select("*")
      .eq("ticket_id", data.ticket_id)
      .order("created_at", { ascending: true });
    if (mErr) throw mErr;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userIds = Array.from(
      new Set(
        [
          ticket.created_by,
          ticket.assigned_to,
          ticket.resolved_by,
          ...(messages ?? []).map((m) => m.author_id),
        ].filter((v): v is string => !!v),
      ),
    );
    const { data: profiles } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id,full_name,email").in("id", userIds)
      : { data: [] as { id: string; full_name: string; email: string | null }[] };
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));

    return {
      ticket: {
        ...ticket,
        created_by_profile: pmap.get(ticket.created_by) ?? null,
        assigned_to_profile: ticket.assigned_to ? (pmap.get(ticket.assigned_to) ?? null) : null,
        resolved_by_profile: ticket.resolved_by ? (pmap.get(ticket.resolved_by) ?? null) : null,
      },
      messages: (messages ?? []).map((m) => ({
        ...m,
        author_profile: pmap.get(m.author_id) ?? null,
      })),
    };
  });

const updateTicketSchema = z.object({
  ticket_id: z.string().uuid(),
  status: supportTicketStatusSchema.optional(),
  priority: supportTicketPrioritySchema.optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  resolution_note: z.string().trim().max(5000).nullable().optional(),
});

/**
 * Super-Admin-only ticket update — status/priority/assignment/resolution.
 * Gated by the `support_tickets_update_super` RLS policy (is_super_admin
 * only) in addition to the explicit assertSuper check, same pattern as
 * `assignTenantSubscription`. Audit-logged via the existing service-role
 * `audit_logs` insert pattern (no client-writable INSERT policy on that
 * table by design).
 */
export const updateSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => updateTicketSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);

    const patch: {
      status?: string;
      resolved_at?: string;
      resolved_by?: string;
      priority?: string;
      assigned_to?: string | null;
      resolution_note?: string | null;
    } = {};
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === "RESOLVED") {
        patch.resolved_at = new Date().toISOString();
        patch.resolved_by = userId;
      }
    }
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.assigned_to !== undefined) {
      if (data.assigned_to) await assertSuper(supabase, data.assigned_to);
      patch.assigned_to = data.assigned_to;
    }
    if (data.resolution_note !== undefined) patch.resolution_note = data.resolution_note;

    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .update(patch)
      .eq("id", data.ticket_id)
      .select("tenant_id")
      .single();
    if (error) throw error;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: ticket.tenant_id,
      actor_user_id: userId,
      action: "SUPPORT_TICKET_UPDATED_BY_SUPER_ADMIN",
      entity_type: "support_tickets",
      entity_id: data.ticket_id,
      after_data: patch,
    });

    return { ok: true };
  });

/**
 * Links an already-started (existing, unmodified) impersonation session to
 * the ticket that prompted it — the connection the PRD's "Ticket -> Start
 * Impersonation -> ... -> Resolve ticket" flow needs, without touching
 * `startSupportSession`/`endSupportSession` at all.
 */
export const linkSupportSessionToTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { ticket_id: string; support_session_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuper(supabase, userId);
    const { error } = await supabase
      .from("support_tickets")
      .update({ support_session_id: data.support_session_id })
      .eq("id", data.ticket_id);
    if (error) throw error;
    return { ok: true };
  });
