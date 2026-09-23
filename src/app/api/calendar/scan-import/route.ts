import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import { listSyncedCalendarEvents } from "@/lib/googleCalendarSync";
import { createEventWithSideEffects } from "@/lib/createEvent";
import type { ScanCandidate } from "@/components/ScanCandidateCard";
import type { PackageType } from "@/lib/stages";

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
  // Admin-gated for now — this is a brand new, unproven flow (recolors real calendar events and
  // creates real event cards), rolling out to every photographer once it's been used for a while.
  if (user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "התכונה עדיין לא זמינה לחשבון זה" }, { status: 403 });
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

  const candidates = calendarEvents.filter((e) => e.colorId === photographer.google_calendar_import_color_id);
  if (candidates.length === 0) {
    return NextResponse.json({ candidates: [] });
  }

  // Excludes events already linked to a real app event (e.g. from a previous scan) — otherwise
  // every past scan's results would keep reappearing until the photographer manually recolors them.
  const { data: linkedEvents } = await supabase
    .from("events")
    .select("google_calendar_event_id")
    .eq("photographer_id", user.id)
    .not("google_calendar_event_id", "is", null)
    .returns<{ google_calendar_event_id: string }[]>();
  const linkedIds = new Set((linkedEvents ?? []).map((e) => e.google_calendar_event_id));

  // Separately excludes a candidate that already has a matching event saved in the system even
  // WITHOUT a calendar link — e.g. the photographer typed it in manually (via the plain new-event
  // form) before ever running a scan, so google_calendar_event_id was never set. Matched on the
  // same date + a normalized client name, scoped to just the scan's own window rather than every
  // event ever, since that's the only range a candidate could possibly collide with. Also pulls
  // start/end time for the SEPARATE same-slot-collision check below (not a duplicate check).
  const { data: existingEvents } = await supabase
    .from("events")
    .select("event_date, client_name, event_start_time, event_end_time")
    .eq("photographer_id", user.id)
    .gte("event_date", timeMin.slice(0, 10))
    .lte("event_date", timeMax.slice(0, 10))
    .returns<{ event_date: string; client_name: string; event_start_time: string | null; event_end_time: string | null }[]>();
  const existingDateNameKeys = new Set(
    (existingEvents ?? []).map((e) => `${e.event_date}|${normalizeForMatch(e.client_name)}`)
  );
  // A photographer can legitimately have two DIFFERENT real bookings at the exact same date and
  // time — a second (freelance) photographer covering one of them while they're at the other.
  // That's NOT a duplicate to hide (see existingDateNameKeys above, which only matches on name)
  // — but it IS worth flagging, since it's exactly the situation the "שליחת צלם פרילנס מטעמך"
  // checkbox exists for. Only counts a slot when both times are actually set — comparing two
  // "no time entered" events would just be noise.
  const existingTimeSlotKeys = new Set(
    (existingEvents ?? [])
      .filter((e) => e.event_start_time && e.event_end_time)
      .map((e) => `${e.event_date}|${e.event_start_time}|${e.event_end_time}`)
  );

  const results = candidates
    .filter((e) => !linkedIds.has(e.id))
    .map((e) => {
      const eventDate = (e.start.dateTime ?? e.start.date ?? "").slice(0, 10);
      const eventStartTime = e.start.dateTime ? e.start.dateTime.slice(11, 16) : null;
      const eventEndTime = e.end.dateTime ? e.end.dateTime.slice(11, 16) : null;
      const { phone: clientPhone, remainingDescription } = extractPhone(e.description);
      return {
        calendarEventId: e.id,
        summary: e.summary ?? "",
        description: remainingDescription,
        location: e.location ?? "",
        eventDate,
        eventStartTime,
        eventEndTime,
        arrivalTime: "",
        deposit: parseAmount(e.description, "מקדמה"),
        balance: parseAmount(e.description, "יתרה"),
        clientPhone,
        pkg: "full",
      };
    })
    .filter((r) => r.eventDate)
    .filter((r) => !existingDateNameKeys.has(`${r.eventDate}|${normalizeForMatch(r.summary)}`));

  // Second pass for the same-slot flag — needs the final `results` list itself, so two DIFFERENT
  // scanned candidates sharing an exact date+time (not just a candidate vs. an existing event) are
  // caught too, matching how this can show up entirely fresh in one scan, not just against
  // something already saved.
  const timeSlotCounts = new Map<string, number>();
  for (const r of results) {
    if (!r.eventStartTime || !r.eventEndTime) continue;
    const key = `${r.eventDate}|${r.eventStartTime}|${r.eventEndTime}`;
    timeSlotCounts.set(key, (timeSlotCounts.get(key) ?? 0) + 1);
  }
  const finalResults = results.map((r) => {
    const key = r.eventStartTime && r.eventEndTime ? `${r.eventDate}|${r.eventStartTime}|${r.eventEndTime}` : null;
    const hasScheduleCollision = !!key && (existingTimeSlotKeys.has(key) || (timeSlotCounts.get(key) ?? 0) > 1);
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
  if (user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "התכונה עדיין לא זמינה לחשבון זה" }, { status: 403 });
  }

  const { candidates }: { candidates: ScanCandidate[] } = await request.json();
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return NextResponse.json({ error: "לא נבחרו אירועים" }, { status: 400 });
  }

  // Re-checked here (not just trusted from the earlier GET) in case the results being confirmed
  // are stale — e.g. a previous bulk-add already imported one of these since the scan ran.
  const { data: linkedEvents } = await supabase
    .from("events")
    .select("google_calendar_event_id")
    .eq("photographer_id", user.id)
    .not("google_calendar_event_id", "is", null)
    .returns<{ google_calendar_event_id: string }[]>();
  const linkedIds = new Set((linkedEvents ?? []).map((e) => e.google_calendar_event_id));

  // Same "already saved without a calendar link" re-check as the GET route's own dedup (same
  // reasoning: the results being confirmed here could be stale) — scoped to just the confirmed
  // candidates' own date range.
  const candidateDates = candidates.map((c) => c.eventDate).sort();
  const { data: existingEvents } = await supabase
    .from("events")
    .select("event_date, client_name")
    .eq("photographer_id", user.id)
    .gte("event_date", candidateDates[0])
    .lte("event_date", candidateDates[candidateDates.length - 1])
    .returns<{ event_date: string; client_name: string }[]>();
  const existingDateNameKeys = new Set(
    (existingEvents ?? []).map((e) => `${e.event_date}|${normalizeForMatch(e.client_name)}`)
  );

  let created = 0;
  const failed: { summary: string; error: string }[] = [];

  // Sequential, not parallel — createEventWithSideEffects's own same-day conflict check queries
  // the events table fresh each call, so two candidates that conflict with each other need to run
  // one after the other for the second to correctly see the first's just-created row.
  for (const candidate of candidates) {
    if (linkedIds.has(candidate.calendarEventId)) {
      failed.push({ summary: candidate.summary || "אירוע ללא כותרת", error: "כבר יובא בעבר" });
      continue;
    }
    if (existingDateNameKeys.has(`${candidate.eventDate}|${normalizeForMatch(candidate.summary)}`)) {
      failed.push({ summary: candidate.summary || "אירוע ללא כותרת", error: "כבר קיים אירוע תואם במערכת" });
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

  return NextResponse.json({ created, failed });
}
