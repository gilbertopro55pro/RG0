import { NextResponse } from "next/server";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";

// Accepts EITHER the normal cookie session (browser use) OR a bearer token (the desktop app,
// which has no cookie jar shared with this site) — either way the caller gets back just the
// authenticated user id and does its own explicit ownership check against a service-role client,
// rather than relying on RLS (which only applies to the cookie path's own request-scoped client).
export async function authenticateGalleryRequest(request: Request): Promise<{ userId: string } | { error: NextResponse }> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const supabase = createAnonClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) {
      return { error: NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 }) };
    }
    return { userId: user.id };
  }
  const supabase = await createCookieClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 }) };
  }
  return { userId: user.id };
}
