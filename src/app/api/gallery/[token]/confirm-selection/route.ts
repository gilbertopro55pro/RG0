import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendEmail } from "@/lib/resend";
import type { EventRow, GalleryRow, Photographer } from "@/lib/types";

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

  const now = new Date().toISOString();
  await supabase.from("galleries").update({ selection_confirmed_at: now }).eq("id", gallery.id);

  await supabase
    .from("event_stages")
    .update({ done: true, done_at: now })
    .eq("event_id", gallery.event_id)
    .eq("stage_key", "client_photo_selection");

  const [{ data: event }, { data: photographer }] = await Promise.all([
    supabase
      .from("events")
      .select("client_name, event_date")
      .eq("id", gallery.event_id)
      .maybeSingle<Pick<EventRow, "client_name" | "event_date">>(),
    supabase
      .from("photographers")
      .select("name, email")
      .eq("id", gallery.photographer_id)
      .maybeSingle<Pick<Photographer, "name" | "email">>(),
  ]);

  await supabase.from("event_notifications").insert({
    event_id: gallery.event_id,
    text: `${event?.client_name ?? "הלקוח/ה"} סיימו לבחור תמונות מהגלריה — נבחרו ${count ?? 0} תמונות`,
  });

  if (photographer?.email) {
    const origin = new URL(request.url).origin;
    const favoritesLink = `${origin}/galleries/${gallery.id}?favorites=1`;
    const formattedDate = event?.event_date
      ? new Date(event.event_date).toLocaleDateString("he-IL")
      : "";
    try {
      await sendEmail({
        to: photographer.email,
        subject: `${event?.client_name ?? "לקוח"} סיימו לבחור תמונות מהגלריה`,
        text:
          `שלום ${photographer.name},\n\n` +
          `הלקוח/ה של האירוע "${event?.client_name ?? ""}"${formattedDate ? ` (${formattedDate})` : ""} סיימו לבחור תמונות מהגלריה.\n` +
          `נבחרו ${count ?? 0} תמונות.\n\n` +
          `לצפייה והורדה של התמונות שנבחרו:\n${favoritesLink}`,
      });
    } catch (e) {
      console.error("Selection confirmation email failed:", e);
    }
  }

  return NextResponse.json({ ok: true, favoriteCount: count ?? 0 });
}
