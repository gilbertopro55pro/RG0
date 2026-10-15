import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validContactRemindAt } from "@/lib/leadContactReminder";

// Sets, moves or clears a lead's contact reminder (lib/leadContactReminder.ts). POST { remindAt }:
// an ISO moment, or null to clear it (done, or the photographer cancelled it). RLS keeps it to the
// photographer's own leads; the reminder columns aren't activity on the lead (migration 0175).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { remindAt?: unknown } | null;
  const remindAt = body?.remindAt === null ? null : validContactRemindAt(body?.remindAt);
  if (body?.remindAt !== null && !remindAt) return NextResponse.json({ error: "זמן תזכורת לא תקין" }, { status: 400 });
  const { data, error } = await supabase
    .from("leads")
    .update({ contact_remind_at: remindAt, contact_remind_pushed_at: null })
    .eq("id", id)
    .eq("photographer_id", user.id)
    .select("id, contact_remind_at")
    .maybeSingle<{ id: string; contact_remind_at: string | null }>();
  if (error) return NextResponse.json({ error: "שגיאה בשמירה" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "הליד לא נמצא" }, { status: 404 });
  return NextResponse.json({ ok: true, contactRemindAt: data.contact_remind_at });
}
