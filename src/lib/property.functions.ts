import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { propertyCreateSchema } from "@/schemas/hostel";

/** Same rule as the slug column has always used: lowercase letters, digits and dashes. */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 7);
}

function isUniqueViolation(e: unknown) {
  return !!e && typeof e === "object" && "code" in e && (e as { code?: unknown }).code === "23505";
}

/**
 * Add a property. The admin never types a slug: it is generated here from the
 * name (then name + city, then a number) and checked against EVERY tenant's
 * properties with the service role, because the public admission page
 * (/apply/$slug, getPublicPropertyBySlug) looks properties up by slug alone —
 * a slug that is only unique within one tenant would make that link
 * ambiguous. Deleted properties count too, so an old shared link never starts
 * pointing at a different hostel.
 *
 * The row itself is inserted with the caller's own client, so the properties
 * RLS policies still decide whether this user may create it.
 */
export const createProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => propertyCreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_tenant_role", {
      _user_id: userId,
      _tenant_id: data.tenant_id,
      _role: "HOSTEL_ADMIN",
    });
    if (roleErr) throw new Error("We couldn't confirm your access. Please try again.");
    if (!isAdmin) throw new Error("Only a Hostel Admin can add properties.");

    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id")
      .eq("tenant_id", data.tenant_id)
      .limit(1)
      .maybeSingle();
    if (orgErr) throw new Error("We couldn't load your organization details. Please try again.");
    if (!org) {
      throw new Error(
        "Your organization details are missing. Add them in Settings → Organization, then try again.",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const base = slugify(data.name) || "property";
    const citySlug = slugify(data.city);
    const candidates = Array.from(
      new Set([
        base,
        ...(citySlug && !base.endsWith(citySlug) ? [`${base}-${citySlug}`] : []),
        ...Array.from({ length: 18 }, (_, i) => `${base}-${i + 2}`),
      ]),
    );
    const { data: taken, error: takenErr } = await supabaseAdmin
      .from("properties")
      .select("slug")
      .in("slug", candidates);
    if (takenErr) throw new Error("We couldn't prepare the property link. Please try again.");
    const used = new Set((taken ?? []).map((r) => String(r.slug).toLowerCase()));
    let slug = candidates.find((c) => !used.has(c)) ?? `${base}-${randomSuffix()}`;

    const row = {
      tenant_id: data.tenant_id,
      organization_id: org.id,
      name: data.name,
      property_type: data.property_type,
      gender_policy: data.gender_policy,
      address_line_1: data.address_line_1,
      address_line_2: data.address_line_2 || null,
      landmark: data.landmark || null,
      city: data.city,
      state: data.state,
      postal_code: data.postal_code.toUpperCase(),
      country_code: data.country_code,
      timezone: data.timezone,
      phone: data.phone || null,
      email: data.email || null,
      // Everything Setup used to ask for is collected up front, so the property is ready to use.
      status: "ACTIVE",
    };

    // A slug can still be taken between the check and the insert (two admins at once):
    // retry with a random suffix rather than surfacing a database error.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: created, error } = await supabase
        .from("properties")
        .insert({ ...row, slug })
        .select("id, slug")
        .single();
      if (!error && created) {
        await supabaseAdmin.from("audit_logs").insert({
          tenant_id: data.tenant_id,
          property_id: created.id,
          actor_user_id: userId,
          action: "PROPERTY_CREATED",
          entity_type: "properties",
          entity_id: created.id,
          after_data: { ...row, slug: created.slug },
        });
        return { id: created.id as string, slug: String(created.slug) };
      }
      if (!isUniqueViolation(error)) {
        const message = error?.message?.toLowerCase() ?? "";
        if (message.includes("row-level security") || error?.code === "42501") {
          throw new Error("You don't have permission to add properties for this organization.");
        }
        throw new Error("We couldn't create the property. Please check the details and try again.");
      }
      slug = `${base}-${randomSuffix()}`;
    }
    throw new Error("We couldn't create a unique link for this property. Please try again.");
  });

type Db = SupabaseClient<Database>;

