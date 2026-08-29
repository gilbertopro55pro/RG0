import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PACKAGE_FLOWS, PACKAGE_LABELS, type PackageType } from "@/lib/stages";
import { GoogleCalendarDisconnectedError, syncEventToGoogleCalendar } from "@/lib/googleCalendarSync";
import { syncEventToAppleCalendar } from "@/lib/appleCalendarSync";
import type { CustomPackageRow, CustomPackageStageRow } from "@/lib/types";
import { eventsConflict } from "@/lib/eventTime";

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
    notes,
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
    notes: string;
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

  if (conflicting) {
    return NextResponse.json(
      {
        conflict: true,
        error: `כבר קיים אירוע בתאריך זה (${conflicting.client_name}).`,
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
      notes: notes || null,
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

  // Auto-provision the gallery the moment the event is booked — same client name and phone,
  // nothing left for the photographer to retype later in a separate "new gallery" step.
  await supabase.from("galleries").insert({
    event_id: event.id,
    photographer_id: user.id,
    title: clientName,
    client_phone: clientPhone || null,
    expiry_months: 3,
    allow_downloads: true,
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

  const notifications = [
    { event_id: event.id, text: "האירוע נסגר במערכת" },
    { event_id: event.id, text: "גלריה נוצרה אוטומטית עבור האירוע" },
  ];

  // The actual WhatsApp send (booking confirmation + portal link, combined into one message) now
  // happens client-side right after this request resolves — a wa.me deep link the photographer
  // confirms themselves (see NewEventModal.tsx). This sidesteps the Meta Business API's
  // verification/24h-window requirements entirely; the logging call after it records that it
  // actually happened. If there's no phone at all, note that here since the client never gets a
  // chance to.
  if (!clientPhone) {
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
    if (e instanceof GoogleCalendarDisconnectedError) {
      notifications.push({
        event_id: event.id,
        text: "החיבור ליומן Google פג תוקף — יש להתחבר מחדש בהגדרות",
      });
    } else {
      const rawError = e instanceof Error ? e.message : "שגיאה לא ידועה";
      notifications.push({
        event_id: event.id,
        text: `שגיאה בהוספת האירוע ליומן Google: ${rawError}`,
      });
    }
  }

  try {
    const appleUid = await syncEventToAppleCalendar(supabase, user.id, event.id, {
      summary: `${packageLabelText} · ${clientName}`,
      description: calendarDescription,
      date: eventDate,
      startTime: eventStartTime,
      endTime: eventEndTime,
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

  return NextResponse.json({ id: event.id, clientAccessToken: event.client_access_token });
}
