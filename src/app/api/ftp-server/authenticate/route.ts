import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import { ADMIN_EMAIL } from "@/lib/admin";

export const runtime = "nodejs";

// Called by the separate FTP server (photographer-flow-ftp, deployed on Fly.io) on every login
// attempt from a camera/tethering client — never by a browser or the desktop app. Authenticated
// with a static shared secret (FTP_SERVER_SECRET) rather than a user session or bearer token: the
// FTP server has no Supabase session of its own, and this route's whole job is deciding whether
// ITS caller (the camera, via FTP username/password) is allowed in — a second, different identity
// than "is the FTP server itself trusted," which the shared secret establishes.
export async function POST(request: Request) {
  const secret = request.headers.get("x-ftp-server-secret");
  if (!secret || secret !== process.env.FTP_SERVER_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { username, password }: { username?: string; password?: string } = await request.json().catch(() => ({}));
  if (!username || !password) {
    return NextResponse.json({ error: "credentials required" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data: gallery } = await supabase
    .from("galleries")
    .select("id, photographer_id, ftp_password, archived_at")
    .eq("ftp_username", username)
    .maybeSingle<{ id: string; photographer_id: string; ftp_password: string | null; archived_at: string | null }>();

  if (!gallery || gallery.ftp_password !== password || gallery.archived_at) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  // Re-checked on every real connection attempt, not just when credentials are first generated —
  // a photographer who downgrades off פרו+ loses FTP Live access immediately, not just for
  // future credential requests. The admin account keeps access regardless of its own plan.
  const { data: photographer } = await supabase
    .from("photographers")
    .select("plan, email")
    .eq("id", gallery.photographer_id)
    .maybeSingle<{ plan: SubscriptionPlan; email: string }>();
  const isFramePlus = photographer && SUBSCRIPTION_PLANS[photographer.plan].tier === "studio_pro";
  const isAdmin = photographer?.email === ADMIN_EMAIL;
  if (!isFramePlus && !isAdmin) {
    return NextResponse.json({ error: "FTP Live is only available on the פרו+ plan" }, { status: 403 });
  }

  return NextResponse.json({ galleryId: gallery.id, photographerId: gallery.photographer_id });
}
