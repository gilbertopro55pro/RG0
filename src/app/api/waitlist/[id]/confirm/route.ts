import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EVENT_BOOKING_CONFIRMATION_TEMPLATE, PACKAGE_FLOWS, PACKAGE_LABELS, PORTAL_LINK_TEMPLATE } from "@/lib/stages";
import { syncEventToGoogleCalendar } from "@/lib/googleCalendarSync";
import { syncEventToAppleCalendar } from "@/lib/appleCalendarSync";
import { friendlyWhatsAppError, sendWhatsAppTemplate } from "@/lib/whatsapp";
import type { WaitlistRow } from "@/lib/types";

// Resolves a double-booked waitlist entry into a real event — the deliberate path for putting a
// second event on an already-taken date (e.g. covering it with a subcontracted photographer),
// as opposed to the plain new-event flow, which now always blocks on a date conflict. Defaults
// to the "full" package since the confirm dialog only asks for a resolution reason, not package
// details — the photographer can adjust the package from the event page afterward.
const DEFAULT_PACKAGE = "full" as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { resolution }: { resolution?: string } = await request.json().catch(() => ({}));
  if (!resolution?.trim()) {
    return NextResponse.json({ error: "יש לבחור או להזין הסבר" }, { status: 400 });
  }

  const { data: entry } = await supabase
    .from("waitlist")
    .select("*")
    .eq("id", id)
    .maybeSingle<WaitlistRow>();
  if (!entry) {
    return NextResponse.json({ error: "הרשומה לא נמצאה" }, { status: 404 });
  }

  const packageLabelText = PACKAGE_LABELS[DEFAULT_PACKAGE];

  const { data: event, error: insertError } = await supabase
    .from("events")
    .insert({
      photographer_id: user.id,
      client_name: entry.client_name,
      client_phone: entry.client_phone,
      package: DEFAULT_PACKAGE,
      event_date: entry.requested_date,
      resolution_note: resolution.trim(),
    })
    .select()
    .single();

  if (insertError || !event) {
    return NextResponse.json({ error: insertError?.message ?? "שגיאה ביצירת האירוע" }, { status: 500 });
  }

  await supabase.from("event_payments").insert({
    event_id: event.id,
    deposit_amount: 0,
    balance_amount: 0,
    balance_due_date: entry.requested_date,
  });

  const stageRows = PACKAGE_FLOWS[DEFAULT_PACKAGE].map((stageKey, i) => ({
    event_id: event.id,
    stage_key: stageKey as string | null,
    custom_stage_id: null as string | null,
    stage_order: i,
    done: i === 0,
    done_at: i === 0 ? new Date().toISOString() : null,
  }));
  await supabase.from("event_stages").insert(stageRows);

  const formattedDate = new Date(entry.requested_date).toLocaleDateString("he-IL");
  const notifications = [
    { event_id: event.id, text: `האירוע אושר מרשימת ההמתנה — ${resolution.trim()}` },
  ];

  if (entry.client_phone) {
    try {
      await sendWhatsAppTemplate(entry.client_phone, EVENT_BOOKING_CONFIRMATION_TEMPLATE, [
        entry.client_name,
        formattedDate,
        "יעודכן",
        "יעודכן",
        "0",
        "0",
      ]);
      notifications.push({ event_id: event.id, text: `נשלחה הודעת וואטסאפ (אישור הזמנה) ל-${entry.client_phone}` });
    } catch (e) {
      const raw = e instanceof Error ? e.message : "שגיאה לא ידועה";
      notifications.push({ event_id: event.id, text: friendlyWhatsAppError(raw) });
    }

    try {
      const portalLink = `${new URL(request.url).origin}/portal/${event.client_access_token}`;
      await sendWhatsAppTemplate(entry.client_phone, PORTAL_LINK_TEMPLATE, [entry.client_name, portalLink]);
      notifications.push({ event_id: event.id, text: `נשלח קישור לפורטל הלקוח בוואטסאפ ל-${entry.client_phone}` });
    } catch (e) {
      const raw = e instanceof Error ? e.message : "שגיאה לא ידועה";
      notifications.push({ event_id: event.id, text: `שליחת קישור הפורטל נכשלה — ${friendlyWhatsAppError(raw)}` });
    }
  }

  try {
    const calendarEvent = await syncEventToGoogleCalendar(supabase, user.id, {
      summary: `${packageLabelText} · ${entry.client_name}`,
      description: `${packageLabelText} · ${entry.client_name}\nתאריך: ${formattedDate}\nהערה: אושר מרשימת המתנה — ${resolution.trim()}`,
      date: entry.requested_date,
    });
    if (calendarEvent) {
      await supabase.from("events").update({ google_calendar_event_id: calendarEvent.id }).eq("id", event.id);
      notifications.push({ event_id: event.id, text: `האירוע נוסף ליומן Google שלך: ${calendarEvent.htmlLink}` });
    }
  } catch (e) {
    const rawError = e instanceof Error ? e.message : "שגיאה לא ידועה";
    notifications.push({ event_id: event.id, text: `שגיאה בהוספת האירוע ליומן Google: ${rawError}` });
  }

  try {
    const appleUid = await syncEventToAppleCalendar(supabase, user.id, event.id, {
      summary: `${packageLabelText} · ${entry.client_name}`,
      description: `${packageLabelText} · ${entry.client_name}\nתאריך: ${formattedDate}\nהערה: אושר מרשימת המתנה — ${resolution.trim()}`,
      date: entry.requested_date,
    });
    if (appleUid) {
      await supabase.from("events").update({ apple_calendar_event_uid: appleUid }).eq("id", event.id);
      notifications.push({ event_id: event.id, text: "האירוע נוסף גם ליומן Apple שלך" });
    }
  } catch (e) {
    const rawError = e instanceof Error ? e.message : "שגיאה לא ידועה";
    notifications.push({ event_id: event.id, text: `שגיאה בהוספת האירוע ליומן Apple: ${rawError}` });
  }

  await supabase.from("event_notifications").insert(notifications);
  await supabase.from("waitlist").delete().eq("id", id);

  return NextResponse.json({ id: event.id });
}
