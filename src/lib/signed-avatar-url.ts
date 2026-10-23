import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/** Signed avatar URLs last about an hour. Refresh a little before they expire. */
const AVATAR_SIGNED_URL_SECONDS = 60 * 60;
const AVATAR_SIGNED_URL_STALE_MS = 50 * 60 * 1000;

/**
 * Signed URL for an object in the private `avatars` bucket, requested with the
 * logged-in Supabase client so the user JWT is sent. `getPublicUrl` does not.
 * Returns undefined when there is no path or signing fails — callers render initials.
 */
export function useSignedAvatarUrl(path: string | null | undefined): string | undefined {
  const storagePath = path && path.trim() ? path : null;

  const query = useQuery({
    queryKey: ["avatar-signed-url", storagePath],
    // The browser client holds the session. A server render has no user JWT, and
    // a cached failure would keep initials up for the whole stale window.
    enabled: storagePath !== null && typeof window !== "undefined",
    staleTime: AVATAR_SIGNED_URL_STALE_MS,
    gcTime: AVATAR_SIGNED_URL_SECONDS * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!storagePath) return null;
      const { data, error } = await supabase.storage
        .from("avatars")
        .createSignedUrl(storagePath, AVATAR_SIGNED_URL_SECONDS);
      if (error || !data?.signedUrl) return null;
      return data.signedUrl;
    },
  });

  return query.data || undefined;
}
