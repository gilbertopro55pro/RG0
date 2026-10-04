import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { scheduleReminderForStage } from "@/lib/clientReminders";

// The actual WhatsApp send now happens client-side (a wa.me deep link the photographer confirms
// themselves — see EventDetailView.tsx's sendWhatsAppUpdate and src/lib/waLink.ts). This route's
// only remaining job is the activity-log entry, called right after the photographer opens that
// link — the stage label is already known client-side (stageDescriptors), so it's passed in
// directly instead of being re-resolved here.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { label, clientPhone, stageKey }: { label: string; clientPhone: string; stageKey?: string } = await request.json();

  await supabase
    .from("event_notifications")
    .insert({ event_id: eventId, text: `נשלחה הודעת וואטסאפ ל-${clientPhone} בנוגע לשלב "${label}"` });

  // The album-design-ready / full-film-ready messages start a 3-day reminder to the photographer
  // (lib/clientReminders.ts). Only for an event this user can see (RLS), scheduled server-side.
  if (stageKey) {
    const { data: own } = await supabase.from("events").select("id").eq("id", eventId).maybeSingle<{ id: string }>();
    if (own) await scheduleReminderForStage(createServiceRoleClient(), eventId, stageKey).catch((e) => console.error("Client reminder schedule failed:", e));
  }

  return NextResponse.json({ ok: true });
}
