import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { verifyPayplusWebhookSignature, PAYPLUS_BILLING } from "@/lib/payplus";
import { issueReceipt, documentTypeForTaxStatus } from "@/lib/finbot";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import { notificationEmailFor } from "@/lib/notificationEmail";
import type { Photographer } from "@/lib/types";

type PayplusCallbackBody = {
  transaction_uid?: string;
  status_code?: string;
  more_info?: string; // photographer_id, set at checkout creation
  more_info_1?: string; // plan ("monthly" | "annual"), also set at checkout creation
  customer_uid?: string;
  amount?: number; // what PayPlus actually charged THIS transaction
  recurring_charge_information?: { recurring_uid?: string };
  // Confirmed against a real callback (payplus_webhook_events, 2026-08-11): more_info,
  // status_code and recurring_charge_information live under "transaction", customer_uid under
  // "data" — not top-level as PayPlus's docs suggested. extractField() checks all three
  // locations so it keeps working regardless of which wrapper a given callback type uses.
  data?: PayplusCallbackBody;
  transaction?: PayplusCallbackBody;
};

function extractField<K extends keyof PayplusCallbackBody>(body: PayplusCallbackBody, key: K) {
  return body[key] ?? body.data?.[key] ?? body.transaction?.[key];
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hash = request.headers.get("hash");

  if (!verifyPayplusWebhookSignature(rawBody, hash)) {
    return NextResponse.json({ error: "חתימה לא תקינה" }, { status: 401 });
  }

  const body: PayplusCallbackBody = JSON.parse(rawBody);
  const supabase = createServiceRoleClient();
  await supabase.from("payplus_webhook_events").insert({ payload: body });

  const photographerId = extractField(body, "more_info");
  if (!photographerId) {
    return NextResponse.json({ error: "לא זוהה מזהה צלם" }, { status: 400 });
  }

  const statusCode = extractField(body, "status_code");
  const customerUid = extractField(body, "customer_uid");
  const recurringUid = extractField(body, "recurring_charge_information")?.recurring_uid;
  const planFromCheckout = extractField(body, "more_info_1");
  const isSuccess = statusCode === "000";

  const { data: photographerRow } = await supabase
    .from("photographers")
    .select("name, email, phone, plan")
    .eq("id", photographerId)
    .maybeSingle<Pick<Photographer, "name" | "email" | "phone" | "plan">>();

  // A checkout link always carries the plan it was generated for (see more_info_1 in
  // createPayplusCheckoutLink) — a plan switch's new checkout can name a DIFFERENT plan than
  // whatever's currently on the photographer row, so this has to win over the stored value once
  // the charge actually succeeds, or the switch would never actually take effect.
  const effectivePlan: SubscriptionPlan =
    (planFromCheckout && planFromCheckout in SUBSCRIPTION_PLANS ? (planFromCheckout as SubscriptionPlan) : undefined) ??
    photographerRow?.plan ??
    "monthly";
  const photographer = photographerRow ? { ...photographerRow, plan: effectivePlan } : null;

  // Every successful charge (first payment or a recurring renewal alike) pushes the paid-through
  // date out by one more full period from today — realigns with the actual billing date each
  // time rather than compounding drift from a fixed schedule. Also clears the reminder flag so
  // the *next* cycle gets its own fresh reminder instead of being permanently silenced.
  const now = new Date();
  const nextPeriodEnd = photographer
    ? new Date(now.getFullYear(), now.getMonth() + SUBSCRIPTION_PLANS[photographer.plan].cycleMonths, now.getDate())
    : null;

  await supabase
    .from("photographers")
    .update({
      subscription_status: isSuccess ? "active" : "past_due",
      ...(isSuccess ? { plan: effectivePlan, pending_plan: null, pending_plan_effective_at: null } : {}),
      ...(customerUid ? { payplus_customer_uid: customerUid } : {}),
      ...(recurringUid ? { payplus_recurring_uid: recurringUid } : {}),
      ...(isSuccess && nextPeriodEnd
        ? { current_period_end: nextPeriodEnd.toISOString(), renewal_reminder_sent_at: null }
        : {}),
    })
    .eq("id", photographerId);

  // A receipt only makes sense for a real successful charge — never issue one for a declined/
  // failed callback. Failure here is logged but never fails the webhook response: PayPlus
  // retries on non-2xx, and the charge itself already succeeded regardless of Finbot's outcome.
  if (isSuccess && photographer) {
    const planInfo = SUBSCRIPTION_PLANS[photographer.plan];
    // The REAL amount PayPlus charged in this specific transaction — not a lookup of the
    // CURRENT price for photographer.plan. Those quietly diverge the moment prices ever change:
    // an existing subscriber's recurring charge keeps billing whatever amount was baked in when
    // they first subscribed (PayPlus owns that, independent of this app), so a plan's current
    // listed price can be wrong for anyone who signed up before the last price change. Falling
    // back to the price-table lookup only if PayPlus's callback is ever missing "amount".
    const amount = Number(extractField(body, "amount")) || PAYPLUS_BILLING[photographer.plan].amount;
    try {
      await issueReceipt({
        // The platform itself became עוסק מורשה — every subscription document from here on needs
        // to be a proper חשבונית מס קבלה (with VAT), not the plain VAT-exempt קבלה this defaulted
        // to before. There's no per-photographer setting for "the platform's own" tax status (that
        // column is each photographer's own business status, a separate concern from the
        // platform's) — hardcoded here since it's a one-time business change, not something that
        // toggles.
        documentType: documentTypeForTaxStatus("licensed"),
        customerName: photographer.name,
        customerEmail: notificationEmailFor(photographer.email),
        customerPhone: photographer.phone,
        amount,
        description: `מנוי ${planInfo.label} למערכת גילברטו - ניהול צילום אירועים`,
      });
    } catch (e) {
      // Includes which photographer — the failure otherwise only shows up as Finbot's own generic
      // email, with nothing in it to identify which subscriber triggered it without cross-
      // referencing payplus_webhook_events by timestamp.
      console.error(`Finbot receipt issuance failed for photographer ${photographerId}:`, e);
    }
  }

  return NextResponse.json({ received: true });
}
