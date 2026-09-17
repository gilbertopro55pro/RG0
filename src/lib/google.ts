const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  return res.json();
}

// Thrown specifically for "invalid_grant" — Google's own signal that the refresh token itself is
// dead (revoked by the user, password changed, or — the common case for an unverified/"Testing"
// OAuth consent screen — Google auto-expires every refresh token after 7 days regardless of use).
// No amount of retrying fixes this; the photographer has to go through the consent screen again.
// Distinguishing it from a transient network/5xx failure lets callers stop silently re-attempting
// (and re-alerting) on every single save until they actually reconnect.
export class GoogleAuthRevokedError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "GoogleAuthRevokedError";
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    if (detail.includes("invalid_grant")) throw new GoogleAuthRevokedError(detail);
    throw new Error(`Google token refresh failed: ${detail}`);
  }
  return res.json();
}

const CALENDAR_TIME_ZONE = "Asia/Jerusalem";

type CalendarEventTiming = {
  date: string;
  startTime?: string | null; // "HH:MM" or "HH:MM:SS" — omit for an all-day event
  endTime?: string | null;
};

// The Calendar API silently 400s on a dateTime missing seconds (e.g. "18:00" from a native
// <input type="time">, which never includes them) — it needs the full "HH:MM:SS".
function withSeconds(time: string): string {
  return time.length === 5 ? `${time}:00` : time;
}

// Timed events use start/end dateTime + timeZone; all-day events (no times given) use start/end
// date, with end exclusive (next day) per the Calendar API's all-day convention.
function buildEventTiming({ date, startTime, endTime }: CalendarEventTiming) {
  if (!startTime) {
    const endDate = new Date(`${date}T00:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    return { start: { date }, end: { date: endDate.toISOString().slice(0, 10) } };
  }
  const start = { dateTime: `${date}T${withSeconds(startTime)}`, timeZone: CALENDAR_TIME_ZONE };
  // Both cases below produce a dateTime that Google would otherwise reject as "The specified time
  // range is empty" (reported against its own internal timeMax parameter even though this request
  // never sends one — Calendar reuses that error shape for any degenerate/backwards start→end
  // range, not just an explicit list/freebusy query):
  //
  // 1. Missing endTime — used to fall back to the SAME dateTime as start (a zero-duration event).
  //    A known start with no stated end is a completely normal case (the photographer often just
  //    doesn't know the exact end time yet), so this defaults to a 1-hour placeholder duration.
  //
  // 2. endTime given but earlier in the day than startTime — e.g. a wedding running 17:00→00:00.
  //    "00:00" here means midnight at the END of the event (crossing into the next calendar date),
  //    but building it against the SAME `date` as start produced midnight at the very START of
  //    that date instead — before the event even begins. Found live 2026-09-03 as a SEPARATE bug
  //    from the missing-endTime one above (same symptom, different cause): a real event
  //    (17:00–00:00) kept failing to save even after the missing-endTime fix shipped, because this
  //    one has a real, non-missing endTime that's just genuinely earlier-in-day than start.
  //
  // Both are handled the same way: compute the end against a real Date object seeded from start,
  // and if the resulting time-of-day would be <= start's, roll the date forward one day — this is
  // what correctly turns "00:00 same day" into "00:00 the NEXT day" (and also correctly rolls a
  // near-midnight start's +1h placeholder, e.g. 23:30 → 00:30 the next day, not the same one).
  const pad = (n: number) => String(n).padStart(2, "0");
  const formatDateTime = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const startDate = new Date(`${date}T${withSeconds(startTime)}`);
  let endDate: Date;
  if (endTime) {
    endDate = new Date(`${date}T${withSeconds(endTime)}`);
    if (endDate.getTime() <= startDate.getTime()) endDate.setDate(endDate.getDate() + 1);
  } else {
    endDate = new Date(startDate.getTime());
    endDate.setHours(endDate.getHours() + 1);
  }
  const end = { dateTime: formatDateTime(endDate), timeZone: CALENDAR_TIME_ZONE };
  return { start, end };
}

export async function createCalendarEvent(
  accessToken: string,
  {
    summary,
    description,
    date,
    startTime,
    endTime,
    colorId,
  }: {
    summary: string;
    description: string;
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    colorId?: string | null;
  }
): Promise<{ id: string; htmlLink: string }> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary,
      description,
      ...buildEventTiming({ date, startTime, endTime }),
      ...(colorId ? { colorId } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Google Calendar event creation failed: ${await res.text()}`);
  return res.json();
}

export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  {
    summary,
    description,
    date,
    startTime,
    endTime,
    colorId,
  }: {
    summary: string;
    description: string;
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    // Only sent when explicitly provided — a plain edit-and-save of an already-app-synced event
    // has no reason to touch color, but the calendar-import flow uses this to recolor a raw
    // calendar event (previously in the photographer's own "needs importing" color) to the
    // regular app-synced color once it's linked to a real event in the system.
    colorId?: string | null;
  }
): Promise<{ id: string; htmlLink: string }> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary,
      description,
      ...buildEventTiming({ date, startTime, endTime }),
      ...(colorId ? { colorId } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Google Calendar event update failed: ${await res.text()}`);
  return res.json();
}

export type GoogleCalendarEvent = {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  htmlLink: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
  colorId?: string;
};

// Bounded to the trailing/leading window the calendar view actually shows — a full unbounded
// listing isn't needed and would just slow the page down on an account with calendar history.
export async function listCalendarEvents(
  accessToken: string,
  { timeMin, timeMax }: { timeMin: string; timeMax: string }
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google Calendar events list failed: ${await res.text()}`);
  const data = await res.json();
  return data.items ?? [];
}

export async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 404/410 means it's already gone from the calendar — treat as success (idempotent delete).
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google Calendar event deletion failed: ${await res.text()}`);
  }
}