/** Loads a live property through the caller's RLS and checks they are its tenant's Hostel Admin. */
async function loadOwnedProperty(supabase: Db, userId: string, propertyId: string) {
  const { data: property, error } = await supabase
    .from("properties")
    .select("id, tenant_id, name, status")
    .eq("id", propertyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error("We couldn't load this property. Please try again.");
  if (!property) {
    throw new Error("We couldn't find this property. It may already have been removed.");
  }
  const { data: isAdmin, error: roleErr } = await supabase.rpc("has_tenant_role", {
    _user_id: userId,
    _tenant_id: property.tenant_id,
    _role: "HOSTEL_ADMIN",
  });
  if (roleErr) throw new Error("We couldn't confirm your access. Please try again.");
  if (!isAdmin) throw new Error("Only a Hostel Admin can change this property.");
  return property;
}

const propertyIdField = z
  .string()
  .uuid("This property could not be identified. Please refresh and try again.");

/**
 * Active ↔ Inactive from the property menu. An inactive property stays fully
 * visible to staff but its public admission page stops accepting
 * applications (getPublicPropertyBySlug only serves ACTIVE). SUSPENDED is set
 * by Hostylia (Super Admin) and can't be lifted from here.
 */
export const setPropertyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        property_id: propertyIdField,
        status: z.enum(["ACTIVE", "INACTIVE"], {
          errorMap: () => ({ message: "Choose Active or Inactive" }),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const property = await loadOwnedProperty(supabase, userId, data.property_id);
    const current = String(property.status).toUpperCase();
    if (current === "SUSPENDED") {
      throw new Error(
        "This property is suspended by Hostylia support, so its status can't be changed here. Please contact support.",
      );
    }
    if (current === data.status) return { status: data.status };

    const { error } = await supabase
      .from("properties")
      .update({ status: data.status })
      .eq("id", property.id);
    if (error) throw new Error("We couldn't change the status. Please try again.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: property.tenant_id,
      property_id: property.id,
      actor_user_id: userId,
      action: "PROPERTY_STATUS_CHANGED",
      entity_type: "properties",
      entity_id: property.id,
      before_data: { status: current },
      after_data: { status: data.status },
    });
    return { status: data.status };
  });

/**
 * Removes a property from the admin's lists (soft delete: deleted_at is set,
 * nothing else is erased, so finance history and audit trails stay intact
 * and its slug is never handed to another property). Refused while anyone
 * still lives there — residents must be moved out first. The admin must type
 * the property name to confirm.
 */
export const deleteProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        property_id: propertyIdField,
        confirm_name: z.string().trim().min(1, "Type the property name to confirm"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const property = await loadOwnedProperty(supabase, userId, data.property_id);
    if (data.confirm_name.toLowerCase() !== property.name.trim().toLowerCase()) {
      throw new Error("The name you typed doesn't match this property's name.");
    }

    const [residents, stays] = await Promise.all([
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("property_id", property.id)
        .is("deleted_at", null)
        .in("status", ["ACTIVE", "NOTICE_GIVEN"]),
      supabase
        .from("allocations")
        .select("id", { count: "exact", head: true })
        .eq("property_id", property.id)
        .is("deleted_at", null)
        // Pending stays hold a bed for an incoming resident, so they block too.
        .in("status", [
          "PENDING_AGREEMENT",
          "PENDING_PAYMENT",
          "ACTIVE",
          "NOTICE_GIVEN",
          "MOVE_OUT_INSPECTION",
        ]),
    ]);
    if (residents.error || stays.error) {
      throw new Error("We couldn't check this property's residents. Please try again.");
    }
    const living = Math.max(residents.count ?? 0, stays.count ?? 0);
    if (living > 0) {
      throw new Error(
        `This property still has ${living} resident${living === 1 ? "" : "s"} or pending bed allocation${living === 1 ? "" : "s"}. Move residents out and cancel pending allocations before deleting it.`,
      );
    }

    const { error } = await supabase
      .from("properties")
      .update({ deleted_at: new Date().toISOString(), status: "INACTIVE" })
      .eq("id", property.id);
    if (error) throw new Error("We couldn't delete the property. Please try again.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: property.tenant_id,
      property_id: property.id,
      actor_user_id: userId,
      action: "PROPERTY_DELETED",
      entity_type: "properties",
      entity_id: property.id,
      before_data: { name: property.name, status: property.status },
      after_data: { deleted: true },
    });
    return { ok: true };
  });
