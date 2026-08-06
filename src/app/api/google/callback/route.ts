import { type NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/google";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = request.cookies.get("google_oauth_state")?.value;

  const redirectTo = new URL("/settings", request.url);

  if (!code || !state || state !== savedState) {
    redirectTo.searchParams.set("google_error", "1");
    const res = NextResponse.redirect(redirectTo);
    res.cookies.delete("google_oauth_state");
    return res;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("not authenticated");

    const updateData: Record<string, unknown> = {
      google_access_token: tokens.access_token,
      google_token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      google_calendar_connected: true,
    };
    if (tokens.refresh_token) updateData.google_refresh_token = tokens.refresh_token;

    const { error } = await supabase.from("photographers").update(updateData).eq("id", user.id);
    if (error) throw error;

    redirectTo.searchParams.set("google_connected", "1");
  } catch {
    redirectTo.searchParams.set("google_error", "1");
  }

  const res = NextResponse.redirect(redirectTo);
  res.cookies.delete("google_oauth_state");
  return res;
}
