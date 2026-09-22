import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { leadQuoteFollowUpMessage } from "@/lib/leadFollowUp";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { send }: { send: boolean } = await request.json();

  const { data: message } = await supabase
    .from("scheduled_messages")
    .select("id, lead_id, status")
    .eq("id", id)
    .eq("status", "awaiting_confirmation")
    .single<{ id: string; lead_id: string; status: string }>();

  if (!message) {
    return NextResponse.json({ error: "התזכורת כבר טופלה או לא נמצאה" }, { status: 404 });
  }

  if (!send) {
    await supabase.from("scheduled_messages").update({ status: "canceled" }).eq("id", message.id);
    await supabase.from("event_notifications").insert({
      lead_id: message.lead_id,
      text: "דילגת על תזכורת המעקב",
    });
    return NextResponse.json({ ok: true, sent: false });
  }

  const { data: lead } = await supabase
    .from("leads")
    .select("name, phone")
    .eq("id", message.lead_id)
    .single<{ name: string; phone: string | null }>();

  if (!lead?.phone) {
    await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
    return NextResponse.json({ error: "לא הוזן טלפון ללקוח/ה" }, { status: 400 });
  }

  // Same pattern as payment/review reminders: the actual send happens client-side via a wa.me
  // deep link the photographer taps themselves (see PendingClientMessagePrompts.tsx) — no server
  // callback confirms the tap actually happened, just that the prompt was resolved.
  const { data: photographer } = await supabase
    .from("photographers")
    .select("whatsapp_signature")
    .eq("id", user.id)
    .maybeSingle<{ whatsapp_signature: string | null }>();
  const message_text = leadQuoteFollowUpMessage(lead.name, photographer?.whatsapp_signature);

  await supabase
    .from("scheduled_messages")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", message.id);
  await supabase.from("event_notifications").insert({
    lead_id: message.lead_id,
    text: `נשלחה תזכורת מעקב ל-${lead.phone}`,
  });

  return NextResponse.json({ ok: true, sent: true, clientPhone: lead.phone, message: message_text });
}
