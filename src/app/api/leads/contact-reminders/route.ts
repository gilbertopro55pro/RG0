import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { CONTACT_REMINDER_COLUMNS, type DueContactReminder } from "@/lib/leadContactReminder";

// The contact reminders that fell due (components/ContactReminderPopup.tsx), oldest first, for
// leads still open: not won or lost, not booked, not archived (lib/leadContactReminder.ts).
export async function GET() {
  const supabase = await createClient();
  // Polled from every screen: the JWT checked locally (lib/supabase/sessionUser.ts), no Auth round trip.
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ reminders: [] });
  const { data } = await supabase
    .from("leads")
    .select(CONTACT_REMINDER_COLUMNS)
    .eq("photographer_id", user.id)
    .lte("contact_remind_at", new Date().toISOString())
    .is("archived_at", null)
    .is("converted_event_id", null)
    .not("status", "in", "(won,lost)")
    .order("contact_remind_at", { ascending: true })
    .limit(10)
    .returns<DueContactReminder[]>();
  return NextResponse.json({ reminders: data ?? [] });
}
