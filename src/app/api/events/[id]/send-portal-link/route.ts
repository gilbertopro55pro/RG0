import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PORTAL_LINK_TEMPLATE } from "@/lib/stages";
import { friendlyWhatsAppError, sendWhatsAppTemplate } from "@/lib/whatsapp";
import type { EventRow } from "@/lib/types";

// Lets the photographer proactively (re)send the client-portal link on demand — the same template
// used automatically on event creation, for cases like the client losing the original message or
// the event having been created before this feature existed.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  // RLS (events_all_own / events_all_assigned) scopes this to events the caller can see.
  const { data: event } = await supabase
    .from("events")
    .select("client_name, client_phone, client_access_token")
    .eq("id", eventId)
    .single<Pick<EventRow, "client_name" | "client_phone" | "client_access_token">>();

  if (!event) {
    return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });
  }
  if (!event.client_phone) {
    return NextResponse.json({ error: "לא הוזן טלפון לקוח לאירוע זה" }, { status: 400 });
  }

  const notifications: { event_id: string; text: string }[] = [];

  try {
    const portalLink = `${new URL(request.url).origin}/portal/${event.client_access_token}`;
    await sendWhatsAppTemplate(event.client_phone, PORTAL_LINK_TEMPLATE, [event.client_name, portalLink]);
    notifications.push({ event_id: eventId, text: `נשלח קישור לפורטל הלקוח בוואטסאפ ל-${event.client_phone}` });
    await supabase.from("event_notifications").insert(notifications);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "שגיאה לא ידועה";
    const friendly = friendlyWhatsAppError(raw);
    notifications.push({ event_id: eventId, text: friendly });
    await supabase.from("event_notifications").insert(notifications);
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}
