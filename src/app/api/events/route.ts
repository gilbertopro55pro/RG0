import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EVENT_BOOKING_CONFIRMATION_TEMPLATE, PACKAGE_FLOWS, PACKAGE_LABELS, PORTAL_LINK_TEMPLATE, type PackageType } from "@/lib/stages";
import { syncEventToGoogleCalendar } from "@/lib/googleCalendarSync";
import { friendlyWhatsAppError, sendWhatsAppTemplate } from "@/lib/whatsapp";
import type { CustomPackageRow, CustomPackageStageRow } from "@/lib/types";

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// If either event is missing a time range, fall back to a full-day conflict (the safe default,
// matching the previous any-event-same-date behavior) — only refine to a real time-range
// overlap check when both sides have start/end times recorded.
function eventsConflict(
  a: { start: string | null; end: string | null },
  b: { start: string | null; end: string | null }
): boolean {
  if (!a.start || !a.end || !b.start || !b.end) return true;
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const body = await request.json();
  const {
    clientName,
    clientPhone,
    pkg,
    customPackageId,
    eventDate,
    eventStartTime,
    eventEndTime,
    eventLocation,
    arrivalTime,
    deposit,
    balance,
    paymentReminderDate,
  }: {
    clientName: string;
    clientPhone: string;
    pkg: PackageType | null;
    customPackageId: string | null;
    eventDate: string;
    eventStartTime: string | null;
    eventEndTime: string | null;
    eventLocation: string;
    arrivalTime: string;
    deposit: number;
    balance: number;
    paymentReminderDate: string | null;
  } = body;

  if (!clientName || !eventDate || (!pkg && !customPackageId) || (pkg && !PACKAGE_FLOWS[pkg])) {
    return NextResponse.json({ error: "שדות חובה חסרים" }, { status: 400 });
  }

  let customPackage: CustomPackageRow | null = null;
  let customStages: CustomPackageStageRow[] = [];
  if (customPackageId) {
    const [{ data: cp }, { data: cs }] = await Promise.all([
      supabase.from("custom_packages").select("*").eq("id", customPackageId).single<CustomPackageRow>(),
      supabase
        .from("custom_package_stages")
        .select("*")
        .eq("package_id", customPackageId)
        .order("sort_order", { ascending: true })
        .returns<CustomPackageStageRow[]>(),
    ]);
    if (!cp || !cs || cs.length === 0) {
      return NextResponse.json({ error: "החבילה המותאמת אישית לא נמצאה" }, { status: 400 });
    }
    customPackage = cp;
    customStages = cs;
  }

  const packageLabelText = customPackage ? customPackage.name : PACKAGE_LABELS[pkg!];

  const { data: sameDateEvents } = await supabase
    .from("events")
    .select("id, client_name, event_start_time, event_end_time")
    .eq("photographer_id", user.id)
    .eq("event_date", eventDate)
    .returns<{ id: string; client_name: string; event_start_time: string | null; event_end_time: string | null }[]>();

  const conflicting = (sameDateEvents ?? []).find((e) =>
    eventsConflict(
      { start: eventStartTime, end: eventEndTime },
      { start: e.event_start_time, end: e.event_end_time }
    )
  );

  if (conflicting && !body.allowDoubleBooking) {
    return NextResponse.json(
      {
        conflict: true,
        error: `כבר קיים אירוע בתאריך זה (${conflicting.client_name}). אפשר לשמור בכל זאת, או להוסיף לרשימת המתנה.`,
      },
      { status: 409 }
    );
  }

  const { data: event, error: insertError } = await supabase
    .from("events")
    .insert({
      photographer_id: user.id,
      client_name: clientName,
      client_phone: clientPhone || null,
      package: customPackage ? null : pkg,
      custom_package_id: customPackage?.id ?? null,
      event_date: eventDate,
      event_start_time: eventStartTime || null,
      event_end_time: eventEndTime || null,
      event_location: eventLocation || null,
      arrival_time: arrivalTime || null,
    })
    .select()
    .single();

  if (insertError || !event) {
    return NextResponse.json({ error: insertError?.message ?? "שגיאה ביצירת האירוע" }, { status: 500 });
  }

  await supabase.from("event_payments").insert({
    event_id: event.id,
    deposit_amount: deposit,
    balance_amount: balance,
    balance_due_date: eventDate,
  });

  if (paymentReminderDate) {
    await supabase.from("scheduled_messages").insert({
      event_id: event.id,
      kind: "payment_reminder",
      send_at: new Date(`${paymentReminderDate}T09:00:00`).toISOString(),
    });
  }

  const stageRows = customPackage
    ? customStages.map((cs, i) => ({
        event_id: event.id,
        stage_key: null as string | null,
        custom_stage_id: cs.id as string | null,
        stage_order: i,
        done: i === 0,
        done_at: i === 0 ? new Date().toISOString() : null,
      }))
    : PACKAGE_FLOWS[pkg!].map((stageKey, i) => ({
        event_id: event.id,
        stage_key: stageKey as string | null,
        custom_stage_id: null as string | null,
        stage_order: i,
        done: i === 0,
        done_at: i === 0 ? new Date().toISOString() : null,
      }));
  await supabase.from("event_stages").insert(stageRows);

  const formattedDate = new Date(eventDate).toLocaleDateString("he-IL");
  const timeRangeText = eventStartTime ? ` · ${eventStartTime.slice(0, 5)}${eventEndTime ? `-${eventEndTime.slice(0, 5)}` : ""}` : "";
  const calendarDescription =
    `${packageLabelText} · ${clientName}\n` +
    `תאריך: ${formattedDate}${timeRangeText}\n` +
    `מקדמה: ₪${deposit} · יתרה לתשלום: ₪${balance}\n` +
    `לקוח/ה: ${clientName} · טלפון: ${clientPhone || "לא הוזן"}\n` +
    `שעת צילומי משפחה: ${arrivalTime || "יעודכן"}`;

  const notifications = [{ event_id: event.id, text: "האירוע נסגר במערכת" }];

  if (clientPhone) {
    try {
      await sendWhatsAppTemplate(clientPhone, EVENT_BOOKING_CONFIRMATION_TEMPLATE, [
        clientName,
        formattedDate,
        eventLocation || "יעודכן",
        arrivalTime || "יעודכן",
        String(deposit),
        String(balance),
      ]);
      notifications.push({
        event_id: event.id,
        text: `נשלחה הודעת וואטסאפ (אישור הזמנה) ל-${clientPhone}`,
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : "שגיאה לא ידועה";
      notifications.push({ event_id: event.id, text: friendlyWhatsAppError(raw) });
    }

    // Sent as its own message (separate template) right after booking confirmation, so the client
    // gets the portal link automatically without the photographer having to remember to share it —
    // PortalLinkSection's "שליחת קישור בוואטסאפ" button reuses the same template for a resend.
    try {
      const portalLink = `${new URL(request.url).origin}/portal/${event.client_access_token}`;
      await sendWhatsAppTemplate(clientPhone, PORTAL_LINK_TEMPLATE, [clientName, portalLink]);
      notifications.push({
        event_id: event.id,
        text: `נשלח קישור לפורטל הלקוח בוואטסאפ ל-${clientPhone}`,
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : "שגיאה לא ידועה";
      notifications.push({ event_id: event.id, text: `שליחת קישור הפורטל נכשלה — ${friendlyWhatsAppError(raw)}` });
    }
  } else {
    notifications.push({
      event_id: event.id,
      text: "לא הוזן טלפון לקוח — לא נשלחה הודעת וואטסאפ",
    });
  }

  try {
    const calendarEvent = await syncEventToGoogleCalendar(supabase, user.id, {
      summary: `${packageLabelText} · ${clientName}`,
      description: calendarDescription,
      date: eventDate,
      startTime: eventStartTime,
      endTime: eventEndTime,
    });
    if (calendarEvent) {
      // Verify the id actually persisted — a silent failure here would leave the event
      // permanently unlinked from the calendar, with nothing left to "move" on future edits.
      const { data: linked, error: linkError } = await supabase
        .from("events")
        .update({ google_calendar_event_id: calendarEvent.id })
        .eq("id", event.id)
        .select("id")
        .single();
      if (linkError || !linked) {
        notifications.push({
          event_id: event.id,
          text: `האירוע נוסף ליומן Google, אבל שמירת הקישור במערכת נכשלה (${linkError?.message ?? "שגיאה לא ידועה"}) — עריכת האירוע לא תעדכן את היומן.`,
        });
      } else {
        notifications.push({
          event_id: event.id,
          text: `האירוע נוסף ליומן Google שלך: ${calendarEvent.htmlLink}`,
        });
      }
    } else {
      notifications.push({
        event_id: event.id,
        text: `האירוע נוסף אוטומטית ליומן Google של הצלם: "${calendarDescription}"`,
      });
    }
  } catch (e) {
    const rawError = e instanceof Error ? e.message : "שגיאה לא ידועה";
    notifications.push({
      event_id: event.id,
      text: `שגיאה בהוספת האירוע ליומן Google: ${rawError}`,
    });
  }

  await supabase.from("event_notifications").insert(notifications);

  return NextResponse.json({ id: event.id });
}
