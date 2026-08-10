import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deletePayplusRecurring } from "@/lib/payplus";
import type { Photographer } from "@/lib/types";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { data: photographer } = await supabase
    .from("photographers")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Photographer>();
  if (!photographer) {
    return NextResponse.json({ error: "רק צלמים יכולים לבטל מנוי" }, { status: 403 });
  }
  if (!photographer.payplus_recurring_uid) {
    return NextResponse.json({ error: "לא נמצא מנוי פעיל לביטול" }, { status: 400 });
  }

  try {
    // Stops the NEXT charge immediately. Access itself stays "active" until current_period_end —
    // the subscription-lifecycle cron flips subscription_status to "canceled" only once that
    // already-paid-for period actually elapses.
    await deletePayplusRecurring(photographer.payplus_recurring_uid);
    await supabase
      .from("photographers")
      .update({ cancel_at_period_end: true, auto_renew: false })
      .eq("id", user.id);
    return NextResponse.json({ ok: true, current_period_end: photographer.current_period_end });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ביטול המנוי נכשל" }, { status: 500 });
  }
}
