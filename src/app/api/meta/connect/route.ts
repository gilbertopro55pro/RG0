import { randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { campaignsAllowed } from "@/lib/campaignsAccess";
import { metaAuthUrl, metaConfigured } from "@/lib/metaAds";

// "חיבור חשבון מודעות של מטא" on /leads/campaigns (lib/metaAds.ts): off to Facebook's sign-in, with a
// state cookie the callback checks. Same cookie handling as api/google/connect (apex + www).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !campaignsAllowed(user.email)) return NextResponse.redirect(new URL("/leads", request.url));
  if (!metaConfigured()) return NextResponse.redirect(new URL("/leads/campaigns?meta=not_configured", request.url));

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(metaAuthUrl(state));
  const cookieDomain = process.env.NODE_ENV === "production" ? ".myframeflow.com" : undefined;
  res.cookies.set("meta_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });
  return res;
}
