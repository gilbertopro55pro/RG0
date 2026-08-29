import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computePlanSwitchEffectiveDate } from "@/lib/payplus";
import type { Photographer } from "@/lib/types";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";

// Schedules a monthly<->annual switch (see computePlanSwitchEffectiveDate for the exact timing
// rule) — doesn't touch PayPlus at all here, just records the request. The subscription-lifecycle
// cron is what actually acts on it once pending_plan_effective_at arrives, since carrying it out
// means canceling the current recurring charge and sending a new checkout link — not something
// to do from a request handler a browser tab might not stick around for.
export async function POST(request: Request) {
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
    return NextResponse.json({ error: "רק צלמים יכולים להחליף מסלול" }, { status: 403 });
  }
  if (photographer.subscription_status !== "active" && photographer.subscription_status !== "trialing") {
    return NextResponse.json({ error: "אין מנוי פעיל להחלפה" }, { status: 400 });
  }

  const { targetPlan, cancel }: { targetPlan?: SubscriptionPlan; cancel?: boolean } = await request
    .json()
    .catch(() => ({}));

  if (cancel) {
    await supabase.from("photographers").update({ pending_plan: null, pending_plan_effective_at: null }).eq("id", user.id);
    return NextResponse.json({ ok: true });
  }

  if (!targetPlan || !(targetPlan in SUBSCRIPTION_PLANS)) {
    return NextResponse.json({ error: "מסלול לא תקין" }, { status: 400 });
  }
  if (targetPlan === photographer.plan) {
    return NextResponse.json({ error: "זהו כבר המסלול הנוכחי" }, { status: 400 });
  }
  if (!photographer.current_period_end) {
    return NextResponse.json({ error: "לא נמצא תאריך חיוב נוכחי" }, { status: 400 });
  }

  const effectiveAt = computePlanSwitchEffectiveDate(photographer.plan, new Date(photographer.current_period_end));

  await supabase
    .from("photographers")
    .update({ pending_plan: targetPlan, pending_plan_effective_at: effectiveAt.toISOString() })
    .eq("id", user.id);

  return NextResponse.json({ ok: true, effectiveAt: effectiveAt.toISOString() });
}
