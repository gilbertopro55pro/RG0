import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToPhotographer } from "@/lib/push";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { ALBUM_ACTIVITY_TEMPLATE } from "@/lib/stages";

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

  // Phone notification (lib/push.ts); one per event, a burst of comments replaces the previous one.
  await sendPushToPhotographer(event.photographer_id, {
    title: `${event.client_name}: ${action}`,
    body: "לחצו לפתיחת האירוע",
    url: `/events/${eventId}`,
    tag: `album-${eventId}`,
  });

  const { data: photographer } = await supabase
    .from("photographers")
    .select("phone")
    .eq("id", event.photographer_id)
    .maybeSingle<{ phone: string }>();
  if (!photographer?.phone) return;

  try {
    await sendWhatsAppTemplate(photographer.phone, ALBUM_ACTIVITY_TEMPLATE, [event.client_name, action]);
  } catch {
    // Pending template approval / test-number restrictions — same as every other template.
  }
}
