import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Powers the red badge on the settings nav tile — same underlying data as the per-event
// badges on the dashboard (unread, client-initiated event_notifications), just summed across
// every event instead of shown per card. RLS scopes this to the caller's own events (or a team
// member's assigned events) the same way it already does on the dashboard query.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ unreadEvents: 0 });
  }

  const { count } = await supabase
    .from("event_notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_client_action", true)
    .is("read_at", null);

  return NextResponse.json({ unreadEvents: count ?? 0 });
}
