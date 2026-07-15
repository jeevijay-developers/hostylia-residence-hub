import { supabase } from "@/integrations/supabase/client";

/** Sign the current user out and clear the session. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
