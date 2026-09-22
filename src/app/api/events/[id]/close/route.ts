import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeClosePreview, monthLabel, resolveBalanceMonth } from "@/lib/closeEvent";

// GET: what closing would do right now (open stages, the unpaid balance and which month it would be
// recognized in, or whether the photographer has to choose). POST: closes (closed: true) or restores
// (closed: false). Closing never touches stages — open ones stay open — and records the month the
// unpaid balance is recognized in for the revenue views (see closeEvent.ts); restoring clears both.
// RLS (events_all_own) already scopes every read/write to the owning photographer.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  const preview = await computeClosePreview(supabase, eventId);
  if (!preview) return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });
  return NextResponse.json(preview);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  const { closed, balanceMonth }: { closed: boolean; balanceMonth?: "created" | "closing" } = await request.json();
  if (typeof closed !== "boolean") return NextResponse.json({ error: "בקשה לא חוקית" }, { status: 400 });

  let closedBalanceMonth: string | null = null;
  let notificationText = "האירוע שוחזר ונפתח מחדש";
  if (closed) {
    const preview = await computeClosePreview(supabase, eventId);
    if (!preview) return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });
    const resolved = resolveBalanceMonth(preview, balanceMonth);
    if (!resolved.ok) return NextResponse.json({ error: resolved.error, needsMonthChoice: true }, { status: 400 });
    closedBalanceMonth = resolved.month;
    notificationText = closedBalanceMonth
      ? `האירוע סומן כסגור (הושלם) — יתרה של ₪${preview.remaining.toLocaleString("he-IL")} נוספה להכנסות של ${monthLabel(closedBalanceMonth)}`
      : "האירוע סומן כסגור (הושלם)";
  }

  const { data: updated, error } = await supabase
    .from("events")
    .update({ closed_at: closed ? new Date().toISOString() : null, closed_balance_month: closedBalanceMonth })
    .eq("id", eventId)
    .select("id, closed_at")
    .maybeSingle<{ id: string; closed_at: string | null }>();
  if (error || !updated) return NextResponse.json({ error: error?.message ?? "האירוע לא נמצא" }, { status: 404 });

  await supabase.from("event_notifications").insert({ event_id: eventId, text: notificationText });
  return NextResponse.json({ closedAt: updated.closed_at });
}
