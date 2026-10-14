import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The "new lead from the assistant" popup (owner, 2026-10-01; components/AssistantLeadPopup.tsx):
// GET lists the photographer's assistant leads not seen yet, plus those whose reminder is due
// (newest first); POST marks them seen, with or without a reminder. RLS keeps both to the
// signed-in photographer's own leads.
//
// Reminder (owner, 2026-10-14): "תזכורת" in the popup picks 30 minutes, an hour or 3 hours, and
// the lead pops up again then, unless it was handled by hand in the meantime: its status changed
// from "new", a quote was sent, it became an event, it was archived or deleted, or the
// conversation summary was sent on WhatsApp (that route clears the reminder).

// The choices offered in the popup (REMIND_OPTIONS in components/AssistantLeadPopup.tsx).
const REMIND_MINUTES = [30, 60, 180] as const;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ leads: [] });
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("leads")
    .select("id, name, phone, event_type_name, event_date_interest, needs_details, created_at, assistant_seen_at")
    .eq("photographer_id", user.id)
    .eq("source", "assistant")
    .is("archived_at", null)
    .or(`assistant_seen_at.is.null,and(assistant_remind_at.lte.${now},status.eq.new,quote_sent_at.is.null,quoted_amount.is.null,converted_event_id.is.null)`)
    .order("created_at", { ascending: false })
    .limit(10);
  const leads = (data ?? []).map(({ assistant_seen_at, ...lead }) => ({ ...lead, reminder: assistant_seen_at !== null }));
  return NextResponse.json({ leads });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { ids?: unknown; remindMinutes?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 50) : [];
  if (ids.length === 0) return NextResponse.json({ ok: true });
  const remind = REMIND_MINUTES.find((m) => m === body?.remindMinutes) ?? null;
  const now = Date.now();
  const { error } = await supabase
    .from("leads")
    .update({
      assistant_seen_at: new Date(now).toISOString(),
      // Opening the lead (or the next reminder) replaces any reminder already set.
      assistant_remind_at: remind ? new Date(now + remind * 60_000).toISOString() : null,
    })
    .eq("photographer_id", user.id)
    .in("id", ids);
  if (error) return NextResponse.json({ error: "שגיאה בשמירה" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
