import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The "new lead from the assistant" popup (owner, 2026-10-01; components/AssistantLeadPopup.tsx):
// GET lists the photographer's assistant leads not seen yet (newest first), POST marks them seen.
// RLS keeps both to the signed-in photographer's own leads.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ leads: [] });
  const { data } = await supabase
    .from("leads")
    .select("id, name, phone, event_type_name, event_date_interest, needs_details, created_at")
    .eq("photographer_id", user.id)
    .eq("source", "assistant")
    .is("assistant_seen_at", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(10);
  return NextResponse.json({ leads: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 50) : [];
  if (ids.length === 0) return NextResponse.json({ ok: true });
  const { error } = await supabase.from("leads").update({ assistant_seen_at: new Date().toISOString() }).eq("photographer_id", user.id).in("id", ids);
  if (error) return NextResponse.json({ error: "שגיאה בשמירה" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
