import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Archive / permanent delete for Admin → Students.
 *
 * Archive is the existing soft-delete (students.deleted_at). Permanent delete
 * only works on an archived student with no protected history. All rules,
 * locking and authorization live in the database functions
 * (fn_archive_student / fn_student_delete_check / fn_permanently_delete_student,
 * migration 20261105090000); these are Zod-validated wrappers. Only the
 * post-commit cleanup of files and the login account needs the service role,
 * and it only runs after the database confirmed the delete.
 */

const studentIdSchema = z.object({ student_id: z.string().uuid() });

type RpcResult = { data: unknown; error: { message: string } | null };

// These functions are not in the generated types until it is regenerated from the
// migrated schema; drop the cast then.
async function callRpc(supabase: object, fn: string, args: Record<string, unknown>) {
  const client = supabase as {
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
  };
  return await client.rpc(fn, args);
}

export interface StudentDeleteCheck {
  full_name: string;
  admission_number: string;
  archived: boolean;
  blockers: { key: string; label: string; count: number }[];
  guardian_links: number;
  documents: number;
  has_login: boolean;
  delete_auth_user: boolean;
}

const checkSchema = z.object({
  full_name: z.string(),
  admission_number: z.string(),
  archived: z.boolean(),
  blockers: z.array(z.object({ key: z.string(), label: z.string(), count: z.number() })),
  guardian_links: z.number(),
  documents: z.number(),
  has_login: z.boolean(),
  delete_auth_user: z.boolean(),
});

const purgeResultSchema = z.object({
  documents: z.array(z.object({ bucket: z.string(), path: z.string() })),
  photo_path: z.string().nullable(),
  profile_id: z.string().uuid().nullable(),
  delete_auth_user: z.boolean(),
});

export const archiveStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => studentIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await callRpc(context.supabase, "fn_archive_student", {
      p_student_id: data.student_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** What a permanent delete would remove / what blocks it — shown before confirming. */
export const getStudentDeleteCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => studentIdSchema.parse(d))
  .handler(async ({ data, context }): Promise<StudentDeleteCheck> => {
    const { data: out, error } = await callRpc(context.supabase, "fn_student_delete_check", {
      p_student_id: data.student_id,
    });
    if (error) throw new Error(error.message);
    return checkSchema.parse(out);
  });

export const permanentlyDeleteStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => studentIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: out, error } = await callRpc(context.supabase, "fn_permanently_delete_student", {
      p_student_id: data.student_id,
    });
    if (error) throw new Error(error.message);
    const result = purgeResultSchema.parse(out);

    // The records are gone. Everything below is best-effort cleanup; a failure is
    // reported as a warning, never rolled back or hidden.
    const warnings: string[] = [];
    const admin = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const byBucket = new Map<string, string[]>();
    for (const d of result.documents) {
      byBucket.set(d.bucket, [...(byBucket.get(d.bucket) ?? []), d.path]);
    }
    if (result.photo_path) {
      byBucket.set("avatars", [...(byBucket.get("avatars") ?? []), result.photo_path]);
    }
    for (const [bucket, paths] of byBucket) {
      const { error: rmErr } = await admin.storage.from(bucket).remove(paths);
      if (rmErr)
        warnings.push(`Could not remove ${paths.length} file(s) from ${bucket}: ${rmErr.message}`);
    }

    let loginRemoved = false;
    if (result.delete_auth_user && result.profile_id) {
      const { error: authErr } = await admin.auth.admin.deleteUser(result.profile_id);
      if (authErr) warnings.push(`Student login could not be removed: ${authErr.message}`);
      else loginRemoved = true;
    }

    return { ok: true as const, loginRemoved, warnings };
  });
