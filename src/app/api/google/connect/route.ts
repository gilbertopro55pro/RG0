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
  // GOOGLE_REDIRECT_URI (and the matching Authorized redirect URI registered with Google) is
  // fixed to the bare apex domain — a cookie set without an explicit `domain` is scoped to
  // whichever host this request happened to arrive on, which silently breaks the whole flow if
  // someone starts it from www.myframeflow.com (the callback lands on the apex domain, where that
  // cookie was never sent). A leading-dot domain cookie is shared across both, so this same
  // request/response pair works no matter which of the two the photographer is currently on.
  const cookieDomain = process.env.NODE_ENV === "production" ? ".myframeflow.com" : undefined;
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });
  if (redirectPath?.startsWith("/")) {
    res.cookies.set("google_oauth_redirect", redirectPath, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/",
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });
  }
  return res;
}
