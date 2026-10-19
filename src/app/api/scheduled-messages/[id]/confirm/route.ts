import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clientLangFor } from "@/lib/clientLang";
import { shortClientUrl } from "@/lib/shortLinks";
import { openAmount } from "@/lib/openBalances";
import { paymentReminderMessage } from "@/lib/paymentReminder";
import type { EventPaymentRow } from "@/lib/types";

type Payment = Pick<EventPaymentRow, "deposit_amount" | "deposit_paid" | "deposit_paid_amount" | "balance_amount" | "balance_paid" | "balance_paid_amount">;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { paid, dryRun }: { paid: boolean; dryRun?: boolean } = await request.json();

  const { data: message } = await supabase
    .from("scheduled_messages")
    .select("id, event_id, status")
    .eq("id", id)
    .eq("status", "awaiting_confirmation")
    .single<{ id: string; event_id: string; status: string }>();

  if (!message) {
    return NextResponse.json({ error: "התזכורת כבר טופלה או לא נמצאה" }, { status: 404 });
  }

  const [{ data: event }, { data: payment }, { data: photographer }] = await Promise.all([
    supabase
      .from("events")
      .select("client_name, client_phone, client_access_token, client_lang, closed_at, closed_balance_month")
      .eq("id", message.event_id)
      .single<{
        client_name: string;
        client_phone: string | null;
        client_access_token: string;
        client_lang: string | null;
        closed_at: string | null;
        closed_balance_month: string | null;
      }>(),
    supabase
      .from("event_payments")
      .select("deposit_amount, deposit_paid, deposit_paid_amount, balance_amount, balance_paid, balance_paid_amount")
      .eq("event_id", message.event_id)
      .maybeSingle<Payment>(),
    supabase.from("photographers").select("whatsapp_signature, name").eq("id", user.id).maybeSingle<{ whatsapp_signature: string | null; name: string | null }>(),
  ]);
  // What the client still owes after partial payments (the same amount as the dashboard's open
  // balances): the prompt asks about it, and the reminder asks for it.
  const open = payment ? openAmount(payment, Boolean(event?.closed_at && event.closed_balance_month)) : { deposit: 0, balance: 0, total: 0 };

  if (paid) {
    const now = new Date().toISOString();
    // "Paid" answers for the whole amount the prompt showed, so a deposit still open is paid too.
    await supabase
      .from("event_payments")
      .update(open.deposit > 0 ? { balance_paid: true, balance_paid_at: now, deposit_paid: true, deposit_paid_at: now } : { balance_paid: true, balance_paid_at: now })
      .eq("event_id", message.event_id);
    await supabase.from("scheduled_messages").update({ status: "canceled" }).eq("id", message.id);
    await supabase.from("event_notifications").insert({
      event_id: message.event_id,
      text: "אושר שהיתרה שולמה. לא נשלחה תזכורת ללקוח",
    });
    return NextResponse.json({ ok: true, sent: false });
  }

  // Paid in full since the prompt came up (partial payments, or the event closed): nothing to ask for.
  if (open.total <= 0) {
    if (!dryRun) await supabase.from("scheduled_messages").update({ status: "canceled" }).eq("id", message.id);
    return NextResponse.json({ error: "היתרה כבר שולמה" }, { status: 409 });
  }

  if (!event?.client_phone) {
    await supabase.from("scheduled_messages").update({ status: "failed" }).eq("id", message.id);
    return NextResponse.json({ error: "לא הוזן טלפון לקוח" }, { status: 400 });
  }

  // The actual send now happens client-side (a wa.me deep link the photographer confirms
  // themselves — see PaymentReminderPrompts.tsx). This just builds the message and marks the
  // reminder handled; there's no server callback to confirm the tap actually happened, same
  // as the other interactive wa.me flows.
  // The same message as the dashboard's reminder (lib/paymentReminder.ts), in the client's language.
  const message_text = paymentReminderMessage({
    clientName: event.client_name,
    amount: open.total,
    portalUrl: shortClientUrl(new URL(request.url).origin, "portal", event.client_access_token),
    signature: photographer?.whatsapp_signature,
    senderName: photographer?.name,
    lang: clientLangFor(user.email, event.client_lang),
  });

  // A preview (dryRun): the prompt fetches the message when it shows, so the send button opens
  // WhatsApp right in the tap (iPhone blocks it after a request) and only then records the send.
  if (dryRun) return NextResponse.json({ ok: true, sent: true, clientPhone: event.client_phone, message: message_text });

  await supabase
    .from("scheduled_messages")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", message.id);
  await supabase.from("event_notifications").insert({
    event_id: message.event_id,
    text: `נשלחה תזכורת תשלום ל-${event.client_phone}`,
  });

  return NextResponse.json({ ok: true, sent: true, clientPhone: event.client_phone, message: message_text });
}
