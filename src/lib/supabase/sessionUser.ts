import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string | null };

// The signed-in user for a server page, from the session's JWT verified locally (getClaims, against
// the project's cached JWKS), the same check the proxy already made for this request. Pages used to
// call auth.getUser(), a round trip to the Auth server before any of the page's own queries could
// start, on every navigation. Same trade-off the proxy accepted: a banned or deleted user keeps
// access until the JWT expires (up to 1h). Every query still goes through RLS with that JWT.
// cache(): one verification per request, however many server components ask.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});
