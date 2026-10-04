import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";
import type { EventRow, GalleryRow, Photographer } from "@/lib/types";
import { photographerLang } from "@/lib/clientLang";
import { dateLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceRoleClient();

  const { data: gallery } = await supabase
    .from("galleries")
    .select("*")
    .eq("access_token", token)
    .eq("published", true)
    .is("archived_at", null)
    .maybeSingle<GalleryRow>();

  if (!gallery) {
    return NextResponse.json({ error: "הגלריה לא נמצאה" }, { status: 404 });
  }

  if (gallery.selection_confirmed_at) {
    return NextResponse.json({ ok: true, alreadyConfirmed: true });
  }

  const { count } = await supabase
    .from("gallery_photos")
    .select("id", { count: "exact", head: true })
    .eq("gallery_id", gallery.id)
    .eq("is_favorite", true);

  // Confirming an empty selection used to go through and email the photographer "0 photos
  // selected" — never a real selection, so refuse it (the client dialog blocks it too).
  if (!count) {
    return NextResponse.json({ error: "יש לסמן לפחות תמונה אחת לפני שליחת הבחירה" }, { status: 400 });
  }

  const now = new Date().toISOString();
  await supabase.from("galleries").update({ selection_confirmed_at: now }).eq("id", gallery.id);

  // Standalone galleries (no event) have no event_stages row or event_notifications feed to
  // update — the stage/notification side only applies when a real event owns this gallery.
  let clientLabel = gallery.title;
  // The date's raw value; formatted below in the photographer's language for their email.
  let dateValue: string | null = gallery.shoot_date ?? null;
  if (gallery.event_id) {
    await supabase
      .from("event_stages")
      .update({ done: true, done_at: now })
      .eq("event_id", gallery.event_id)
      .eq("stage_key", "client_photo_selection");

    const { data: event } = await supabase
      .from("events")
      .select("client_name, event_date")
      .eq("id", gallery.event_id)
      .maybeSingle<Pick<EventRow, "client_name" | "event_date">>();

    clientLabel = event?.client_name ?? clientLabel;
    dateValue = event?.event_date ?? dateValue;

    await supabase.from("event_notifications").insert({
      event_id: gallery.event_id,
      text: `${clientLabel} סיימו לבחור תמונות מהגלריה, נבחרו ${count ?? 0} תמונות`,
      is_client_action: true,
    });
  }

  const { data: photographer } = await supabase
    .from("photographers")
    .select("name, email, ui_lang")
    .eq("id", gallery.photographer_id)
    .maybeSingle<Pick<Photographer, "name" | "email" | "ui_lang">>();

  if (photographer?.email) {
    // To the photographer, in their own language (photographers.ui_lang); Hebrew when unset.
    const lang = photographerLang(photographer.ui_lang);
    const t = makeT(messagesFor(lang));
    const formattedDate = dateValue ? new Date(dateValue).toLocaleDateString(dateLocale(lang)) : "";
    const origin = new URL(request.url).origin;
    const favoritesLink = `${origin}/galleries/${gallery.id}?favorites=1`;
    try {
      await sendEmail({
        to: notificationEmailFor(photographer.email),
        subject: t("{name} סיימו לבחור תמונות מהגלריה", { name: clientLabel }),
        text:
          `${t("שלום {name},", { name: photographer.name })}\n\n` +
          `${formattedDate ? t("הלקוח/ה של \"{name}\" ({date}) סיימו לבחור תמונות מהגלריה.", { name: clientLabel, date: formattedDate }) : t("הלקוח/ה של \"{name}\" סיימו לבחור תמונות מהגלריה.", { name: clientLabel })}\n` +
          `${t("נבחרו {n} תמונות.", { n: count ?? 0 })}\n\n` +
          `${t("לצפייה והורדה של התמונות שנבחרו:")}\n${favoritesLink}\n`,
      });
    } catch (e) {
      console.error("Selection confirmation email failed:", e);
    }
  }

  return NextResponse.json({ ok: true, favoriteCount: count ?? 0 });
}
