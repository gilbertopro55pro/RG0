import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToPhotographer } from "@/lib/push";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { ALBUM_ACTIVITY_TEMPLATE } from "@/lib/stages";
import { photographerLang } from "@/lib/clientLang";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

// Best-effort — a failed WhatsApp send (e.g. template not yet approved, or the shared number
// still being a Meta test number) never blocks the client-facing action that triggered it. Shared
// between the comment and approve routes since both need the exact same "who owns this event's
// photographer" lookup.
export async function notifyPhotographerOfAlbumActivity(
  supabase: SupabaseClient,
  eventId: string,
  action: string
): Promise<void> {
  const { data: event } = await supabase
    .from("events")
    .select("client_name, photographer_id")
    .eq("id", eventId)
    .maybeSingle<{ client_name: string; photographer_id: string }>();
  if (!event) return;

  const { data: photographer } = await supabase
    .from("photographers")
    .select("phone, ui_lang")
    .eq("id", event.photographer_id)
    .maybeSingle<{ phone: string; ui_lang: string | null }>();

  // Phone notification (lib/push.ts); one per event, a burst of comments replaces the previous one.
  // In the photographer's language; `action` is the Hebrew phrase the caller passes (also the key).
  const t = makeT(messagesFor(photographerLang(photographer?.ui_lang)));
  await sendPushToPhotographer(event.photographer_id, {
    title: `${event.client_name}: ${t(action)}`,
    body: t("לחצו לפתיחת האירוע"),
    url: `/events/${eventId}`,
    tag: `album-${eventId}`,
  });

  // The WhatsApp template is Meta-approved in Hebrew, so its text stays Hebrew.
  if (!photographer?.phone) return;

  try {
    await sendWhatsAppTemplate(photographer.phone, ALBUM_ACTIVITY_TEMPLATE, [event.client_name, action]);
  } catch {
    // Pending template approval / test-number restrictions — same as every other template.
  }
}
