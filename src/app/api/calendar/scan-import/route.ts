import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listSyncedCalendarEvents, updateEventInGoogleCalendar } from "@/lib/googleCalendarSync";
import { createEventWithSideEffects } from "@/lib/createEvent";
import type { ScanCandidate } from "@/components/ScanCandidateCard";
import { packageLabel, type PackageType } from "@/lib/stages";
import { calendarEventTitle } from "@/lib/eventDisplayName";
import type { SupabaseClient } from "@supabase/supabase-js";

// The only forward-looking windows the UI offers (1/3/6/12 months) — anything else falls back to
// the default rather than letting an arbitrary query param blow the scan window wide open.
const ALLOWED_SCAN_MONTHS = [1, 3, 6, 12];
const DEFAULT_SCAN_MONTHS = 1;

// Best-effort only — a raw calendar entry the photographer typed by hand has no structured
// payment fields, so this just looks for "מקדמה"/"יתרה" followed within a short distance by a
// number. Missing or wrong matches are expected; every field stays reviewable before/after saving.
function parseAmount(description: string | undefined, label: string): number | null {
  if (!description) return null;
  const match = description.match(new RegExp(`${label}[^0-9]{0,15}([0-9][0-9,]*)`));
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Best-effort, same spirit as parseAmount above: looks for an Israeli phone number (mobile 05X or
// landline 0[2/3/4/8/9]/07X, local "0..." or international "+972.../972...") anywhere in the
// free-text description, with an optional label before it ("טלפון"/"נייד"/"פלאפון"/"טל'"). When
// found, it's pulled OUT of the description entirely and normalized to the local 0-prefixed form
// — the photographer asked for it to land in the client-phone field instead of sitting duplicated
// in the notes text.
//
// A number pasted in from a phone's own Contacts/Messages app often carries invisible
// bidi-formatting marks around it (LRM/RLM/embedding/isolate characters) and uses a non-breaking
// hyphen — or an en/em dash — between digit groups instead of a plain "-" (confirmed against a
// real calendar entry: "+972 50‑736‑4797", U+2011 = non-breaking hyphen). Stripping the
// former and widening the separator class for the latter matches the number a person actually
// sees, not just its plain-ASCII rendering.
const BIDI_FORMATTING_CHARS = /[​-‏‪-‮⁦-⁩﻿]/g;
const PHONE_SEPARATOR = "[-\\u2010\\u2011\\u2012\\u2013\\u2014\\u2015.\\s]";
const PHONE_RE = new RegExp(
  `(?:טלפון|נייד|פלאפון|טל['׳]?|tel|phone)?\\s*[:\\-]?\\s*((?:\\+?972${PHONE_SEPARATOR}?|0)(?:[23489]|5[0-9]|7[2-9])${PHONE_SEPARATOR}?\\d{3}${PHONE_SEPARATOR}?\\d{4})(?!\\d)`,
  "i"
);

// For the "already saved" duplicate check below — trims/collapses whitespace so trivial
// formatting differences (an extra space, trailing whitespace) between how the calendar entry's
// summary reads and how the client's name was actually typed into an existing event don't defeat
// an otherwise-real match.
function normalizeForMatch(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function extractPhone(description: string | undefined): { phone: string | null; remainingDescription: string } {
  const raw = description ?? "";
  if (!raw) return { phone: null, remainingDescription: raw };
  const text = raw.replace(BIDI_FORMATTING_CHARS, "");
  const match = text.match(PHONE_RE);
  if (!match) return { phone: null, remainingDescription: text };
  let digits = match[1].replace(/\D/g, "");
  if (digits.startsWith("972")) digits = `0${digits.slice(3)}`;
  if (digits.length !== 9 && digits.length !== 10) return { phone: null, remainingDescription: text };
  const phone = digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : `${digits.slice(0, 2)}-${digits.slice(2)}`;
  const remainingDescription = text
    .replace(match[0], "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { phone, remainingDescription };
}

// Calendar entries the app itself wrote (createEvent / event edit) carry a generated description:
// "…\nלקוח/ה: X · טלפון: P\nשעת צילומי משפחה: T\nהערות: N". Syncing that text back as the
// event's notes would nest the whole block inside the notes, one level deeper on every sync, so
// only the real values are pulled out of it.
function parseAppDescription(description: string | undefined): { phone: string | null; arrivalTime: string; notes: string } | null {
  const text = (description ?? "").replace(BIDI_FORMATTING_CHARS, "");
  if (!/שעת צילומי משפחה:/.test(text)) return null;
  const phone = text.match(/טלפון:\s*([0-9+][0-9\-\s]{6,})/)?.[1]?.trim() ?? null;
  const arrivalTime = text.match(/שעת צילומי משפחה:\s*(\d{1,2}:\d{2})/)?.[1] ?? "";
  const notesIndex = text.indexOf("\nהערות: ");
  const notes = notesIndex >= 0 ? text.slice(notesIndex + "\nהערות: ".length).trim() : "";
  return { phone, arrivalTime, notes };
}

export async function GET(request: Request) {
  const requestedMonths = Number(new URL(request.url).searchParams.get("months"));
  const scanMonths = ALLOWED_SCAN_MONTHS.includes(requestedMonths) ? requestedMonths : DEFAULT_SCAN_MONTHS;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { data: photographer } = await supabase
    .from("photographers")
    .select("google_calendar_connected, google_calendar_import_color_id")
    .eq("id", user.id)
    .single<{ google_calendar_connected: boolean; google_calendar_import_color_id: string | null }>();

  if (!photographer?.google_calendar_connected) {
    return NextResponse.json({ error: "יומן Google לא מחובר. יש לחבר אותו בהגדרות" }, { status: 400 });
  }
  if (!photographer.google_calendar_import_color_id) {
    return NextResponse.json({ error: "יש לבחור בהגדרות באיזה צבע ביומן מסומנים אירועים לייבוא" }, { status: 400 });
  }

  // Starts from the moment of the scan itself, not some fixed lookback — a candidate that already
  // happened before today isn't something to surface as a fresh booking to add.
  const timeMin = new Date().toISOString();
  const timeMaxDate = new Date();
  timeMaxDate.setMonth(timeMaxDate.getMonth() + scanMonths);
  const timeMax = timeMaxDate.toISOString();

  let calendarEvents;
  try {
    calendarEvents = await listSyncedCalendarEvents(supabase, user.id, { timeMin, timeMax });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "שגיאה בטעינת היומן" }, { status: 500 });
  }
  if (!calendarEvents) {
    return NextResponse.json({ error: "יומן Google לא מחובר. יש לחבר אותו בהגדרות" }, { status: 400 });
  }

  // Calendar entries already linked to an app event (created by the app, or imported by an earlier
  // scan) are shown too, flagged as existing and unselected, so the photographer can pull a
  // calendar edit back into the event (owner's request, 2026-09-27). They used to be hidden, and
  // since the app colors them with the synced color they never matched the import color anyway.
  const { data: linkedEvents } = await supabase
    .from("events")
    .select("id, google_calendar_event_id")
    .eq("photographer_id", user.id)
    .not("google_calendar_event_id", "is", null)
    .returns<{ id: string; google_calendar_event_id: string }[]>();
  const eventIdByCalendarId = new Map((linkedEvents ?? []).map((e) => [e.google_calendar_event_id, e.id] as const));

  const candidates = calendarEvents.filter(
    (e) => e.colorId === photographer.google_calendar_import_color_id || eventIdByCalendarId.has(e.id)
  );
  if (candidates.length === 0) {
    return NextResponse.json({ candidates: [] });
  }

  // Separately excludes a candidate that already has a matching event saved in the system even
  // WITHOUT a calendar link — e.g. the photographer typed it in manually (via the plain new-event
  // form) before ever running a scan, so google_calendar_event_id was never set. Matched on the
  // same date + a normalized client name, scoped to just the scan's own window rather than every
  // event ever, since that's the only range a candidate could possibly collide with. Also pulls
  // start/end time for the SEPARATE same-slot-collision check below (not a duplicate check).
  const { data: existingEvents } = await supabase
    .from("events")
    .select("id, event_date, client_name, event_start_time, event_end_time")
    .eq("photographer_id", user.id)
    .gte("event_date", timeMin.slice(0, 10))
    .lte("event_date", timeMax.slice(0, 10))
    .returns<{ id: string; event_date: string; client_name: string; event_start_time: string | null; event_end_time: string | null }[]>();
  // Since 2026-09-27 a match is no longer hidden: it's shown flagged "already in the system" and
  // syncing it updates that event instead of creating a duplicate (owner's request).
  const existingByDateName = new Map(
    (existingEvents ?? []).map((e) => [`${e.event_date}|${normalizeForMatch(e.client_name)}`, e] as const)
  );
  const existingById = new Map((existingEvents ?? []).map((e) => [e.id, e] as const));
  // A photographer can legitimately have two DIFFERENT real bookings at the exact same date and
  // time — a second (freelance) photographer covering one of them while they're at the other.
  // That's NOT a duplicate to hide (see existingDateNameKeys above, which only matches on name)
  // — but it IS worth flagging, since it's exactly the situation the "שליחת צלם פרילנס מטעמך"
  // checkbox exists for. Only counts a slot when both times are actually set — comparing two
  // "no time entered" events would just be noise.
  const slotOf = (date: string, start: string | null, end: string | null) => (start && end ? `${date}|${start.slice(0, 5)}|${end.slice(0, 5)}` : null);
  const existingSlotCounts = new Map<string, number>();
  for (const e of existingEvents ?? []) {
    const key = slotOf(e.event_date, e.event_start_time, e.event_end_time);
    if (key) existingSlotCounts.set(key, (existingSlotCounts.get(key) ?? 0) + 1);
  }

  const results = candidates
    .map((e) => {
      const eventDate = (e.start.dateTime ?? e.start.date ?? "").slice(0, 10);
      const eventStartTime = e.start.dateTime ? e.start.dateTime.slice(11, 16) : null;
      const eventEndTime = e.end.dateTime ? e.end.dateTime.slice(11, 16) : null;
      const appFormat = parseAppDescription(e.description);
      const { phone: parsedPhone, remainingDescription } = appFormat ? { phone: null, remainingDescription: "" } : extractPhone(e.description);
      return {
        calendarEventId: e.id,
        summary: e.summary ?? "",
        description: appFormat ? appFormat.notes : remainingDescription,
        location: e.location ?? "",
        eventDate,
        eventStartTime,
        eventEndTime,
        arrivalTime: appFormat?.arrivalTime ?? "",
        deposit: appFormat ? null : parseAmount(e.description, "מקדמה"),
        balance: appFormat ? null : parseAmount(e.description, "יתרה"),
        clientPhone: appFormat ? appFormat.phone : parsedPhone,
        pkg: "full",
      };
    })
    .filter((r) => r.eventDate)
    .map((r) => {
      const linkedId = eventIdByCalendarId.get(r.calendarEventId);
      const existing = (linkedId ? existingById.get(linkedId) : undefined) ?? existingByDateName.get(`${r.eventDate}|${normalizeForMatch(r.summary)}`);
      return {
        ...r,
        existingEventId: linkedId ?? existing?.id ?? null,
        existingSlot: existing ? slotOf(existing.event_date, existing.event_start_time, existing.event_end_time) : null,
      };
    });

  // Second pass for the same-slot flag — needs the final `results` list itself, so two DIFFERENT
  // scanned candidates sharing an exact date+time (not just a candidate vs. an existing event) are
  // caught too, matching how this can show up entirely fresh in one scan, not just against
  // something already saved.
  const timeSlotCounts = new Map<string, number>();
  for (const r of results) {
    if (!r.eventStartTime || !r.eventEndTime || r.existingEventId) continue;
    const key = `${r.eventDate}|${r.eventStartTime}|${r.eventEndTime}`;
    timeSlotCounts.set(key, (timeSlotCounts.get(key) ?? 0) + 1);
  }
  const finalResults = results.map(({ existingSlot, ...r }) => {
    const key = slotOf(r.eventDate, r.eventStartTime, r.eventEndTime);
    // An event already in the system never collides with itself.
    const existingInSlot = key ? (existingSlotCounts.get(key) ?? 0) - (existingSlot === key ? 1 : 0) : 0;
    const hasScheduleCollision = !r.existingEventId && !!key && (existingInSlot > 0 || (timeSlotCounts.get(key) ?? 0) > 1);
    return { ...r, hasScheduleCollision, isFreelance: false };
  });

  return NextResponse.json({ candidates: finalResults });
}

// Bulk quick-add: creates a real event per selected candidate with no per-event review form (the
// package defaults to "full" on the results screen, same as a blank new-event form's own default,
// but is editable there before confirming) — the client already has the exact candidate data from
// the GET scan just run, so it's sent back here rather than re-fetched from Google. Each created
// event is flagged needs_review so it stands out on the events list until the photographer opens
// and saves an edit on it.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { candidates }: { candidates: ScanCandidate[] } = await request.json();
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return NextResponse.json({ error: "לא נבחרו אירועים" }, { status: 400 });
  }

  // Re-checked here (not just trusted from the earlier GET) in case the results being confirmed
  // are stale — e.g. a previous bulk-add already imported one of these since the scan ran. A
  // candidate linked to an app event updates that event (the calendar is where it was edited).
  const { data: linkedEvents } = await supabase
    .from("events")
    .select(EXISTING_FIELDS)
    .eq("photographer_id", user.id)
    .in("google_calendar_event_id", candidates.map((c) => c.calendarEventId))
    .returns<ExistingEvent[]>();
  const linkedByCalendarId = new Map((linkedEvents ?? []).map((e) => [e.google_calendar_event_id!, e] as const));

  // Same "already saved without a calendar link" re-check as the GET route's own dedup (same
  // reasoning: the results being confirmed here could be stale) — scoped to just the confirmed
  // candidates' own date range.
  const candidateDates = candidates.map((c) => c.eventDate).sort();
  const { data: existingEvents } = await supabase
    .from("events")
    .select(EXISTING_FIELDS)
    .eq("photographer_id", user.id)
    .gte("event_date", candidateDates[0])
    .lte("event_date", candidateDates[candidateDates.length - 1])
    .returns<ExistingEvent[]>();
  const existingByDateName = new Map(
    (existingEvents ?? []).map((e) => [`${e.event_date}|${normalizeForMatch(e.client_name)}`, e] as const)
  );

  let created = 0;
  const updated: string[] = [];
  const failed: { summary: string; error: string }[] = [];

  // Sequential, not parallel — createEventWithSideEffects's own same-day conflict check queries
  // the events table fresh each call, so two candidates that conflict with each other need to run
  // one after the other for the second to correctly see the first's just-created row.
  for (const candidate of candidates) {
    const existing =
      linkedByCalendarId.get(candidate.calendarEventId) ??
      existingByDateName.get(`${candidate.eventDate}|${normalizeForMatch(candidate.summary)}`);
    if (existing) {
      const error = await updateExistingFromCalendar(supabase, user.id, existing, candidate);
      if (error) failed.push({ summary: existing.client_name, error });
      else updated.push(existing.client_name);
      continue;
    }
    const isCustomPkg = candidate.pkg.startsWith("custom:");
    const result = await createEventWithSideEffects(supabase, {
      photographerId: user.id,
      clientName: candidate.summary.trim() || "אירוע מיובא",
      clientPhone: candidate.clientPhone ?? "",
      // The results screen's <select> only ever offers a real PACKAGE_LABELS key or a
      // "custom:<id>" value (same convention NewEventModal uses) — never arbitrary text.
      pkg: isCustomPkg ? null : (candidate.pkg as PackageType),
      customPackageId: isCustomPkg ? candidate.pkg.slice(7) : null,
      eventDate: candidate.eventDate,
      // Coerced to null, not "" — the photographer may have cleared an auto-parsed time on the
      // results screen, and downstream (DB column, Google Calendar sync) expects "no time" as
      // null, same convention as the plain new-event form's own submit.
      eventStartTime: candidate.eventStartTime || null,
      eventEndTime: candidate.eventEndTime || null,
      eventLocation: candidate.location,
      arrivalTime: candidate.arrivalTime || "",
      notes: candidate.description,
      deposit: candidate.deposit ?? 0,
      balance: candidate.balance ?? 0,
      paymentReminderDate: null,
      sourceGoogleCalendarEventId: candidate.calendarEventId,
    });
    if (!result.ok) {
      failed.push({ summary: candidate.summary || "אירוע ללא כותרת", error: result.error });
      continue;
    }
    // contract_skipped: true — there's no per-event contract step in this bulk-import flow (unlike
    // NewEventModal's own wizard, which always ends by creating a contract or explicitly skipping
    // one). Without this, the "סגירת האירוע" stage's own gate (EventDetailView.tsx — only unlocked
    // once a contract is signed OR skipped) stays permanently unsatisfiable for an imported event,
    // since nothing else ever sets either condition — that stage would be stuck un-completable
    // forever, unlike every other stage on the same event.
    await supabase
      .from("events")
      .update({ needs_review: true, contract_skipped: true, is_freelance: !!candidate.isFreelance })
      .eq("id", result.event.id);
    created += 1;
  }

  return NextResponse.json({ created, updated, failed });
}

