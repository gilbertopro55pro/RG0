import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";
import type { GalleryRow, Photographer } from "@/lib/types";

export const runtime = "nodejs";

// Fired client-side (see uploadResolvedFiles in GalleryManageView.tsx) only when the tab was
// hidden/backgrounded at some point during the upload — a photographer who stayed and watched it
// finish already sees the in-app "upload complete" toast, so a duplicate email would just be noise.
// Best-effort: a failed send here must never surface as an upload failure to the photographer.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: galleryId } = await params;
    const auth = await authenticateGalleryRequest(request);
    if ("error" in auth) return auth.error;
    const supabase = createServiceRoleClient();

    const { data: gallery } = await supabase.from("galleries").select("*").eq("id", galleryId).maybeSingle<GalleryRow>();
    if (!gallery || gallery.photographer_id !== auth.userId) {
      return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
    }

    const { succeededCount, totalCount }: { succeededCount?: number; totalCount?: number } = await request.json().catch(() => ({}));

    const { data: photographer } = await supabase
      .from("photographers")
      .select("email")
      .eq("id", gallery.photographer_id)
      .maybeSingle<Pick<Photographer, "email">>();
    if (!photographer?.email) return NextResponse.json({ ok: true });

    const origin = new URL(request.url).origin;
    const galleryUrl = `${origin}/galleries/${gallery.id}`;
    const countNote = succeededCount != null && totalCount != null ? `, ${succeededCount} מתוך ${totalCount} תמונות הועלו בהצלחה` : "";
    await sendEmail({
      to: notificationEmailFor(photographer.email),
      subject: `העלאת התמונות ל"${gallery.title}" הסתיימה`,
      text: `שלום,\n\nהעלאת התמונות לגלריה "${gallery.title}" הסתיימה${countNote}.\n\nלצפייה בגלריה:\n${galleryUrl}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[upload-complete-notify] failed to send upload-complete email", e);
    return NextResponse.json({ ok: true });
  }
}
