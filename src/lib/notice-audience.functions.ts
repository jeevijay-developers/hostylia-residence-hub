import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_CUSTOM_BLOCKS, MAX_CUSTOM_STUDENTS } from "@/lib/notice-audience.constants";

/**
 * Data for the Notice Composer's "Custom audience" pickers. Every call is permission-checked
 * (can_manage_notices for the property, and the property must belong to the tenant) and returns only
 * eligible students/blocks of that property - the same rules publishNotice enforces again on publish.
 */
const scopeSchema = z.object({
  tenant_id: z.string().uuid(),
  property_id: z.string().uuid(),
});

async function guard(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  tenantId: string,
  propertyId: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const audience = await import("@/lib/notice-audience.server");
  await audience.assertNoticeAudienceAccess(supabase, supabaseAdmin, userId, tenantId, propertyId);
  return { admin: supabaseAdmin, audience };
}

export const listNoticeAudienceBlocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => scopeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, audience } = await guard(
      context.supabase,
      context.userId,
      data.tenant_id,
      data.property_id,
    );
    return audience.listAudienceBlocks(admin, {
      tenantId: data.tenant_id,
      propertyId: data.property_id,
    });
  });

export const searchNoticeAudienceStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => scopeSchema.extend({ q: z.string().max(100).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, audience } = await guard(
      context.supabase,
      context.userId,
      data.tenant_id,
      data.property_id,
    );
    const students = await audience.searchEligibleStudents(admin, {
      tenantId: data.tenant_id,
      propertyId: data.property_id,
      q: data.q,
      limit: 20,
    });
    // Only what the picker shows: no phone / email / profile id leaves the server here.
    return students.map((s) => ({
      id: s.id,
      full_name: s.full_name,
      admission_number: s.admission_number,
      block_id: s.block_id,
      block_name: s.block_name,
    }));
  });

/** Resolves a selection exactly as publishing would: blocks expanded, duplicates removed, counted. */
export const previewNoticeAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    scopeSchema
      .extend({
        student_ids: z.array(z.string().uuid()).max(MAX_CUSTOM_STUDENTS).default([]),
        block_ids: z.array(z.string().uuid()).max(MAX_CUSTOM_BLOCKS).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, audience } = await guard(
      context.supabase,
      context.userId,
      data.tenant_id,
      data.property_id,
    );
    const r = await audience.resolveCustomAudience(admin, {
      tenantId: data.tenant_id,
      propertyId: data.property_id,
      studentIds: data.student_ids,
      blockIds: data.block_ids,
    });
    return {
      count: r.students.length,
      individual: r.individual,
      from_blocks: r.fromBlocks,
      duplicates: r.duplicates,
    };
  });
