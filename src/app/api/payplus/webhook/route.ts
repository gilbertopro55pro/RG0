import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { verifyPayplusWebhookSignature, deletePayplusRecurring, PAYPLUS_BILLING } from "@/lib/payplus";
import { issueReceipt, documentTypeForTaxStatus } from "@/lib/finbot";
import { issueSubscriptionReceipt, receiptFailureStatus } from "@/lib/subscriptionReceipt";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import { notificationEmailFor } from "@/lib/notificationEmail";
import { alertBillingAdmin as alertAdmin } from "@/lib/billingAlerts";
import { addBillingMonths } from "@/lib/billingDates";
import type { Photographer } from "@/lib/types";
import { INTAKE_PACK_TAG } from "@/lib/intakeCredits";

// A run is cut off long before a callback it left unfinished may be taken over (STALE_CLAIM_MS), so
// a retry never runs alongside a first attempt that is still going.
export const maxDuration = 120;
const STALE_CLAIM_MS = 5 * 60 * 1000;

type PayplusCallbackBody = {
  transaction_uid?: string;
  status_code?: string;
  more_info?: string; // photographer_id, set at checkout creation
  more_info_1?: string; // plan ("monthly" | "annual"), also set at checkout creation
  customer_uid?: string;
  uid?: string; // the transaction's own id (under "transaction") — dedupe key
  type?: string; // "payment_page" (a checkout) | "recurring" (a scheduled renewal)
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
  const photographerId = extractField(body, "more_info");
  const transactionUid = body.transaction?.uid ?? body.uid ?? null;

  const claim = await claimEvent(supabase, { body, transactionUid, photographerId });
  if (claim === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true });
  }
  const { eventId, receiptHandled } = claim;
  const markEvent = async (fields: Record<string, string | null>) => {
    if (eventId) await supabase.from("payplus_webhook_events").update(fields).eq("id", eventId);
  };

  if (!photographerId) {
    await markEvent({ outcome: "no_photographer_id" });
    return NextResponse.json({ error: "לא זוהה מזהה צלם" }, { status: 400 });
  }

  const statusCode = extractField(body, "status_code");
  const customerUid = extractField(body, "customer_uid");
  const recurringUid = extractField(body, "recurring_charge_information")?.recurring_uid;
  const planFromCheckout = extractField(body, "more_info_1");
  const isSuccess = isSuccessCode(statusCode);

  const transactionType = extractField(body, "type");
  const chargedAmount = Number(extractField(body, "amount")) || null;

  type BillingRow = Pick<
    Photographer,
    "name" | "email" | "phone" | "plan" | "subscription_status" | "cancel_at_period_end" | "payplus_recurring_uid"
  >;
  const { data: photographerRow, error: rowError } = await supabase
    .from("photographers")
    .select("name, email, phone, plan, subscription_status, cancel_at_period_end, payplus_recurring_uid")
    .eq("id", photographerId)
    .maybeSingle<BillingRow>();
  if (rowError) {
    // Not "unknown account": the lookup itself failed. The event stays without an outcome, so a
    // retry takes it over, and the cron reports it if none comes.
    console.error(`PayPlus webhook: reading photographer ${photographerId} failed:`, rowError);
    return NextResponse.json({ error: "שגיאה זמנית" }, { status: 500 });
  }

  // A charge for an account that doesn't exist (deleted, or a leftover test recurring) — nothing to
  // update and nobody to send a receipt to, but a real card WAS charged. Found 2026-09-24: a deleted
  // account's recurring kept charging ₪50/month silently. Alert the admin to cancel and refund.
  if (!photographerRow) {
    await markEvent({ outcome: "unknown_photographer" });
    if (isSuccess) {
      await alertAdmin(
        "חיוב PayPlus לחשבון שלא קיים במערכת",
        `PayPlus חייב כרטיס עבור חשבון שלא קיים במערכת (נמחק, או מנוי בדיקה שנשאר פעיל).\n\n` +
          `מזהה חשבון: ${photographerId}\nסכום: ₪${chargedAmount ?? "?"}\nמזהה עסקה: ${transactionUid ?? "?"}\n` +
          `מזהה הוראת קבע: ${recurringUid ?? "?"}\n\n` +
          `מה לעשות: לבטל את הוראת הקבע בממשק PayPlus ולשקול זיכוי ללקוח.`
      );
    }
    return NextResponse.json({ received: true });
  }

  // A pack of extra assistant conversations (a one-time charge, lib/intakeCredits.ts): handled on its
  // own and never touches the subscription (status, plan, period, recurring).
  if (planFromCheckout?.startsWith(INTAKE_PACK_TAG)) {
    const purchaseId = planFromCheckout.slice(INTAKE_PACK_TAG.length);
    const outcome = await handleIntakePack({
      supabase,
      purchaseId,
      photographerId,
      photographer: photographerRow,
      isSuccess,
      transactionUid,
      chargedAmount,
    });
    await markEvent({ outcome });
    return NextResponse.json({ received: true });
  }

  const isCheckout = transactionType === "payment_page";
  const isRenewal = transactionType === "recurring";
  const storedRecurringUid = photographerRow.payplus_recurring_uid;
  const who = `${photographerRow.name} (${photographerId})`;

  // A declined charge locks the account (past_due, sent to /billing) only when it is the account's
  // own renewal: a recurring callback from the recurring on file. A declined card on the checkout
  // page (a trial, or a cancelling account coming back) leaves the access they already have, and so
  // does a failure of an old recurring that was already replaced. Nothing from a failed transaction
  // is stored: its uids would replace the live recurring that cancelling has to stop.
  if (!isSuccess) {
    const ownRenewal = isRenewal && !!recurringUid && recurringUid === storedRecurringUid;
    if (ownRenewal && photographerRow.subscription_status === "active") {
      const { error } = await supabase.from("photographers").update({ subscription_status: "past_due" }).eq("id", photographerId);
      if (error) {
        console.error(`PayPlus webhook: locking ${photographerId} after a declined renewal failed:`, error);
        return NextResponse.json({ error: "שגיאה זמנית" }, { status: 500 });
      }
    }
    if (isRenewal) {
      await alertAdmin(
        ownRenewal ? `חידוש מנוי נדחה: ${photographerRow.name}` : "חיוב נדחה מהוראת קבע שלא רשומה בחשבון",
        `PayPlus דחה חיוב של ${who}, סטטוס ${statusCode ?? "?"}.\n` +
          `מזהה עסקה: ${transactionUid ?? "?"}\nהוראת קבע: ${recurringUid ?? "?"}\n\n` +
          (ownRenewal
            ? `החשבון הועבר ל"התשלום נכשל", והלקוח יתבקש לעדכן אמצעי תשלום בכניסה הבאה.`
            : `החשבון לא ננעל, כי זו לא הוראת הקבע שרשומה עליו. כדאי לבדוק ב-PayPlus › הוראות קבע שאין לו הוראה ישנה שעדיין פעילה.`)
      );
    }
    await markEvent({ outcome: ownRenewal ? "failed" : "failed_not_locked" });
    return NextResponse.json({ received: true });
  }

  // A checkout link always carries the plan it was generated for (see more_info_1 in
  // createPayplusCheckoutLink) — a plan switch's new checkout can name a DIFFERENT plan than
  // whatever's currently on the photographer row, so this has to win over the stored value once
  // the charge actually succeeds, or the switch would never actually take effect.
  const effectivePlan: SubscriptionPlan =
    (planFromCheckout && planFromCheckout in SUBSCRIPTION_PLANS ? (planFromCheckout as SubscriptionPlan) : undefined) ??
    photographerRow.plan ??
    "monthly";

  // A NEW checkout creates a new recurring in PayPlus. If the account already had a different one (a
  // past_due account paying again, or a plan switch whose old recurring couldn't be cancelled), it
  // would keep charging in parallel, so it's cancelled here, before the row points at the new one:
  // a retry of a callback that died half-way still sees it. One the account cancelled itself
  // (cancel_at_period_end) is already gone from PayPlus.
  if (isCheckout && recurringUid && storedRecurringUid && storedRecurringUid !== recurringUid && !photographerRow.cancel_at_period_end) {
    try {
      await deletePayplusRecurring(storedRecurringUid);
    } catch (e) {
      console.error(`Could not cancel superseded recurring ${storedRecurringUid} for ${photographerId}:`, e);
      await alertAdmin(
        "הוראת קבע ישנה לא בוטלה",
        `${who} שילם בדף תשלום חדש, אבל ביטול הוראת הקבע הקודמת שלו ב-PayPlus נכשל, ושתיהן עלולות לחייב.\n\n` +
          `הוראת הקבע הישנה: ${storedRecurringUid}\nהחדשה: ${recurringUid}\nשגיאה: ${e instanceof Error ? e.message : "לא ידועה"}\n\n` +
          `מה לעשות: ב-PayPlus › הוראות קבע › רשימת הוראות קבע, למחוק את הישנה אם היא עדיין פעילה.`
      );
    }
  }

  // Every successful charge (first payment or a recurring renewal alike) pushes the paid-through
  // date out by one more full period from today, on the Israeli calendar — realigns with the actual
  // billing date each time rather than compounding drift from a fixed schedule. Also clears the
  // reminder flag so the *next* cycle gets its own fresh reminder.
  const update: Record<string, string | boolean | null> = {
    subscription_status: "active",
    plan: effectivePlan,
    current_period_end: addBillingMonths(new Date(), SUBSCRIPTION_PLANS[effectivePlan].cycleMonths).toISOString(),
    renewal_reminder_sent_at: null,
  };
  if (customerUid) update.payplus_customer_uid = customerUid;
  // A renewal never replaces the recurring on file: one from a different recurring is an old one
  // that should have been cancelled (alerted below), and the one on file is the live one.
  if (recurringUid && (isCheckout || !storedRecurringUid)) update.payplus_recurring_uid = recurringUid;
  // A new checkout is a fresh subscription: it renews again (a cancelled account that came back
  // would otherwise be closed by the cron at the end of the period it just paid for, while its new
  // recurring keeps charging), and it is the payment any scheduled plan switch was waiting for. A
  // renewal leaves a scheduled switch alone: it comes before the switch date.
  if (isCheckout) {
    Object.assign(update, { cancel_at_period_end: false, auto_renew: true, pending_plan: null, pending_plan_effective_at: null });
  }

  const { error: updateError } = await supabase.from("photographers").update(update).eq("id", photographerId);
  if (updateError) {
    console.error(`PayPlus webhook: updating ${photographerId} after a charge failed:`, updateError);
    await alertAdmin(
      "תשלום התקבל אבל החשבון לא עודכן",
      `PayPlus חייב את ${who} ₪${chargedAmount ?? "?"}, אבל עדכון החשבון במערכת נכשל, ולכן ייתכן שהוא עדיין נעול.\n\n` +
        `שגיאה: ${updateError.message}\nמזהה עסקה: ${transactionUid ?? "?"}\n\n` +
        `המערכת תנסה שוב כש-PayPlus ישלח את העדכון מחדש. אם החשבון עדיין נעול בעוד שעה, להפעיל אותו ידנית.`
    );
    // No outcome is written, so PayPlus's retry of this callback takes it over (claimEvent).
    return NextResponse.json({ error: "שגיאה זמנית" }, { status: 500 });
  }

  // Two successful charges for one account inside a single billing cycle is never expected (found
  // 2026-09-24: a checkout and a recurring charge 3 hours apart on the same account). The charge
  // already happened and still gets its receipt — this makes sure a person looks at it and refunds.
  const windowDays = SUBSCRIPTION_PLANS[effectivePlan].cycleMonths > 1 ? 300 : 20;
  const { data: recentCharges } = await supabase
    .from("payplus_webhook_events")
    .select("id, created_at, transaction_uid")
    .eq("photographer_id", photographerId)
    .eq("outcome", "charged")
    .gte("created_at", new Date(Date.now() - windowDays * 86_400_000).toISOString())
    .neq("id", eventId ?? "")
    .returns<{ id: string; created_at: string; transaction_uid: string | null }[]>();
  if (recentCharges && recentCharges.length > 0) {
    await alertAdmin(
      "חשד לחיוב כפול במנוי",
      `החשבון ${who} חויב שוב בתוך אותו מחזור חיוב.\n\n` +
        `החיוב החדש: ₪${chargedAmount ?? "?"}, עסקה ${transactionUid ?? "?"} (${transactionType ?? "?"})\n` +
        recentCharges.map((c) => `חיוב קודם: ${c.created_at}, עסקה ${c.transaction_uid ?? "?"}`).join("\n") +
        `\n\nמה לעשות: לבדוק בממשק PayPlus ולזכות את החיוב המיותר.`
    );
  }

  // A renewal the account shouldn't have had: from a recurring other than the one on file (an old
  // one that was never really cancelled, or any recurring when none is on file), or after the
  // account cancelled. The access is extended
  // (the card was charged), but a person decides on a refund and deletes the recurring.
  if (isRenewal && ((recurringUid && recurringUid !== storedRecurringUid) || photographerRow.cancel_at_period_end)) {
    await alertAdmin(
      photographerRow.cancel_at_period_end ? "חיוב אחרי שהמנוי בוטל" : "חיוב מהוראת קבע ישנה",
      `PayPlus חייב את ${who} ₪${chargedAmount ?? "?"} בחידוש אוטומטי` +
        (photographerRow.cancel_at_period_end ? `, אחרי שהלקוח ביטל את המנוי.` : `, מהוראת קבע שאינה הרשומה בחשבון.`) +
        `\n\nהוראת הקבע שחייבה: ${recurringUid ?? "?"}\nהרשומה בחשבון: ${storedRecurringUid ?? "אין"}\nמזהה עסקה: ${transactionUid ?? "?"}\n\n` +
        `התקופה ששולמה הוארכה. מה לעשות: למחוק ב-PayPlus את הוראת הקבע שלא אמורה לחייב, ולשקול זיכוי.`
    );
  }

  // A receipt only for a real successful charge, and once: a callback taken over after a run that
  // already got to the receipt (receiptHandled) doesn't issue a second one. Failure here is logged
  // but never fails the webhook response: the charge itself already succeeded regardless of Finbot.
  if (!receiptHandled) {
    // The REAL amount PayPlus charged in this specific transaction — not a lookup of the
    // CURRENT price for the plan. Those quietly diverge the moment prices ever change: an existing
    // subscriber's recurring charge keeps billing whatever amount was baked in when they first
    // subscribed (PayPlus owns that, independent of this app). Falling back to the price-table
    // lookup only if PayPlus's callback is ever missing "amount".
    const amount = chargedAmount || PAYPLUS_BILLING[effectivePlan].amount;
    try {
      const { documentLink } = await issueSubscriptionReceipt({
        name: photographerRow.name,
        email: photographerRow.email,
        phone: photographerRow.phone,
        plan: effectivePlan,
        amount,
      });
      await markEvent({ receipt_status: "issued", receipt_link: documentLink });
    } catch (e) {
      const message = e instanceof Error ? e.message : "לא ידועה";
      // Finbot unreachable (after the in-request retries): the retry-receipts cron tries again every
      // hour with the same plan and amount, so the owner shouldn't issue it by hand meanwhile.
      const status = receiptFailureStatus(e, new Date(), new Date());
      await markEvent({
        receipt_status: status,
        receipt_error: message.slice(0, 500),
        receipt_plan: effectivePlan,
        receipt_amount: String(amount),
      });
      await alertAdmin(
        status === "retry" ? "קבלה על מנוי תופק בניסיון חוזר" : "הפקת קבלה על מנוי נכשלה",
        `החשבון ${who} שילם ₪${amount}, אבל הפקת הקבלה ב-Finbot נכשלה.\n\n` +
          `שגיאה: ${message}\nמזהה עסקה: ${transactionUid ?? "?"}\n\n` +
          (status === "retry"
            ? `Finbot לא היה זמין, ולכן הבקשה לא הגיעה אליו. המערכת תנסה שוב כל שעה במשך 24 שעות, ותשלח מייל כשהקבלה תופק או אם לא. אין צורך להפיק ידנית.`
            : `מה לעשות: להפיק קבלה ידנית ב-Finbot ולשלוח ללקוח.`)
      );
      console.error(`Finbot receipt issuance failed for photographer ${photographerId}:`, e);
    }
  }

  await markEvent({ outcome: "charged" });
  return NextResponse.json({ received: true });
}

