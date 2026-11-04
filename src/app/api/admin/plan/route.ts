import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { ADMIN_EMAIL } from "@/lib/admin";
import { isAdminPriceChange, planChangeDecision, PLAN_CHANGE_REFUSAL_TEXT, type PlanChangeAccount } from "@/lib/adminPlanChange";
import { recurringAmounts } from "@/lib/recurringCharges";

// Admin dashboard › "שינוי מסלול" (owner's requests, 2026-11-03). The plan changes right away. The
// charge changes only when the admin asked for it (`changeBilling`), and then only from the next
// renewal, through the same scheduled switch a customer makes in Settings › Subscription: nothing
// here calls PayPlus. `cancelPriceChange` removes a price change scheduled from here. The rules are
// in lib/adminPlanChange.ts.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const body: { photographerId?: string; plan?: string; changeBilling?: boolean; cancelPriceChange?: boolean } = await request.json().catch(() => ({}));
  const { photographerId } = body;
  if (!photographerId) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const serviceRole = createServiceRoleClient();
  const { data: account, error: loadError } = await serviceRole
    .from("photographers")
    .select("id, plan, payplus_recurring_uid, cancel_at_period_end, pending_plan, current_period_end")
    .eq("id", photographerId)
    .maybeSingle<PlanChangeAccount & { id: string }>();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!account) return NextResponse.json({ error: "החשבון לא נמצא" }, { status: 404 });

  if (body.cancelPriceChange) {
    // Only a price change made here; a switch the customer scheduled is theirs to cancel.
    if (!isAdminPriceChange(account)) return NextResponse.json({ error: "אין לחשבון שינוי מחיר מתוזמן מלוח הבקרה" }, { status: 409 });
    const { data: cleared, error } = await serviceRole
      .from("photographers")
      .update({ pending_plan: null, pending_plan_effective_at: null })
      .eq("id", account.id)
      .eq("pending_plan", account.pending_plan!)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!cleared) return NextResponse.json({ error: "החשבון השתנה בינתיים. רעננו את הדף ונסו שוב." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  if (!body.plan) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  const amounts = await recurringAmounts(serviceRole, [account]);
  const decision = planChangeDecision(account, body.plan, amounts.get(account.id) ?? null, body.changeBilling === true);
  if (!decision.ok) {
    return NextResponse.json({ error: PLAN_CHANGE_REFUSAL_TEXT[decision.reason], reason: decision.reason }, { status: decision.reason === "unknown_plan" ? 400 : 409 });
  }

  // Only if nothing changed in between (a payment or a scheduled switch landing at the same moment).
  const update: Record<string, string> = { plan: decision.plan };
  if (decision.billingChange) {
    update.pending_plan = decision.plan;
    update.pending_plan_effective_at = decision.billingChange.switchAt;
  }
  const { data: updated, error } = await serviceRole
    .from("photographers")
    .update(update)
    .eq("id", account.id)
    .eq("plan", account.plan)
    .is("pending_plan", null)
    .select("plan")
    .maybeSingle<{ plan: string }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "החשבון השתנה בינתיים. רעננו את הדף ונסו שוב." }, { status: 409 });

  return NextResponse.json({ plan: updated.plan, charging: decision.charging, billingChange: decision.billingChange });
}
