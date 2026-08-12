import type { SupabaseClient } from "@supabase/supabase-js";
import { createOrUpdateAppleCalendarEvent, deleteAppleCalendarEvent } from "@/lib/appleCalendar";

type PhotographerAppleFields = {
  apple_calendar_connected: boolean;
  apple_calendar_email: string | null;
  apple_calendar_app_password: string | null;
  apple_calendar_url: string | null;
};

// Deterministic per-event UID so a create-then-immediate-update (or a retried create) always
// targets the same CalDAV resource instead of leaving orphaned duplicates on the calendar.
export function appleCalendarUidFor(eventId: string): string {
  return `gilberto-${eventId}`;
}

async function getAppleFields(
  supabase: SupabaseClient,
  photographerId: string
): Promise<PhotographerAppleFields | null> {
  const { data } = await supabase
    .from("photographers")
    .select("apple_calendar_connected, apple_calendar_email, apple_calendar_app_password, apple_calendar_url")
    .eq("id", photographerId)
    .single<PhotographerAppleFields>();

  if (!data?.apple_calendar_connected || !data.apple_calendar_email || !data.apple_calendar_app_password || !data.apple_calendar_url) {
    return null;
  }
  return data;
}

// Returns the UID it wrote (or null if Apple Calendar isn't connected) — the caller persists it
// on the event row so a later update/delete knows which CalDAV resource to touch.
export async function syncEventToAppleCalendar(
  supabase: SupabaseClient,
  photographerId: string,
  eventId: string,
  { summary, description, date, startTime, endTime }: { summary: string; description: string; date: string; startTime?: string | null; endTime?: string | null }
): Promise<string | null> {
  const fields = await getAppleFields(supabase, photographerId);
  if (!fields) return null;

  const uid = appleCalendarUidFor(eventId);
  await createOrUpdateAppleCalendarEvent(fields.apple_calendar_email!, fields.apple_calendar_app_password!, fields.apple_calendar_url!, {
    uid,
    summary,
    description,
    date,
    startTime,
    endTime,
  });
  return uid;
}

export async function updateEventInAppleCalendar(
  supabase: SupabaseClient,
  photographerId: string,
  uid: string,
  { summary, description, date, startTime, endTime }: { summary: string; description: string; date: string; startTime?: string | null; endTime?: string | null }
): Promise<void> {
  const fields = await getAppleFields(supabase, photographerId);
  if (!fields) return;

  await createOrUpdateAppleCalendarEvent(fields.apple_calendar_email!, fields.apple_calendar_app_password!, fields.apple_calendar_url!, {
    uid,
    summary,
    description,
    date,
    startTime,
    endTime,
  });
}

export async function deleteEventFromAppleCalendar(
  supabase: SupabaseClient,
  photographerId: string,
  uid: string
): Promise<void> {
  const fields = await getAppleFields(supabase, photographerId);
  if (!fields) return;

  await deleteAppleCalendarEvent(fields.apple_calendar_email!, fields.apple_calendar_app_password!, fields.apple_calendar_url!, uid);
}
