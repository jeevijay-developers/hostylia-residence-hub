import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public, unauthenticated lookup for the admission page.
// Uses service_role internally, but only returns a narrow set of
// public-safe fields and only when the property is ACTIVE.
export const getPublicPropertyBySlug = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("properties")
      .select("id, name, city, state, address_line_1, address_line_2, settings, status")
      .eq("slug", data.slug)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.status !== "ACTIVE") return null;
    const settings = (typeof row.settings === "object" && row.settings !== null
      ? (row.settings as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    return {
      id: row.id,
      name: row.name,
      city: row.city,
      state: row.state,
      address_line_1: row.address_line_1,
      address_line_2: row.address_line_2 ?? null,
      amenities: Array.isArray(settings.amenities) ? (settings.amenities as string[]) : [],
      photos: Array.isArray(settings.photos) ? (settings.photos as string[]) : [],
    };
  });
