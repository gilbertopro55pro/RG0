import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { verifyEmailConfirmToken } from "@/lib/emailConfirmToken";

export const runtime = "nodejs";

// The "כניסה למערכת" link in the login-details email (see ../signup/route.ts) points here
// instead of straight to /login — visiting it (with a valid signature) marks the email confirmed
// via the admin API, the same flag Supabase's own confirmation flow would have set, then sends
// the person on to /login to actually sign in with the password they already chose.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("uid") ?? "";
  const ts = searchParams.get("ts") ?? "";
  const sig = searchParams.get("sig") ?? "";

  const loginUrl = new URL("/login", request.url);

  if (!verifyEmailConfirmToken(uid, ts, sig)) {
    loginUrl.searchParams.set("confirm_error", "1");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.auth.admin.updateUserById(uid, { email_confirm: true });
  if (error) {
    loginUrl.searchParams.set("confirm_error", "1");
    return NextResponse.redirect(loginUrl);
  }

  loginUrl.searchParams.set("confirmed", "1");
  return NextResponse.redirect(loginUrl);
}
