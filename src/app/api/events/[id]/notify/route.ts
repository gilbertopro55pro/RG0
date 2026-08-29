import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { label, clientPhone }: { label: string; clientPhone: string } = await request.json();

  await supabase
    .from("event_notifications")
    .insert({ event_id: eventId, text: `נשלחה הודעת וואטסאפ ל-${clientPhone} בנוגע לשלב "${label}"` });

  return NextResponse.json({ ok: true });
}
