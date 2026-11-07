import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SNOOZABLE_KINDS, snoozeTime } from "@/lib/reminderSnooze";

// POST { remindMinutes: 60 | 180 } or { remindAt: ISO }: puts off a reminder window of the home
// screen (lib/reminderSnooze.ts). It comes back at that time, with a phone notification
// (api/cron/lead-reminders). RLS: only the photographer's own reminders.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  const body: { remindMinutes?: unknown; remindAt?: unknown } = await request.json().catch(() => ({}));
  const now = Date.now();
  const at = snoozeTime(body, now);
  if (at === null) return NextResponse.json({ error: "זמן תזכורת לא תקין" }, { status: 400 });

  const { data } = await supabase
    .from("scheduled_messages")
    .update({ remind_at: new Date(at).toISOString(), remind_set_at: new Date(now).toISOString(), remind_pushed_at: null })
    .eq("id", id)
    .eq("status", "awaiting_confirmation")
    .in("kind", [...SNOOZABLE_KINDS])
    .select("id");
  if (!data?.length) return NextResponse.json({ error: "התזכורת כבר טופלה או לא נמצאה" }, { status: 404 });
  return NextResponse.json({ ok: true, remindAt: new Date(at).toISOString() });
}
