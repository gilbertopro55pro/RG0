import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-only: bypasses RLS. Never import this from client components.
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