// One row per PayPlus transaction (unique index, migration 0127). A transaction seen before stops
// here, before any status change or receipt, unless its first run died half-way (no outcome
// written, e.g. a timeout or a failed update): that one is taken over by a retry, once the first run
// can no longer be going (STALE_CLAIM_MS > maxDuration) and by one retry only, since claimed_at is
// moved forward in the same statement that checks it.
async function claimEvent(
  supabase: ReturnType<typeof createServiceRoleClient>,
  args: { body: PayplusCallbackBody; transactionUid: string | null; photographerId: string | undefined }
): Promise<"duplicate" | { eventId: string | null; receiptHandled: boolean }> {
  const { data: inserted, error } = await supabase
    .from("payplus_webhook_events")
    .insert({ payload: args.body, transaction_uid: args.transactionUid, photographer_id: args.photographerId ?? null })
    .select("id")
    .single<{ id: string }>();
  if (!error) return { eventId: inserted.id, receiptHandled: false };
  if (error.code !== "23505" || !args.transactionUid) {
    console.error("PayPlus webhook: recording the callback failed:", error);
    return { eventId: null, receiptHandled: false };
  }
  const { data: stuck } = await supabase
    .from("payplus_webhook_events")
    .update({ claimed_at: new Date().toISOString() })
    .eq("transaction_uid", args.transactionUid)
    .is("outcome", null)
    .lt("claimed_at", new Date(Date.now() - STALE_CLAIM_MS).toISOString())
    .select("id, receipt_status")
    .maybeSingle<{ id: string; receipt_status: string | null }>();
  if (!stuck) return "duplicate";
  console.error(`PayPlus webhook: taking over unfinished callback ${args.transactionUid}`);
  return { eventId: stuck.id, receiptHandled: stuck.receipt_status != null };
}

