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
    await deletePayplusRecurring(photographer.payplus_recurring_uid);
    await supabase.from("photographers").update({ subscription_status: "canceled" }).eq("id", user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ביטול המנוי נכשל" }, { status: 500 });
  }
}
