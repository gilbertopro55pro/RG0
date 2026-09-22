import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  deleteEventFromGoogleCalendar,
  GoogleCalendarDisconnectedError,
  syncEventToGoogleCalendar,
  updateEventInGoogleCalendar,
} from "@/lib/googleCalendarSync";
import { deleteEventFromAppleCalendar, syncEventToAppleCalendar, updateEventInAppleCalendar } from "@/lib/appleCalendarSync";
import { PACKAGE_FLOWS, packageLabel, type PackageType } from "@/lib/stages";
import { reconcileEventStages } from "@/lib/reconcileEventStages";
import { calendarEventTitle } from "@/lib/eventDisplayName";
import type { CustomPackageRow, CustomPackageStageRow, EventRow } from "@/lib/types";
import { eventsConflict } from "@/lib/eventTime";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
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
    eventType,
    clientPhone,
    eventDate,
    eventStartTime,
    eventEndTime,
    eventLocation,
    arrivalTime,
    notes,
    pkg,
    customPackageId,
    allowDoubleBooking,
  }: {
    clientName: string;
    eventType?: string | null;
    clientPhone: string;
    eventDate: string;
    eventStartTime: string | null;
    eventEndTime: string | null;
    eventLocation: string;
    arrivalTime: string;
    notes: string;
    // Both undefined = the caller didn't send package info (older client) — leave it alone.
    pkg?: PackageType | null;
    customPackageId?: string | null;
    allowDoubleBooking?: boolean;
  } = body;

  if (!clientName || !eventDate) {
    return NextResponse.json({ error: "שדות חובה חסרים" }, { status: 400 });
  }

  // RLS (events_all_own) already scopes this select to the owning photographer.
  const { data: existing } = await supabase
    .from("events")
    .select("*, custom_packages(name)")
    .eq("id", eventId)
    .single<EventRow & { custom_packages: { name: string } | null }>();

  if (!existing) {
    return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });
  }

  const { data: sameDateEvents } = await supabase
    .from("events")
    .select("id, client_name, event_start_time, event_end_time")
    .eq("photographer_id", user.id)
    .eq("event_date", eventDate)
    .neq("id", eventId)
    .returns<{ id: string; client_name: string; event_start_time: string | null; event_end_time: string | null }[]>();

  const conflicting = (sameDateEvents ?? []).find((e) =>
    eventsConflict({ start: eventStartTime, end: eventEndTime }, { start: e.event_start_time, end: e.event_end_time })
  );

  if (conflicting && !allowDoubleBooking) {
    return NextResponse.json(
      {
        conflict: true,
        error: `כבר קיים אירוע בתאריך זה (${conflicting.client_name}). אפשר לשמור בכל זאת.`,
      },
      { status: 409 }
    );
  }

  // Package change after the event already exists: the events row flips its package (xor
  // package/custom_package_id — both set in ONE update), and event_stages is reconciled to the new
  // package's flow below. Validated up front so a bad/foreign package id fails before anything is
  // written.
  const newPkg: PackageType | null = pkg !== undefined || customPackageId !== undefined ? (customPackageId ? null : (pkg ?? null)) : existing.package;
  const newCustomId: string | null = pkg !== undefined || customPackageId !== undefined ? (customPackageId ?? null) : existing.custom_package_id;
  const packageChanged = newPkg !== existing.package || newCustomId !== existing.custom_package_id;
  let newCustomPackage: CustomPackageRow | null = null;
  let newCustomStages: CustomPackageStageRow[] = [];
  if (packageChanged) {
    if ((newPkg && newCustomId) || (!newPkg && !newCustomId) || (newPkg && !PACKAGE_FLOWS[newPkg])) {
      return NextResponse.json({ error: "חבילה לא תקינה" }, { status: 400 });
    }
    if (newCustomId) {
      const [{ data: cp }, { data: cs }] = await Promise.all([
        supabase.from("custom_packages").select("*").eq("id", newCustomId).maybeSingle<CustomPackageRow>(),
        supabase.from("custom_package_stages").select("*").eq("package_id", newCustomId).order("sort_order", { ascending: true }).returns<CustomPackageStageRow[]>(),
      ]);
      if (!cp || !cs) return NextResponse.json({ error: "החבילה המותאמת אישית לא נמצאה" }, { status: 400 });
      newCustomPackage = cp;
      newCustomStages = cs;
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("events")
    .update({
      client_name: clientName,
      ...(packageChanged ? { package: newPkg, custom_package_id: newCustomId } : {}),
      // undefined = the caller didn't send it (older client), so leave the stored value alone.
      ...(eventType !== undefined ? { event_type: eventType?.trim() || null } : {}),
      client_phone: clientPhone || null,
      event_date: eventDate,
      event_start_time: eventStartTime || null,
      event_end_time: eventEndTime || null,
      event_location: eventLocation || null,
      arrival_time: arrivalTime || null,
      notes: notes || null,
      // Any saved edit — regardless of which fields actually changed — is what "reviewing" a
      // bulk-imported event means; clears the calendar-scan quick-add highlight for good.
      needs_review: false,
    })
    .eq("id", eventId)
    .select()
    .single<EventRow>();

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? "שגיאה בעדכון האירוע" }, { status: 500 });
  }

  const notifications = [{ event_id: eventId, text: "פרטי האירוע עודכנו" }];

  const oldPackageLabel = packageLabel(existing.package, existing.custom_packages?.name);
  const currentCustomName = packageChanged ? (newCustomPackage?.name ?? null) : (existing.custom_packages?.name ?? null);
  const label = packageLabel(updated.package, currentCustomName);

  if (packageChanged) {
    try {
      const summaryText = await reconcileEventStages(supabase, eventId, newPkg, newCustomStages);
      notifications.push({ event_id: eventId, text: `חבילת האירוע שונתה מ"${oldPackageLabel}" ל"${label}" — ${summaryText}` });
    } catch (e) {
      // Put the package back so the event never ends up on one package with another's stages.
      await supabase.from("events").update({ package: existing.package, custom_package_id: existing.custom_package_id }).eq("id", eventId);
      return NextResponse.json({ error: `שינוי החבילה נכשל: ${e instanceof Error ? e.message : "שגיאה לא ידועה"}` }, { status: 500 });
    }
  }

  // Keeps the linked gallery's title following the event's client name — but only while the
  // photographer has never explicitly retyped it in gallery settings (title_customized), per
  // explicit request: renaming the event should never touch a gallery title someone deliberately
  // set on purpose.
  if (clientName !== existing.client_name) {
    await supabase
      .from("galleries")
      .update({ title: clientName })
      .eq("event_id", eventId)
      .eq("title_customized", false);
  }

  const formattedDate = new Date(eventDate).toLocaleDateString("he-IL");
  const timeRangeText = eventStartTime
    ? ` · ${eventStartTime.slice(0, 5)}${eventEndTime ? `-${eventEndTime.slice(0, 5)}` : ""}`
    : "";
  const summary = calendarEventTitle({ client_name: clientName, event_type: updated.event_type, event_location: eventLocation });
  const description =
    `${label} · ${clientName}\n` +
    `תאריך: ${formattedDate}${timeRangeText}\n` +
    `לקוח/ה: ${clientName} · טלפון: ${clientPhone || "לא הוזן"}\n` +
    `שעת צילומי משפחה: ${arrivalTime || "יעודכן"}` +
    (notes?.trim() ? `\nהערות: ${notes.trim()}` : "");

  let googleCalendarError: string | null = null;
  let googleCalendarDisconnected = false;
  try {
    if (existing.google_calendar_event_id) {
      await updateEventInGoogleCalendar(supabase, user.id, existing.google_calendar_event_id, {
        summary,
        description,
        date: eventDate,
        startTime: eventStartTime,
        endTime: eventEndTime,
      });
      notifications.push({ event_id: eventId, text: "האירוע עודכן גם ביומן Google" });
    } else {
      // No calendar link on record (e.g. the original sync silently failed, or the calendar was
      // connected after this event was created) — create one now instead of leaving it orphaned.
      const calendarEvent = await syncEventToGoogleCalendar(supabase, user.id, {
        summary,
        description,
        date: eventDate,
        startTime: eventStartTime,
        endTime: eventEndTime,
      });
      if (calendarEvent) {
        await supabase.from("events").update({ google_calendar_event_id: calendarEvent.id }).eq("id", eventId);
        notifications.push({ event_id: eventId, text: `האירוע נוסף ליומן Google שלך: ${calendarEvent.htmlLink}` });
      }
    }
  } catch (e) {
    if (e instanceof GoogleCalendarDisconnectedError) {
      googleCalendarDisconnected = true;
      googleCalendarError = "החיבור ליומן Google פג תוקף. יש להתחבר מחדש בהגדרות כדי להמשיך לסנכרן אירועים.";
      notifications.push({ event_id: eventId, text: "החיבור ליומן Google פג תוקף — יש להתחבר מחדש בהגדרות" });
    } else {
      googleCalendarError = e instanceof Error ? e.message : "שגיאה לא ידועה";
      notifications.push({ event_id: eventId, text: `שגיאה בעדכון האירוע ביומן Google: ${googleCalendarError}` });
    }
  }

  try {
    if (existing.apple_calendar_event_uid) {
      await updateEventInAppleCalendar(supabase, user.id, existing.apple_calendar_event_uid, {
        summary,
        description,
        date: eventDate,
        startTime: eventStartTime,
        endTime: eventEndTime,
      });
      notifications.push({ event_id: eventId, text: "האירוע עודכן גם ביומן Apple" });
    } else {
      const appleUid = await syncEventToAppleCalendar(supabase, user.id, eventId, {
        summary,
        description,
        date: eventDate,
        startTime: eventStartTime,
        endTime: eventEndTime,
      });
      if (appleUid) {
        await supabase.from("events").update({ apple_calendar_event_uid: appleUid }).eq("id", eventId);
        notifications.push({ event_id: eventId, text: "האירוע נוסף גם ליומן Apple שלך" });
      }
    }
  } catch (e) {
    const appleError = e instanceof Error ? e.message : "שגיאה לא ידועה";
    notifications.push({ event_id: eventId, text: `שגיאה בעדכון האירוע ביומן Apple: ${appleError}` });
  }

  await supabase.from("event_notifications").insert(notifications);

  return NextResponse.json({ event: updated, googleCalendarError, googleCalendarDisconnected });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  // RLS (events_all_own) already scopes this select to the owning photographer.
  const { data: event } = await supabase
    .from("events")
    .select("id, google_calendar_event_id, apple_calendar_event_uid")
    .eq("id", eventId)
    .single<{ id: string; google_calendar_event_id: string | null; apple_calendar_event_uid: string | null }>();

  if (!event) {
    return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });
  }

  let googleCalendarError: string | null = null;
  let googleCalendarDisconnected = false;
  if (event.google_calendar_event_id) {
    try {
      await deleteEventFromGoogleCalendar(supabase, user.id, event.google_calendar_event_id);
    } catch (e) {
      // Best-effort — don't block deleting the event from our system if Google's side fails,
      // but surface it in the response so the UI can tell the photographer to remove it manually.
      if (e instanceof GoogleCalendarDisconnectedError) {
        googleCalendarDisconnected = true;
        googleCalendarError = "החיבור ליומן Google פג תוקף. יש להתחבר מחדש בהגדרות.";
      } else {
        googleCalendarError = e instanceof Error ? e.message : "שגיאה לא ידועה";
      }
    }
  }

  let appleCalendarError: string | null = null;
  if (event.apple_calendar_event_uid) {
    try {
      await deleteEventFromAppleCalendar(supabase, user.id, event.apple_calendar_event_uid);
    } catch (e) {
      appleCalendarError = e instanceof Error ? e.message : "שגיאה לא ידועה";
    }
  }

  const { error: deleteError } = await supabase.from("events").delete().eq("id", eventId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, googleCalendarError, googleCalendarDisconnected, appleCalendarError });
}