const EXISTING_FIELDS =
  "id, event_date, client_name, client_phone, event_type, event_location, event_start_time, event_end_time, arrival_time, notes, package, google_calendar_event_id, custom_packages(name)";
type ExistingEvent = {
  id: string;
  event_date: string;
  client_name: string;
  client_phone: string | null;
  event_type: string | null;
  event_location: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  arrival_time: string | null;
  notes: string | null;
  package: PackageType | null;
  google_calendar_event_id: string | null;
  custom_packages: { name: string } | null;
};

// A scanned calendar entry that matches an event already in the system (same date + client name):
// updates that event from the calendar's data instead of creating a duplicate. Only fields the
// calendar actually has a value for are written, so an empty calendar field never erases what the
// photographer typed. Package and payments are never touched (the package drives the event's
// stages, and amounts are money data the scan only guesses at).
async function updateExistingFromCalendar(
  supabase: SupabaseClient,
  photographerId: string,
  existing: ExistingEvent,
  candidate: ScanCandidate
): Promise<string | null> {
  const patch: Record<string, string> = {};
  // Only a linked entry can move the event's date (a name match is by definition the same date).
  const isLinked = existing.google_calendar_event_id === candidate.calendarEventId;
  if (isLinked && candidate.eventDate && candidate.eventDate !== existing.event_date) patch.event_date = candidate.eventDate;
  if (candidate.eventStartTime) patch.event_start_time = candidate.eventStartTime;
  if (candidate.eventEndTime) patch.event_end_time = candidate.eventEndTime;
  if (candidate.location.trim()) patch.event_location = candidate.location.trim();
  if (candidate.clientPhone?.trim()) patch.client_phone = candidate.clientPhone.trim();
  if (candidate.arrivalTime.trim()) patch.arrival_time = candidate.arrivalTime.trim();
  if (candidate.description.trim()) patch.notes = candidate.description.trim();
  if (Object.keys(patch).length) {
    const { error } = await supabase.from("events").update(patch).eq("id", existing.id);
    if (error) return `עדכון האירוע הקיים נכשל: ${error.message}`;
  }
  const merged = { ...existing, ...patch };

  // Same calendar text as editing an event (api/events/[id]).
  const label = packageLabel(merged.package, merged.custom_packages?.name ?? null);
  const startTime = merged.event_start_time?.slice(0, 5) ?? null;
  const endTime = merged.event_end_time?.slice(0, 5) ?? null;
  const summary = calendarEventTitle(merged);
  const description =
    `${label} · ${merged.client_name}\n` +
    `תאריך: ${new Date(merged.event_date).toLocaleDateString("he-IL")}${startTime ? ` · ${startTime}${endTime ? `-${endTime}` : ""}` : ""}\n` +
    `לקוח/ה: ${merged.client_name} · טלפון: ${merged.client_phone || "לא הוזן"}\n` +
    `שעת צילומי משפחה: ${merged.arrival_time || "יעודכן"}` +
    (merged.notes?.trim() ? `\nהערות: ${merged.notes.trim()}` : "");
  const calendarFields = { summary, description, date: merged.event_date, startTime, endTime };
  try {
    if (isLinked) {
      // The scanned entry is the event's own calendar event: rewrite it in the app's format.
      await updateEventInGoogleCalendar(supabase, photographerId, candidate.calendarEventId, { ...calendarFields, recolorToSynced: true });
    } else if (!existing.google_calendar_event_id) {
      // Not on the calendar through the app yet: the scanned entry becomes its calendar event,
      // recolored like any imported event so it stops showing up in scans.
      const linked = await updateEventInGoogleCalendar(supabase, photographerId, candidate.calendarEventId, { ...calendarFields, recolorToSynced: true });
      if (linked) await supabase.from("events").update({ google_calendar_event_id: linked.id }).eq("id", existing.id);
    } else {
      // Already has its own calendar event: update that one, and recolor the scanned entry so it
      // leaves the import color (it's left on the calendar; deleting a calendar entry is the
      // photographer's call).
      await updateEventInGoogleCalendar(supabase, photographerId, existing.google_calendar_event_id, calendarFields);
      await updateEventInGoogleCalendar(supabase, photographerId, candidate.calendarEventId, { ...calendarFields, recolorToSynced: true });
    }
  } catch {
    // The event itself is updated; a calendar failure here isn't worth failing the sync over.
  }
  await supabase.from("event_notifications").insert({ event_id: existing.id, text: "פרטי האירוע עודכנו מסנכרון היומן" });
  return null;
}
