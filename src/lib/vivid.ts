import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import { isClientFacingPath } from "@/lib/premiumScope";

// Whether the request's account sees the vivid look (lib/tones.ts): admin only for now (owner,
// 2026-10-21, "עדכון אדמין"). Read from the session's JWT, verified locally (getClaims), so it
// costs no round trip. Pages a client sees never get it. To open it to everyone: return true here
// for any signed-in photographer.
export async function vividForRequest(path: string): Promise<boolean> {
  if (isClientFacingPath(path || "/")) return false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    return vividForEmail(typeof data?.claims?.email === "string" ? data.claims.email : null);
  } catch {
    return false;
  }
}

export function vividForEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === ADMIN_EMAIL;
}
