import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { verifyPayplusWebhookSignature } from "@/lib/payplus";
import { issueReceipt } from "@/lib/finbot";
import { SUBSCRIPTION_PLANS } from "@/lib/stages";
import type { Photographer } from "@/lib/types";

type PayplusCallbackBody = {
  transaction_uid?: string;
  status_code?: string;
  more_info?: string; // photographer_id, set at checkout creation
  customer_uid?: string;
  recurring_charge_information?: { recurring_uid?: string };
  // PayPlus's other endpoints wrap fields under "data" — the callback docs show top-level
  // fields, but real payload shape is being verified via payplus_webhook_events, so both
  // locations are checked defensively until confirmed.
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
  const isSuccess = statusCode === "000";

  const { data: photographer } = await supabase
    .from("photographers")
    .select("name, email, plan")
    .eq("id", photographerId)
    .maybeSingle<Pick<Photographer, "name" | "email" | "plan">>();

  // Every successful charge (first payment or a recurring renewal alike) pushes the paid-through
  // date out by one more full period from today — realigns with the actual billing date each
  // time rather than compounding drift from a fixed schedule. Also clears the reminder flag so
  // the *next* cycle gets its own fresh reminder instead of being permanently silenced.
  const now = new Date();
  const nextPeriodEnd = photographer
    ? photographer.plan === "annual"
      ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
      : new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())
    : null;

  await supabase
    .from("photographers")
    .update({
      subscription_status: isSuccess ? "active" : "past_due",
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
    const amount = photographer.plan === "annual" ? 500 : planInfo.pricePerMonth;
    try {
      await issueReceipt({
        customerName: photographer.name,
        customerEmail: photographer.email,
        amount,
        description: `מנוי ${planInfo.label} — photographer-flow`,
      });
    } catch (e) {
      console.error("Finbot receipt issuance failed:", e);
    }
  }

  return NextResponse.json({ received: true });
}
