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
// watching: it went to the background ("המשך ברקע"), they left its screen, or the app was hidden.
// One who stayed and watched it finish already sees it on screen. Sends an email and, since
// 2026-10-09 (owner's request, with background uploads), a phone notification. For a gallery's
// photos, its videos (kind "videos"), or photos straight to the portfolio (kind "portfolio", whose
// hidden gallery is this id).
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

    const { kind, succeededCount, totalCount }: { kind?: string; succeededCount?: number; totalCount?: number } = await request.json().catch(() => ({}));

    const { data: photographer } = await supabase
      .from("photographers")
      .select("email, ui_lang")
      .eq("id", gallery.photographer_id)
      .maybeSingle<Pick<Photographer, "email" | "ui_lang">>();
    if (!photographer) return NextResponse.json({ ok: true });

    const origin = new URL(request.url).origin;
    // In the photographer's own language (photographers.ui_lang); Hebrew when unset.
    const t = makeT(messagesFor(photographerLang(photographer.ui_lang)));
    const counted = succeededCount != null && totalCount != null;
    const vars = { title: gallery.title, ok: succeededCount ?? 0, total: totalCount ?? 0 };
    const message =
      kind === "portfolio"
        ? {
            path: "/settings?tab=portfolio",
            subject: t("העלאת התמונות לפורטפוליו הסתיימה"),
            done: counted ? t("העלאת התמונות לפורטפוליו הסתיימה, {ok} מתוך {total} תמונות הועלו בהצלחה.", vars) : t("העלאת התמונות לפורטפוליו הסתיימה."),
            link: t("לצפייה בפורטפוליו:"),
          }
        : kind === "videos"
          ? {
              path: `/galleries/${gallery.id}`,
              subject: t("העלאת הסרטונים ל\"{title}\" הסתיימה", vars),
              done: counted
                ? t("העלאת הסרטונים לגלריה \"{title}\" הסתיימה, {ok} מתוך {total} סרטונים הועלו בהצלחה.", vars)
                : t("העלאת הסרטונים לגלריה \"{title}\" הסתיימה.", vars),
              link: t("לצפייה בגלריה:"),
            }
          : {
              path: `/galleries/${gallery.id}`,
              subject: t("העלאת התמונות ל\"{title}\" הסתיימה", vars),
              done: counted
                ? t("העלאת התמונות לגלריה \"{title}\" הסתיימה, {ok} מתוך {total} תמונות הועלו בהצלחה.", vars)
                : t("העלאת התמונות לגלריה \"{title}\" הסתיימה.", vars),
              link: t("לצפייה בגלריה:"),
            };
    await Promise.all([
      photographer.email
        ? sendEmail({
            to: notificationEmailFor(photographer.email),
            subject: message.subject,
            text: `${t("שלום,")}\n\n${message.done}\n\n${message.link}\n${origin}${message.path}`,
          })
        : null,
      sendPushToPhotographer(gallery.photographer_id, {
        title: message.subject,
        body: message.done,
        url: message.path,
        tag: `upload-${kind === "videos" ? "videos-" : ""}${gallery.id}`,
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[upload-complete-notify] failed to send upload-complete email", e);
    return NextResponse.json({ ok: true });
  }
}
