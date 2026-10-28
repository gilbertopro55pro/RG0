import { issueReceipt, documentTypeForTaxStatus, FinbotUnreachable } from "@/lib/finbot";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import { notificationEmailFor } from "@/lib/notificationEmail";

// The platform's own receipt for a subscription charge, issued by the PayPlus webhook and, when
// Finbot couldn't be reached, again by the retry-receipts cron with the same plan and amount.
export async function issueSubscriptionReceipt({
  name,
  email,
  phone,
  plan,
  amount,
}: {
  name: string;
  email: string;
  phone?: string | null;
  plan: SubscriptionPlan;
  amount: number;
}): Promise<{ documentLink: string }> {
  return issueReceipt({
    // The platform itself is עוסק מורשה, so every subscription document is a חשבונית מס קבלה
    // (with VAT). There's no per-photographer setting for "the platform's own" tax status (that
    // column is each photographer's own business status).
    documentType: documentTypeForTaxStatus("licensed"),
    customerName: name,
    customerEmail: notificationEmailFor(email),
    customerPhone: phone ?? undefined,
    amount,
    description: `מנוי ${SUBSCRIPTION_PLANS[plan].label} למערכת גילברטו - ניהול צילום אירועים`,
  });
}

// How long the cron keeps retrying a receipt Finbot couldn't take, counted from the charge. After
// that the owner issues it by hand.
export const RECEIPT_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
// A retry whose run died between sending and recording the result: Finbot may have issued the
// document, so it isn't sent again; the owner checks Finbot.
export const RECEIPT_RETRY_STALE_MS = 30 * 60 * 1000;

// What a failed receipt attempt leaves on the webhook event: "retry" only when Finbot certainly
// got nothing and the window is still open, so no attempt can issue a second document.
export function receiptFailureStatus(error: unknown, chargedAt: Date, now: Date): "retry" | "failed" {
  if (!(error instanceof FinbotUnreachable)) return "failed";
  return now.getTime() - chargedAt.getTime() < RECEIPT_RETRY_WINDOW_MS ? "retry" : "failed";
}
