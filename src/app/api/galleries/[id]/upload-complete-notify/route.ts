import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { authenticateGalleryRequest } from "@/lib/desktopAuth";
import { sendEmail } from "@/lib/resend";
import { sendPushToPhotographer } from "@/lib/push";
import { notificationEmailFor } from "@/lib/notificationEmail";
import type { GalleryRow, Photographer } from "@/lib/types";
import { photographerLang } from "@/lib/clientLang";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

export const runtime = "nodejs";

// Fired by the upload engine (lib/galleryUploads.ts) when an upload ends and the photographer wasn't
// watching: it went to the background ("המשך ברקע"), they left the gallery page, or the app was
// hidden. One who stayed and watched it finish already sees it on screen. Sends an email and, since
// 2026-10-09 (owner's request, with background uploads), a phone notification.
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
      .select("email, ui_lang")
      .eq("id", gallery.photographer_id)
      .maybeSingle<Pick<Photographer, "email" | "ui_lang">>();
    if (!photographer) return NextResponse.json({ ok: true });

    const origin = new URL(request.url).origin;
    const galleryUrl = `${origin}/galleries/${gallery.id}`;
    // In the photographer's own language (photographers.ui_lang); Hebrew when unset.
    const t = makeT(messagesFor(photographerLang(photographer.ui_lang)));
    const done =
      succeededCount != null && totalCount != null
        ? t("העלאת התמונות לגלריה \"{title}\" הסתיימה, {ok} מתוך {total} תמונות הועלו בהצלחה.", { title: gallery.title, ok: succeededCount, total: totalCount })
        : t("העלאת התמונות לגלריה \"{title}\" הסתיימה.", { title: gallery.title });
    await Promise.all([
      photographer.email
        ? sendEmail({
            to: notificationEmailFor(photographer.email),
            subject: t("העלאת התמונות ל\"{title}\" הסתיימה", { title: gallery.title }),
            text: `${t("שלום,")}\n\n${done}\n\n${t("לצפייה בגלריה:")}\n${galleryUrl}`,
          })
        : null,
      sendPushToPhotographer(gallery.photographer_id, {
        title: t("העלאת התמונות ל\"{title}\" הסתיימה", { title: gallery.title }),
        body: done,
        url: `/galleries/${gallery.id}`,
        tag: `upload-${gallery.id}`,
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[upload-complete-notify] failed to send upload-complete email", e);
    return NextResponse.json({ ok: true });
  }
}
