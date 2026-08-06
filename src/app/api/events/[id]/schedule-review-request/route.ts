import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { REVIEW_REQUEST_DELAY_DAYS } from "@/lib/stages";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const sendAt = new Date(Date.now() + REVIEW_REQUEST_DELAY_DAYS * 24 * 60 * 60 * 1000);

  const { error: insertError } = await supabase.from("scheduled_messages").insert({
    event_id: eventId,
    kind: "review_request",
    send_at: sendAt.toISOString(),
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await supabase.from("event_notifications").insert({
    event_id: eventId,
    text: `תוזמנה תזכורת ביקורת ללקוח ל-${sendAt.toLocaleDateString("he-IL")}`,
  });

  return NextResponse.json({ ok: true, sendAt: sendAt.toISOString() });
}
