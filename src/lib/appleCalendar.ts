// Minimal CalDAV client for iCloud Calendar — raw fetch + hand-rolled XML, matching this
// project's convention of no SDK for third-party integrations (Google, WhatsApp, PayPlus, Finbot
// are all done the same way). There's no OAuth for CalDAV: auth is HTTP Basic with an
// app-specific password the user generates at appleid.apple.com, never their real Apple ID
// password.
const CALDAV_BASE = "https://caldav.icloud.com";

function basicAuthHeader(email: string, appPassword: string): string {
  return `Basic ${Buffer.from(`${email}:${appPassword}`).toString("base64")}`;
}

// iCloud's XML responses use inconsistent/arbitrary namespace prefixes (d:, D:, A:, ...) for the
// same elements — stripping every "<prefix:" down to "<" before parsing means every regex below
// only has to match the bare tag name once, regardless of which prefix a given response used.
function stripNamespaces(xml: string): string {
  return xml.replace(/<(\/?)[a-zA-Z0-9]+:/g, "<$1");
}

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1].trim() : null;
}

async function propfind(url: string, auth: string, body: string, depth: "0" | "1"): Promise<string> {
  const res = await fetch(url, {
    method: "PROPFIND",
    headers: {
      Authorization: auth,
      "Content-Type": "application/xml; charset=utf-8",
      Depth: depth,
    },
    body,
  });
  if (!res.ok && res.status !== 207) {
    throw new Error(`CalDAV PROPFIND ${url} failed: ${res.status} ${await res.text()}`);
  }
  return stripNamespaces(await res.text());
}

export type AppleCalendarOption = { url: string; displayName: string };

// Full discovery chain: current-user-principal → calendar-home-set → list of calendar
// collections under it. Returns the calendars the account actually has (excluding the
// synthetic scheduling inbox/outbox collections iCloud also lists there).
export async function discoverAppleCalendars(email: string, appPassword: string): Promise<AppleCalendarOption[]> {
  const auth = basicAuthHeader(email, appPassword);

  const principalXml = await propfind(
    CALDAV_BASE,
    auth,
    `<?xml version="1.0" encoding="utf-8" ?><propfind xmlns="DAV:"><prop><current-user-principal/></prop></propfind>`,
    "0"
  );
  const principalHref = extractTag(principalXml, "href");
  if (!principalHref) throw new Error("לא הצלחנו לאתר את חשבון ה-iCloud. יש לוודא שהמייל וה-App-Specific Password נכונים");

  const homeSetXml = await propfind(
    `${CALDAV_BASE}${principalHref}`,
    auth,
    `<?xml version="1.0" encoding="utf-8" ?><propfind xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><prop><C:calendar-home-set/></prop></propfind>`,
    "0"
  );
  const homeHref = extractTag(homeSetXml, "href");
  if (!homeHref) throw new Error("לא נמצא בית יומנים בחשבון ה-iCloud הזה");

  const listXml = await propfind(
    `${CALDAV_BASE}${homeHref}`,
    auth,
    `<?xml version="1.0" encoding="utf-8" ?><propfind xmlns="DAV:"><prop><resourcetype/><displayname/></prop></propfind>`,
    "1"
  );

  const calendars: AppleCalendarOption[] = [];
  const responseBlocks = listXml.match(/<response>[\s\S]*?<\/response>/g) ?? [];
  for (const block of responseBlocks) {
    const resourcetype = extractTag(block, "resourcetype") ?? "";
    // Real calendars carry <calendar/> in resourcetype; schedule-inbox/outbox carry their own
    // distinct tags there too — excluding those keeps the picker to calendars a user recognizes.
    if (!/<calendar\/?>/i.test(resourcetype) || /schedule-(inbox|outbox)/i.test(resourcetype)) continue;
    const href = extractTag(block, "href");
    const displayName = extractTag(block, "displayname");
    if (href && displayName) calendars.push({ url: `${CALDAV_BASE}${href}`, displayName });
  }

  if (calendars.length === 0) throw new Error("לא נמצאו יומנים בחשבון ה-iCloud הזה");
  return calendars;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// All-day events use VALUE=DATE with an exclusive DTEND (next day), matching the same convention
// used for Google Calendar all-day events elsewhere in this app.
function buildIcs({
  uid,
  summary,
  description,
  date,
  startTime,
  endTime,
}: {
  uid: string;
  summary: string;
  description: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
}): string {
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const dateCompact = date.replace(/-/g, "");
  let dtStart: string;
  let dtEnd: string;

  if (startTime) {
    const [sh, sm] = startTime.split(":");
    const startCompact = `${dateCompact}T${sh}${sm}00`;
    const endSource = endTime ?? startTime;
    const [eh, em] = endSource.split(":");
    dtStart = `DTSTART:${startCompact}`;
    dtEnd = `DTEND:${dateCompact}T${eh}${em}00`;
  } else {
    const end = new Date(`${date}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const endCompact = `${end.getUTCFullYear()}${pad(end.getUTCMonth() + 1)}${pad(end.getUTCDate())}`;
    dtStart = `DTSTART;VALUE=DATE:${dateCompact}`;
    dtEnd = `DTEND;VALUE=DATE:${endCompact}`;
  }

  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//gilberto//photographer-flow//HE",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    dtStart,
    dtEnd,
    `SUMMARY:${escape(summary)}`,
    `DESCRIPTION:${escape(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export async function createOrUpdateAppleCalendarEvent(
  email: string,
  appPassword: string,
  calendarUrl: string,
  event: { uid: string; summary: string; description: string; date: string; startTime?: string | null; endTime?: string | null }
): Promise<void> {
  const auth = basicAuthHeader(email, appPassword);
  const ics = buildIcs(event);
  const resourceUrl = `${calendarUrl}${calendarUrl.endsWith("/") ? "" : "/"}${event.uid}.ics`;
  const res = await fetch(resourceUrl, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "text/calendar; charset=utf-8" },
    body: ics,
  });
  if (!res.ok) {
    throw new Error(`CalDAV event write failed: ${res.status} ${await res.text()}`);
  }
}

export async function deleteAppleCalendarEvent(
  email: string,
  appPassword: string,
  calendarUrl: string,
  uid: string
): Promise<void> {
  const auth = basicAuthHeader(email, appPassword);
  const resourceUrl = `${calendarUrl}${calendarUrl.endsWith("/") ? "" : "/"}${uid}.ics`;
  const res = await fetch(resourceUrl, { method: "DELETE", headers: { Authorization: auth } });
  // 404 means it's already gone — idempotent delete, same convention as the Google client.
  if (!res.ok && res.status !== 404) {
    throw new Error(`CalDAV event deletion failed: ${res.status} ${await res.text()}`);
  }
}
