import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listSyncedCalendarEvents } from "@/lib/googleCalendarSync";
import type { Photographer } from "@/lib/types";
import CalendarView from "@/components/CalendarView";

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: photographer } = await supabase
    .from("photographers")
    .select("*")
    .eq("id", user!.id)
    .maybeSingle<Photographer>();
  if (!photographer) redirect("/");

  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 60).toISOString();

  let events = null;
  let loadError = false;
  if (photographer.google_calendar_connected) {
    try {
      events = await listSyncedCalendarEvents(supabase, user!.id, { timeMin, timeMax });
    } catch {
      // A revoked/expired Google token surfaces here — don't crash the page, just show a
      // friendly retry message and let the user reconnect from Settings if it persists.
      loadError = true;
    }
  }

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <CalendarView connected={photographer.google_calendar_connected} events={events} loadError={loadError} />
    </div>
  );
}
