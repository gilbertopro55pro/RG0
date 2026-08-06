import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPayplusCheckoutLink } from "@/lib/payplus";
import type { Photographer } from "@/lib/types";
import type { SubscriptionPlan } from "@/lib/stages";

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

  const { plan }: { plan?: SubscriptionPlan } = await request.json().catch(() => ({}));
  const targetPlan = plan ?? photographer.plan;

  try {
    const baseUrl = new URL(request.url).origin;
    const { paymentPageLink } = await createPayplusCheckoutLink({
      photographerId: photographer.id,
      plan: targetPlan,
      customerName: photographer.name,
      customerEmail: photographer.email,
      customerPhone: photographer.phone,
      baseUrl,
    });
    return NextResponse.json({ url: paymentPageLink });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "שגיאה ביצירת קישור לתשלום" }, { status: 500 });
  }
}
