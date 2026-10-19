import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LEAD_REMINDER_CHANNELS, type LeadReminderChannel } from "@/lib/leadReminder";

// Records a reminder the photographer just sent a lead from the leads page (lib/leadReminder.ts):
// the button waits two more days, the lead's log says how it went out, and the home screen's quote
// follow-up prompt for the lead is closed, since this is that follow-up. POST { channel }. The send
// itself happens in the photographer's browser (a wa.me / sms: / mailto: link opened on the tap).
const CHANNEL_TEXT: Record<LeadReminderChannel, string> = {
  whatsapp: "נשלחה תזכורת בוואטסאפ",
  sms: "נשלחה תזכורת ב-SMS",
  email: "נשלחה תזכורת במייל",
  copy: "הועתקה הודעת תזכורת לשליחה",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { channel?: unknown } | null;
  const channel = LEAD_REMINDER_CHANNELS.find((c) => c === body?.channel);
  if (!channel) return NextResponse.json({ error: "ערוץ לא תקין" }, { status: 400 });

  const { data: lead } = await supabase
    .from("leads")
    .select("id, reminder_count")
    .eq("id", id)
    .eq("photographer_id", user.id)
    .maybeSingle<{ id: string; reminder_count: number | null }>();
  if (!lead) return NextResponse.json({ error: "הליד לא נמצא" }, { status: 404 });

  const sentAt = new Date().toISOString();
  const count = (lead.reminder_count ?? 0) + 1;
  const { error } = await supabase.from("leads").update({ reminder_sent_at: sentAt, reminder_count: count }).eq("id", id);
  if (error) return NextResponse.json({ error: "שגיאה בשמירה" }, { status: 500 });

  await Promise.all([
    supabase.from("event_notifications").insert({ lead_id: id, text: CHANNEL_TEXT[channel] }),
    supabase
      .from("scheduled_messages")
      .update({ status: "sent", sent_at: sentAt })
      .eq("lead_id", id)
      .eq("kind", "lead_quote_followup")
      .in("status", ["pending", "awaiting_confirmation"]),
  ]);
  return NextResponse.json({ ok: true, reminderSentAt: sentAt, reminderCount: count });
}
