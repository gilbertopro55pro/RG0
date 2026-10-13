import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HOME_SORT_ORDERS, HOME_STATUS_FILTERS, type HomeSortOrder, type HomeStatusFilter } from "@/lib/homeEventsView";

// Saves the home screen's events view on the account (lib/homeEventsView.ts).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });

  const body: { status?: unknown; sort?: unknown } = await request.json().catch(() => ({}));
  if (!HOME_STATUS_FILTERS.includes(body.status as HomeStatusFilter) || !HOME_SORT_ORDERS.includes(body.sort as HomeSortOrder)) {
    return NextResponse.json({ error: "תצוגה לא תקינה" }, { status: 400 });
  }
  // A team member has no photographers row: nothing to save, and nothing fails.
  const { error } = await supabase
    .from("photographers")
    .update({ home_events_view: { status: body.status, sort: body.sort } })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
