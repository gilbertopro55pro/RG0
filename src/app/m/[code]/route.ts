import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { magnetGuestShareToken, magnetGuestState } from "@/lib/magnetGuest";
import { shortClientUrl } from "@/lib/shortLinks";

// A magnet's guest QR (lib/magnetQr.ts): myframeflow.com/m/<code> → the event's gallery for guests,
// as a read-only, web-quality share link (lib/magnetGuest.ts decides). Anything else (no gallery
// yet, an archived one, a link that isn't on) → the small page at ./info. A route, not a page, so
// a scan gets a plain 307 to the gallery, without the app's loading screen first.

const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const origin = new URL(request.url).origin;
  const db = createServiceRoleClient();
  const state = await magnetGuestState(db, code);
  if (state.kind === "gallery") {
    const token = await magnetGuestShareToken(db, state.galleryId);
    if (token) return NextResponse.redirect(shortClientUrl(origin, "gallery", token), { status: 307, headers: NO_STORE });
    return new NextResponse("נסו שוב בעוד רגע · Please try again in a moment", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", ...NO_STORE } });
  }
  return NextResponse.redirect(new URL(`/m/${encodeURIComponent(code)}/info`, origin), { status: 307, headers: NO_STORE });
}
