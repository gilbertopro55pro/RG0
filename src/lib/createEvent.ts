import type { SupabaseClient } from "@supabase/supabase-js";
import { PACKAGE_FLOWS, PACKAGE_LABELS, type PackageType } from "@/lib/stages";
import { GoogleCalendarDisconnectedError, syncEventToGoogleCalendar, updateEventInGoogleCalendar } from "@/lib/googleCalendarSync";
import { syncEventToAppleCalendar } from "@/lib/appleCalendarSync";
import type { CustomPackageRow, CustomPackageStageRow, EventRow } from "@/lib/types";
import { eventsConflict } from "@/lib/eventTime";
import { calendarEventTitle } from "@/lib/eventDisplayName";

export type CreateEventParams = {
  photographerId: string;
  clientName: string;
  eventType?: string | null;
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
  // Set when this event originates from the calendar-import scan (an existing raw calendar entry
  // the photographer had already color-coded, found with no matching app event yet) — the calendar
  // side effect below then updates that SAME calendar event in place (recoloring it to the normal
  // app-synced color) instead of creating a brand new one, which would leave a duplicate behind.
  sourceGoogleCalendarEventId?: string | null;
};

export type CreateEventResult =
  | { ok: true; event: EventRow; googleCalendarSynced: boolean }
  | { ok: false; status: number; error: string };

