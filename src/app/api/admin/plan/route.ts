import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { ADMIN_EMAIL } from "@/lib/admin";
import { planChangeDecision, PLAN_CHANGE_REFUSAL_TEXT, type PlanChangeAccount } from "@/lib/adminPlanChange";
import { recurringAmounts } from "@/lib/recurringCharges";

// Admin dashboard › "שינוי מסלול" (owner's request, 2026-11-03). Changes the account's plan only:
// PayPlus and the standing order are never touched, so a paying customer keeps being charged what
// they're charged today. The rules are in lib/adminPlanChange.ts.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const { photographerId, plan }: { photographerId?: string; plan?: string } = await request.json().catch(() => ({}));
  if (!photographerId || !plan) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  const serviceRole = createServiceRoleClient();
  const { data: account, error: loadError } = await serviceRole
    .from("photographers")
    .select("id, plan, payplus_recurring_uid, cancel_at_period_end, pending_plan")
    .eq("id", photographerId)
    .maybeSingle<PlanChangeAccount & { id: string }>();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!account) return NextResponse.json({ error: "החשבון לא נמצא" }, { status: 404 });

  const amounts = await recurringAmounts(serviceRole, [account]);
  const decision = planChangeDecision(account, plan, amounts.get(account.id) ?? null);
  if (!decision.ok) {
    return NextResponse.json({ error: PLAN_CHANGE_REFUSAL_TEXT[decision.reason], reason: decision.reason }, { status: decision.reason === "unknown_plan" ? 400 : 409 });
  }

  // Only if nothing changed in between (a payment or a scheduled switch landing at the same moment).
  const { data: updated, error } = await serviceRole
    .from("photographers")
    .update({ plan: decision.plan })
    .eq("id", account.id)
    .eq("plan", account.plan)
    .is("pending_plan", null)
    .select("plan")
    .maybeSingle<{ plan: string }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "החשבון השתנה בינתיים. רעננו את הדף ונסו שוב." }, { status: 409 });

  return NextResponse.json({ plan: updated.plan, keepsCharging: decision.keepsCharging });
}
