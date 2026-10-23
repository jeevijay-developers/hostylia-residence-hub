import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * The `avatars` storage bucket is private (RLS-gated via
 * `can_read_profile_avatar` — a parent can read their linked student's
 * photo, staff can read students in their scope, everyone can read their
 * own, etc.). `getPublicUrl()` only ever works for a genuinely public
 * bucket; against a private one it still returns a URL, but that URL 404s
 * for every viewer — which is why every avatar across every role rendered
 * as a broken image. A signed URL (gated by the same RLS, generated for the
 * actual signed-in user) is the correct replacement — the same pattern this
 * app already uses for the private `receipts` bucket
 * (PaymentHistoryPanel.tsx's useReceiptDownload).
 */
const AVATAR_BUCKET = "avatars";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Signed URL for a single avatar/profile photo — profile pages, the Topbar
 * header avatar, a single complaint card's student photo. Returns
 * `undefined` while loading or when `path` is empty/the object is
 * inaccessible/missing, so callers can feed it straight into the existing
 * `AvatarImage`/`<img>` fallback logic unchanged.
 */
export function useAvatarUrl(path: string | null | undefined): string | undefined {
  const { data } = useQuery({
    queryKey: ["avatar-signed-url", path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(path!, SIGNED_URL_TTL_SECONDS);
      if (error) return null;
      return data?.signedUrl ?? null;
    },
  });
  return data ?? undefined;
}

/**
 * Batch signed URLs for a list of avatar paths — attendance rosters and
 * other lists that render many students' photos at once. One request for
 * the whole list instead of one per row. Returns a lookup you can index
 * with the same path you passed in; a path that failed to sign (or wasn't
 * requested) is simply absent, same `undefined` contract as the single-URL
 * hook above.
 */
export function useAvatarUrls(
  paths: (string | null | undefined)[],
): Record<string, string | undefined> {
  const unique = Array.from(new Set(paths.filter((p): p is string => !!p))).sort();
  const { data } = useQuery({
    queryKey: ["avatar-signed-urls", unique],
    enabled: unique.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
      const map: Record<string, string | undefined> = {};
      if (error || !data) return map;
      for (const row of data) {
        if (row.path && !row.error) map[row.path] = row.signedUrl ?? undefined;
      }
      return map;
    },
  });
  return data ?? {};
}