async function handleIntakePack(args: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  purchaseId: string;
  photographerId: string;
  photographer: Pick<Photographer, "name" | "email" | "phone">;
  isSuccess: boolean;
  transactionUid: string | null;
  chargedAmount: number | null;
}): Promise<string> {
  const { supabase, purchaseId, photographerId, photographer, isSuccess, transactionUid, chargedAmount } = args;
  const { data: purchase } = await supabase
    .from("intake_credit_purchases")
    .select("id, photographer_id, conversations, amount, status")
    .eq("id", purchaseId)
    .maybeSingle<{ id: string; photographer_id: string; conversations: number; amount: number; status: string }>();
  if (!purchase || purchase.photographer_id !== photographerId) {
    if (isSuccess) {
      await alertAdmin(
        "חיוב על חבילת שיחות שלא נמצאה",
        `PayPlus חייב ₪${chargedAmount ?? "?"} על חבילת שיחות לעוזר, אבל הרכישה לא נמצאה במערכת.

` +
          `מזהה חשבון: ${photographerId}
מזהה רכישה: ${purchaseId}
מזהה עסקה: ${transactionUid ?? "?"}

מה לעשות: לבדוק ולטעון את השיחות ידנית או לזכות.`
      );
    }
    return "pack_not_found";
  }
  if (!isSuccess) {
    if (purchase.status === "pending") await supabase.from("intake_credit_purchases").update({ status: "failed" }).eq("id", purchase.id);
    return "pack_failed";
  }

  // Adds the conversations once (the function only acts on a purchase that isn't paid yet).
  const { data: added, error } = await supabase.rpc("credit_intake_purchase", {
    p_purchase: purchase.id,
    p_transaction: transactionUid,
    p_charged: chargedAmount,
  });
  if (error) {
    await alertAdmin(
      "טעינת שיחות אחרי תשלום נכשלה",
      `החשבון ${photographer.name} (${photographerId}) שילם על ${purchase.conversations} שיחות, אבל הטעינה נכשלה.

שגיאה: ${error.message}
מזהה רכישה: ${purchase.id}

מה לעשות: לטעון ידנית.`
    );
    return "pack_credit_failed";
  }
  if (added == null) return "pack_already_paid";
  if (chargedAmount != null && Math.abs(chargedAmount - Number(purchase.amount)) > 0.01) {
    await alertAdmin(
      "סכום חבילת שיחות לא תואם",
      `החשבון ${photographer.name} (${photographerId}) חויב ₪${chargedAmount} על חבילה של ${purchase.conversations} שיחות שמחירה ₪${purchase.amount}. השיחות נטענו.

מזהה רכישה: ${purchase.id}`
    );
  }

  const amount = chargedAmount ?? Number(purchase.amount);
  try {
    const { documentLink } = await issueReceipt({
      documentType: documentTypeForTaxStatus("licensed"),
      customerName: photographer.name,
      customerEmail: notificationEmailFor(photographer.email),
      customerPhone: photographer.phone,
      amount,
      description: `חבילת ${purchase.conversations} שיחות נוספות לעוזר הפניות - מערכת גילברטו`,
    });
    await supabase.from("intake_credit_purchases").update({ receipt_status: "issued", receipt_link: documentLink }).eq("id", purchase.id);
  } catch (e) {
    await supabase
      .from("intake_credit_purchases")
      .update({ receipt_status: "failed", receipt_error: e instanceof Error ? e.message.slice(0, 500) : "unknown" })
      .eq("id", purchase.id);
    await alertAdmin(
      "הפקת קבלה על חבילת שיחות נכשלה",
      `החשבון ${photographer.name} (${photographerId}) שילם ₪${amount} על ${purchase.conversations} שיחות (נטענו), אבל הפקת הקבלה ב-Finbot נכשלה.

` +
        `שגיאה: ${e instanceof Error ? e.message : "לא ידועה"}
מזהה עסקה: ${transactionUid ?? "?"}

מה לעשות: להפיק קבלה ידנית ב-Finbot ולשלוח ללקוח.`
    );
    console.error(`Finbot receipt failed for intake pack ${purchase.id}:`, e);
  }
  return "pack_charged";
}

function isSuccessCode(code: string | undefined) {
  return code === "000";
}
