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
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
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
  const end = endTime
    ? { dateTime: `${date}T${withSeconds(endTime)}`, timeZone: CALENDAR_TIME_ZONE }
    : { dateTime: `${date}T${withSeconds(startTime)}`, timeZone: CALENDAR_TIME_ZONE };
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
  }: { summary: string; description: string; date: string; startTime?: string | null; endTime?: string | null }
): Promise<{ id: string; htmlLink: string }> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary,
      description,
      ...buildEventTiming({ date, startTime, endTime }),
    }),
  });
  if (!res.ok) throw new Error(`Google Calendar event update failed: ${await res.text()}`);
  return res.json();
}

export type GoogleCalendarEvent = {
  id: string;
  summary: string;
  description?: string;
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
