import { randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildGoogleAuthUrl } from "@/lib/google";

// Always lands back on /settings after connecting, except when an optional ?redirect= path (only
// ever a same-origin relative path — never taken from an external Location/Referer, so this
// can't become an open redirect) says otherwise — e.g. the onboarding screen sends people back to
// itself instead of off to Settings mid-flow.
export async function GET(request: NextRequest) {
  const state = randomBytes(16).toString("hex");
  const redirectPath = request.nextUrl.searchParams.get("redirect");
  const res = NextResponse.redirect(buildGoogleAuthUrl(state));
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  if (redirectPath?.startsWith("/")) {
    res.cookies.set("google_oauth_redirect", redirectPath, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/",
    });
  }
  return res;
}
