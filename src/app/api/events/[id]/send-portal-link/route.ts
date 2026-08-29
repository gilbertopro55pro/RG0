import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The actual WhatsApp send now happens client-side (a wa.me deep link the photographer confirms
// themselves — see PortalLinkSection.tsx and src/lib/waLink.ts for why: this sidesteps the Meta
// Business API's verification/24h-window requirements entirely). This route's only remaining job
// is the activity-log entry, called right after the photographer opens that link.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { data: event } = await supabase
    .from("events")
    .select("client_phone")
    .eq("id", eventId)
    .maybeSingle<{ client_phone: string | null }>();
  if (!event) {
    return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });
  }

  await supabase
    .from("event_notifications")
    .insert({ event_id: eventId, text: `נשלח קישור לפורטל הלקוח בוואטסאפ ל-${event.client_phone ?? ""}` });

  return NextResponse.json({ ok: true });
}
