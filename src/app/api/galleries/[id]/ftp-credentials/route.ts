import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import { ADMIN_EMAIL } from "@/lib/admin";

export const runtime = "nodejs";

// Short, camera-keypad-typeable codes rather than a UUID — these get typed into a camera's FTP
// menu with a d-pad, not pasted, so length and character set matter a lot for how painful that is.
function generateUsername(): string {
  return `gal-${randomBytes(4).toString("hex")}`;
}
function generatePassword(): string {
  return randomBytes(6).toString("base64url");
}

async function requireOwnedGallery(request: Request, galleryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 }) } as const;

  const { data: gallery } = await supabase
    .from("galleries")
    .select("id, photographer_id, ftp_username, ftp_password")
    .eq("id", galleryId)
    .maybeSingle<{ id: string; photographer_id: string; ftp_username: string | null; ftp_password: string | null }>();
  if (!gallery || gallery.photographer_id !== user.id) {
    return { error: NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 }) } as const;
  }
  return { supabase, gallery } as const;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireOwnedGallery(request, id);
  if ("error" in result) return result.error;
  return NextResponse.json({ username: result.gallery.ftp_username, password: result.gallery.ftp_password });
}

// Generates fresh credentials the first time, or replaces them on demand (e.g. after an event, or
// if a photographer suspects the login was shared/leaked). פרו+ only (plus the admin account
// regardless of its own plan) — this is the authoritative check for *creating* credentials; the
// FTP server's own login route (see /api/ftp-server/authenticate) independently re-checks the
// tier on every actual camera connection, so a downgrade also stops already-issued credentials
// from working, not just new ones from being minted.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireOwnedGallery(request, id);
  if ("error" in result) return result.error;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: photographer } = await supabase
    .from("photographers")
    .select("plan")
    .eq("id", user!.id)
    .maybeSingle<{ plan: SubscriptionPlan }>();
  const isFramePlus = photographer && SUBSCRIPTION_PLANS[photographer.plan].tier === "studio_pro";
  const isAdmin = user?.email === ADMIN_EMAIL;
  if (!isFramePlus && !isAdmin) {
    return NextResponse.json({ error: "FTP Live זמין רק במסלול פרו+" }, { status: 403 });
  }

  const username = generateUsername();
  const password = generatePassword();
  const { error } = await result.supabase.from("galleries").update({ ftp_username: username, ftp_password: password }).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ username, password });
}
