import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { verifyPayplusWebhookSignature } from "@/lib/payplus";

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

  await supabase
    .from("photographers")
    .update({
      subscription_status: isSuccess ? "active" : "past_due",
      ...(customerUid ? { payplus_customer_uid: customerUid } : {}),
      ...(recurringUid ? { payplus_recurring_uid: recurringUid } : {}),
    })
    .eq("id", photographerId);

  return NextResponse.json({ received: true });
}
