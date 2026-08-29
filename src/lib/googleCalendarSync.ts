import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  GoogleAuthRevokedError,
  listCalendarEvents,
  refreshAccessToken,
  updateCalendarEvent,
  type GoogleCalendarEvent,
} from "@/lib/google";

// Thrown by getValidAccessToken once a dead refresh token has been detected and the connection
// marked disconnected in the DB — a distinct sentinel (not GoogleAuthRevokedError itself) so
// route handlers can tell "just found out mid-request" apart from other failure modes with a
// single, simple check, without needing to know about the lower-level google.ts error class.
export class GoogleCalendarDisconnectedError extends Error {
  constructor() {
    super("Google Calendar connection expired — reconnect required");
    this.name = "GoogleCalendarDisconnectedError";
  }
}

type PhotographerTokens = {
  google_calendar_connected: boolean;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expiry: string | null;
  google_calendar_color_id: string | null;
};

async function getValidAccessToken(
  supabase: SupabaseClient,
  photographerId: string,
  photographer: PhotographerTokens
): Promise<string> {
  let accessToken = photographer.google_access_token;
  const expiry = photographer.google_token_expiry ? new Date(photographer.google_token_expiry) : null;
  const isExpired = !accessToken || !expiry || expiry.getTime() - Date.now() < 60_000;

  if (isExpired) {
    let refreshed;
    try {
      refreshed = await refreshAccessToken(photographer.google_refresh_token!);
    } catch (e) {
      if (e instanceof GoogleAuthRevokedError) {
        // The refresh token itself is dead — no retry will ever fix this. Mark the connection
        // disconnected now so every OTHER sync attempt (this event, the next one, the calendar
        // list view) short-circuits on the `!google_calendar_connected` check below instead of
        // hitting Google again and failing the same way, and so /settings correctly shows
        // "not connected" rather than a connection that's actually already dead.
        await supabase
          .from("photographers")
          .update({ google_calendar_connected: false, google_access_token: null, google_token_expiry: null })
          .eq("id", photographerId);
        throw new GoogleCalendarDisconnectedError();
      }
      throw e;
    }
    accessToken = refreshed.access_token;
    await supabase
      .from("photographers")
      .update({
        google_access_token: refreshed.access_token,
        google_token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("id", photographerId);
  }

  return accessToken!;
}

export async function syncEventToGoogleCalendar(
  supabase: SupabaseClient,
  photographerId: string,
  {
    summary,
    description,
    date,
    startTime,
    endTime,
  }: { summary: string; description: string; date: string; startTime?: string | null; endTime?: string | null }
): Promise<{ id: string; htmlLink: string } | null> {
  const { data: photographer } = await supabase
    .from("photographers")
    .select(
      "google_calendar_connected, google_access_token, google_refresh_token, google_token_expiry, google_calendar_color_id"
    )
    .eq("id", photographerId)
    .single<PhotographerTokens>();

  if (!photographer?.google_calendar_connected || !photographer.google_refresh_token) {
    return null;
  }

  const accessToken = await getValidAccessToken(supabase, photographerId, photographer);
  return createCalendarEvent(accessToken, {
    summary,
    description,
    date,
    startTime,
    endTime,
    colorId: photographer.google_calendar_color_id,
  });
}

export async function updateEventInGoogleCalendar(
  supabase: SupabaseClient,
  photographerId: string,
  googleCalendarEventId: string,
  {
    summary,
    description,
    date,
    startTime,
    endTime,
  }: { summary: string; description: string; date: string; startTime?: string | null; endTime?: string | null }
): Promise<{ id: string; htmlLink: string } | null> {
  const { data: photographer } = await supabase
    .from("photographers")
    .select("google_calendar_connected, google_access_token, google_refresh_token, google_token_expiry")
    .eq("id", photographerId)
    .single<PhotographerTokens>();

  if (!photographer?.google_calendar_connected || !photographer.google_refresh_token) {
    return null;
  }

  const accessToken = await getValidAccessToken(supabase, photographerId, photographer);
  return updateCalendarEvent(accessToken, googleCalendarEventId, { summary, description, date, startTime, endTime });
}

export async function listSyncedCalendarEvents(
  supabase: SupabaseClient,
  photographerId: string,
  { timeMin, timeMax }: { timeMin: string; timeMax: string }
): Promise<GoogleCalendarEvent[] | null> {
  const { data: photographer } = await supabase
    .from("photographers")
    .select("google_calendar_connected, google_access_token, google_refresh_token, google_token_expiry")
    .eq("id", photographerId)
    .single<PhotographerTokens>();

  if (!photographer?.google_calendar_connected || !photographer.google_refresh_token) {
    return null;
  }

  const accessToken = await getValidAccessToken(supabase, photographerId, photographer);
  return listCalendarEvents(accessToken, { timeMin, timeMax });
}

export async function deleteEventFromGoogleCalendar(
  supabase: SupabaseClient,
  photographerId: string,
  googleCalendarEventId: string
): Promise<void> {
  const { data: photographer } = await supabase
    .from("photographers")
    .select("google_calendar_connected, google_access_token, google_refresh_token, google_token_expiry")
    .eq("id", photographerId)
    .single<PhotographerTokens>();

  if (!photographer?.google_calendar_connected || !photographer.google_refresh_token) {
    return;
  }

  const accessToken = await getValidAccessToken(supabase, photographerId, photographer);
  await deleteCalendarEvent(accessToken, googleCalendarEventId);
}
