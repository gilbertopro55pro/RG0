import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Admin-only for now (see the standing "עדכון אדמין" staged-rollout process) — the "דלג" choice on
// the new-event flow's contract step. Records the decision (so EventDetailView.tsx's
// event-closing banner knows to prompt for the opening message right away instead of waiting on a
// contract that will never be signed) and logs it to the event's own timeline.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  // RLS (owner-only) scopes this update — no separate ownership check needed.
  const { error } = await supabase.from("events").update({ contract_skipped: true }).eq("id", eventId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("event_notifications").insert({
    event_id: eventId,
    text: "דילג על שלב החוזה",
  });

  return NextResponse.json({ ok: true });
}
