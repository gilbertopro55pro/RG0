import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { alertBillingAdmin } from "@/lib/billingAlerts";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import {
  issueSubscriptionReceipt,
  receiptFailureStatus,
  RECEIPT_RETRY_STALE_MS,
} from "@/lib/subscriptionReceipt";

export const maxDuration = 300;

type RetryRow = {
  id: string;
  created_at: string;
  transaction_uid: string | null;
  photographer_id: string | null;
  receipt_plan: string | null;
  receipt_amount: number | null;
  receipt_attempts: number;
};

// Hourly: subscription receipts the webhook couldn't issue because Finbot was unreachable
// (receipt_status 'retry'). Each is claimed ('retrying') before it's sent, so two runs never send
// the same one, and one whose run died after sending is never sent again: it's reported instead.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const now = new Date();

  // A run that died between sending and recording: Finbot may have issued the document.
  const { data: stale } = await supabase
    .from("payplus_webhook_events")
    .update({ receipt_status: "failed", receipt_error: "ניסיון חוזר נקטע באמצע" })
    .eq("receipt_status", "retrying")
    .lt("receipt_retry_started_at", new Date(now.getTime() - RECEIPT_RETRY_STALE_MS).toISOString())
    .select("photographer_id, transaction_uid, receipt_amount")
    .returns<{ photographer_id: string | null; transaction_uid: string | null; receipt_amount: number | null }[]>();
  for (const row of stale ?? []) {
    await alertBillingAdmin(
      "ניסיון חוזר להפקת קבלה נקטע",
      `ניסיון חוזר להפקת קבלה על ₪${row.receipt_amount ?? "?"} (חשבון ${row.photographer_id ?? "?"}, עסקה ${row.transaction_uid ?? "?"}) נקטע אחרי שהבקשה נשלחה ל-Finbot.\n\n` +
        `מה לעשות: לבדוק ב-Finbot אם הקבלה הופקה. אם לא, להפיק ידנית ולשלוח ללקוח.`
    );
  }

  const { data: due } = await supabase
    .from("payplus_webhook_events")
    .select("id, created_at, transaction_uid, photographer_id, receipt_plan, receipt_amount, receipt_attempts")
    .eq("receipt_status", "retry")
    .order("created_at")
    .limit(10)
    .returns<RetryRow[]>();

  let issued = 0;
  for (const row of due ?? []) {
    const { data: claimed } = await supabase
      .from("payplus_webhook_events")
      .update({ receipt_status: "retrying", receipt_retry_started_at: now.toISOString(), receipt_attempts: row.receipt_attempts + 1 })
      .eq("id", row.id)
      .eq("receipt_status", "retry")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const amount = Number(row.receipt_amount);
    const plan = row.receipt_plan && row.receipt_plan in SUBSCRIPTION_PLANS ? (row.receipt_plan as SubscriptionPlan) : null;
    const { data: photographer } = row.photographer_id
      ? await supabase
          .from("photographers")
          .select("name, email, phone")
          .eq("id", row.photographer_id)
          .maybeSingle<{ name: string; email: string; phone: string | null }>()
      : { data: null };
    const who = `${photographer?.name ?? "?"} (${row.photographer_id ?? "?"})`;
    const tail = `\n\nמזהה עסקה: ${row.transaction_uid ?? "?"}`;

    if (!photographer || !plan || !amount) {
      await supabase
        .from("payplus_webhook_events")
        .update({ receipt_status: "failed", receipt_error: "חסרים פרטים לניסיון חוזר" })
        .eq("id", row.id);
      await alertBillingAdmin(
        "הפקת קבלה על מנוי נכשלה",
        `אי אפשר להפיק שוב את הקבלה של ${who} על ₪${row.receipt_amount ?? "?"}: חסרים החשבון, המסלול או הסכום.${tail}\n\nמה לעשות: להפיק קבלה ידנית ב-Finbot ולשלוח ללקוח.`
      );
      continue;
    }

    try {
      const { documentLink } = await issueSubscriptionReceipt({ ...photographer, plan, amount });
      await supabase
        .from("payplus_webhook_events")
        .update({ receipt_status: "issued", receipt_link: documentLink, receipt_error: null })
        .eq("id", row.id);
      await alertBillingAdmin(
        "הקבלה על המנוי הופקה בניסיון חוזר",
        `הקבלה של ${who} על ₪${amount} הופקה ונשלחה ללקוח (ניסיון ${row.receipt_attempts + 2}).${tail}\n\nאין צורך לעשות דבר.`
      );
      issued++;
    } catch (e) {
      const message = e instanceof Error ? e.message : "לא ידועה";
      const status = receiptFailureStatus(e, new Date(row.created_at), new Date());
      await supabase
        .from("payplus_webhook_events")
        .update({ receipt_status: status, receipt_error: message.slice(0, 500) })
        .eq("id", row.id);
      if (status === "failed") {
        await alertBillingAdmin(
          "הפקת קבלה על מנוי נכשלה",
          `גם הניסיונות החוזרים להפיק את הקבלה של ${who} על ₪${amount} נכשלו.\n\nשגיאה: ${message}${tail}\n\nמה לעשות: להפיק קבלה ידנית ב-Finbot ולשלוח ללקוח.`
        );
      }
      console.error("Receipt retry failed:", row.id, e);
    }
  }

  return NextResponse.json({ stale: stale?.length ?? 0, attempted: due?.length ?? 0, issued });
}
