import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { REVIEW_REQUEST_TEMPLATE } from "@/lib/stages";
import { friendlyWhatsAppError, sendWhatsAppTemplate } from "@/lib/whatsapp";

type ScheduledMessage = {
  id: string;
  event_id: string;
  kind: "review_request" | "payment_reminder";
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data: due } = await supabase
    .from("scheduled_messages")
    .select("id, event_id, kind")
    .eq("status", "pending")
    .lte("send_at", new Date().toISOString())
    .returns<ScheduledMessage[]>();

  const results = [];

  for (const message of due ?? []) {
    const { data: event } = await supabase
      .from("events")
      .select("client_name, client_phone")
      .eq("id", message.event_id)
      .single<{ client_name: string; client_phone: string | null }>();

    if (!event?.client_phone) {
      await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
      results.push({ id: message.id, status: "failed", reason: "no client phone" });
      continue;
    }

    // Payment reminders never message the client directly here — the photographer must
    // confirm the balance is still unpaid first (see api/scheduled-messages/[id]/confirm-*).
    if (message.kind === "payment_reminder") {
      await supabase.from("scheduled_messages").update({ status: "awaiting_confirmation" }).eq("id", message.id);
      await supabase.from("event_notifications").insert({
        event_id: message.event_id,
        text: "הגיע מועד תזכורת התשלום — ממתין לאישורך שהיתרה עדיין לא שולמה",
      });
      results.push({ id: message.id, status: "awaiting_confirmation" });
      continue;
    }

    try {
      await sendWhatsAppTemplate(event.client_phone, REVIEW_REQUEST_TEMPLATE, [
        event.client_name,
        process.env.GOOGLE_REVIEW_LINK || "",
      ]);
      await supabase
        .from("scheduled_messages")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", message.id);
      await supabase.from("event_notifications").insert({
        event_id: message.event_id,
        text: `נשלחה תזכורת ביקורת ל-${event.client_phone}`,
      });
      results.push({ id: message.id, status: "sent" });
    } catch (e) {
      await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
      await supabase.from("event_notifications").insert({
        event_id: message.event_id,
        text: friendlyWhatsAppError(e instanceof Error ? e.message : "שגיאה לא ידועה"),
      });
      results.push({ id: message.id, status: "failed", reason: e instanceof Error ? e.message : "unknown" });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