// The actual "create an event + every side effect that goes with it" logic, shared between the
// authenticated new-event form (src/app/api/events/route.ts) and the public, admin-gated
// quote-approval questionnaire (src/app/api/quotes/[token]/submit-questionnaire/route.ts) — both
// need the exact same event_payments/gallery/event_stages/calendar-sync/notification chain, and
// letting them drift into two separate copies is how one of them quietly falls behind the other.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createEventWithSideEffects(supabase: SupabaseClient<any>, params: CreateEventParams): Promise<CreateEventResult> {
  const {
    photographerId,
    clientName,
    eventType,
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
    sourceGoogleCalendarEventId,
  } = params;

  if (!clientName || !eventDate || (!pkg && !customPackageId) || (pkg && !PACKAGE_FLOWS[pkg])) {
    return { ok: false, status: 400, error: "שדות חובה חסרים" };
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
    // A package with zero saved stages is valid (see CustomPackagesSettings.tsx's own comment) —
    // only an actual fetch failure (cp/cs null) is an error; an empty cs is just a package with no
    // process steps yet, which produces an event with an empty event_stages list below, not a
    // blocked creation.
    if (!cp || !cs) {
      return { ok: false, status: 400, error: "החבילה המותאמת אישית לא נמצאה" };
    }
    customPackage = cp;
    customStages = cs;
  }

  const packageLabelText = customPackage ? customPackage.name : PACKAGE_LABELS[pkg!];

  const { data: sameDateEvents } = await supabase
    .from("events")
    .select("id, client_name, event_start_time, event_end_time")
    .eq("photographer_id", photographerId)
    .eq("event_date", eventDate)
    .returns<{ id: string; client_name: string; event_start_time: string | null; event_end_time: string | null }[]>();

  const conflicting = (sameDateEvents ?? []).find((e) =>
    eventsConflict({ start: eventStartTime, end: eventEndTime }, { start: e.event_start_time, end: e.event_end_time })
  );
  if (conflicting) {
    return { ok: false, status: 409, error: `כבר קיים אירוע בתאריך זה (${conflicting.client_name}).` };
  }

  const { data: event, error: insertError } = await supabase
    .from("events")
    .insert({
      photographer_id: photographerId,
      client_name: clientName,
      event_type: eventType?.trim() || null,
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
    .single<EventRow>();

  if (insertError || !event) {
    return { ok: false, status: 500, error: insertError?.message ?? "שגיאה ביצירת האירוע" };
  }

  await supabase.from("event_payments").insert({
    event_id: event.id,
    deposit_amount: deposit,
    balance_amount: balance,
    balance_due_date: eventDate,
  });

  // Auto-provision the gallery the moment the event is booked — same client name and phone,
  // nothing left for the photographer to retype later in a separate "new gallery" step.
  // expiry_days (not the old expiry_months, which a later migration's plan-gated check trigger
  // never accepts as a substitute — see enforce_gallery_expiry_by_plan) is the field that trigger
  // actually validates; omitting it made this insert fail silently on every single event created
  // since that migration shipped. 30 matches NewGalleryModal.tsx's own default and is valid on
  // every plan tier.
  const { error: galleryError } = await supabase.from("galleries").insert({
    event_id: event.id,
    photographer_id: photographerId,
    title: clientName,
    // Not customized yet — the gallery's title stays synced to this event's client_name (see
    // EditEventModal.tsx's save handler) until the photographer explicitly retypes it in gallery
    // settings, at which point it's frozen and future event renames stop touching it.
    title_customized: false,
    client_phone: clientPhone || null,
    expiry_days: 30,
    allow_downloads: true,
  });
  if (galleryError) {
    await supabase.from("event_notifications").insert({
      event_id: event.id,
      text: `יצירת הגלריה האוטומטית נכשלה (${galleryError.message}) — אפשר ליצור גלריה ידנית לאירוע דרך עמוד הגלריות.`,
    });
  }

  if (paymentReminderDate) {
    await supabase.from("scheduled_messages").insert({
      event_id: event.id,
      kind: "payment_reminder",
      send_at: new Date(`${paymentReminderDate}T09:00:00`).toISOString(),
    });
  }

  // event_closing (always stage index 0) used to be auto-marked done the instant the event row
  // existed — promoted to everyone (was admin-only while the contract flow itself was admin-only,
  // per the standing "עדכון אדמין" staged-rollout process): it now stays open for every
  // photographer until the client signs a contract or the photographer sends the opening
  // WhatsApp message, matching the contract step now being available to all of them too.
  const stageRows = customPackage
    ? customStages.map((cs, i) => ({
        event_id: event.id,
        stage_key: null as string | null,
        custom_stage_id: cs.id as string | null,
        stage_order: i,
        done: false,
        done_at: null,
      }))
    : PACKAGE_FLOWS[pkg!].map((stageKey, i) => ({
        event_id: event.id,
        stage_key: stageKey as string | null,
        custom_stage_id: null as string | null,
        stage_order: i,
        done: false,
        done_at: null,
      }));
  await supabase.from("event_stages").insert(stageRows);

  const formattedDate = new Date(eventDate).toLocaleDateString("he-IL");
  const timeRangeText = eventStartTime ? ` · ${eventStartTime.slice(0, 5)}${eventEndTime ? `-${eventEndTime.slice(0, 5)}` : ""}` : "";
  const calendarDescription =
    `${packageLabelText} · ${clientName}\n` +
    `תאריך: ${formattedDate}${timeRangeText}\n` +
    `מקדמה: ₪${deposit} · יתרה לתשלום: ₪${balance}\n` +
    `לקוח/ה: ${clientName} · טלפון: ${clientPhone || "לא הוזן"}\n` +
    `שעת צילומי משפחה: ${arrivalTime || "יעודכן"}` +
    (notes?.trim() ? `\nהערות: ${notes.trim()}` : "");

  const notifications = [{ event_id: event.id, text: "האירוע נסגר במערכת" }];
  if (!galleryError) {
    notifications.push({ event_id: event.id, text: "גלריה נוצרה אוטומטית עבור האירוע" });
  }

  if (!clientPhone) {
    notifications.push({ event_id: event.id, text: "לא הוזן טלפון לקוח — לא נשלחה הודעת וואטסאפ" });
  }

  let googleCalendarSynced = false;
  try {
    const calendarEvent = sourceGoogleCalendarEventId
      ? await updateEventInGoogleCalendar(supabase, photographerId, sourceGoogleCalendarEventId, {
          summary: calendarEventTitle({ client_name: clientName, event_type: eventType, event_location: eventLocation }),
          description: calendarDescription,
          date: eventDate,
          startTime: eventStartTime,
          endTime: eventEndTime,
          recolorToSynced: true,
        })
      : await syncEventToGoogleCalendar(supabase, photographerId, {
          summary: calendarEventTitle({ client_name: clientName, event_type: eventType, event_location: eventLocation }),
          description: calendarDescription,
          date: eventDate,
          startTime: eventStartTime,
          endTime: eventEndTime,
        });
    if (calendarEvent) {
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
        googleCalendarSynced = true;
        notifications.push({ event_id: event.id, text: `האירוע נוסף ליומן Google שלך: ${calendarEvent.htmlLink}` });
      }
    } else {
      notifications.push({
        event_id: event.id,
        text: "היומן שלך לא מחובר ל-Google — אפשר לחבר אותו בהגדרות כדי לסנכרן אירועים אוטומטית",
      });
    }
  } catch (e) {
    if (e instanceof GoogleCalendarDisconnectedError) {
      notifications.push({ event_id: event.id, text: "החיבור ליומן Google פג תוקף — יש להתחבר מחדש בהגדרות" });
    } else {
      const rawError = e instanceof Error ? e.message : "שגיאה לא ידועה";
      notifications.push({ event_id: event.id, text: `שגיאה בהוספת האירוע ליומן Google: ${rawError}` });
    }
  }

  try {
    const appleUid = await syncEventToAppleCalendar(supabase, photographerId, event.id, {
      summary: calendarEventTitle({ client_name: clientName, event_type: eventType, event_location: eventLocation }),
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

  return { ok: true, event, googleCalendarSynced };
}
