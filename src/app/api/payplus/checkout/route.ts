import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPayplusCheckoutLink } from "@/lib/payplus";
import { notificationEmailFor } from "@/lib/notificationEmail";
import type { Photographer } from "@/lib/types";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";

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
    return NextResponse.json({ error: "רק צלמים יכולים לרכוש מנוי" }, { status: 403 });
  }

  // An active subscription already has a live recurring in PayPlus — a second checkout would start a
  // second one charging in parallel. Plan changes go through switch-plan; /billing never offers
  // checkout to an active account, so this only stops a stale tab or a direct call.
  if (photographer.subscription_status === "active" && photographer.payplus_recurring_uid && !photographer.cancel_at_period_end) {
    return NextResponse.json({ error: "כבר יש לך מנוי פעיל. להחלפת מסלול: הגדרות > מנוי" }, { status: 409 });
  }

  const { plan }: { plan?: SubscriptionPlan } = await request.json().catch(() => ({}));
  const targetPlan = plan ?? photographer.plan;
  if (!(targetPlan in SUBSCRIPTION_PLANS)) {
    return NextResponse.json({ error: "מסלול לא תקין" }, { status: 400 });
  }

  try {
    const baseUrl = new URL(request.url).origin;
    const { paymentPageLink } = await createPayplusCheckoutLink({
      photographerId: photographer.id,
      plan: targetPlan,
      customerName: photographer.name,
      customerEmail: notificationEmailFor(photographer.email),
      customerPhone: photographer.phone,
      baseUrl,
    });
    return NextResponse.json({ url: paymentPageLink });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "שגיאה ביצירת קישור לתשלום" }, { status: 500 });
  }
}
