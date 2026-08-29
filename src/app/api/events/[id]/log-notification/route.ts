import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// A small generic activity-log endpoint for the client-side wa.me flows (see src/lib/waLink.ts) —
// the photographer's browser opens WhatsApp directly with a pre-filled message and confirms the
// send themselves; this just records that it happened, since no Business API call exists anymore
// to log from server-side.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { text }: { text: string } = await request.json();
  if (!text?.trim()) {
    return NextResponse.json({ error: "טקסט חסר" }, { status: 400 });
  }

  await supabase.from("event_notifications").insert({ event_id: eventId, text: text.trim() });
  return NextResponse.json({ ok: true });
}
