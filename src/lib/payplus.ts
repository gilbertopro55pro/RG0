import crypto from "crypto";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";

const API_BASE = "https://restapi.payplus.co.il/api/v1.0";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function authHeaders() {
  return {
    "api-key": requireEnv("PAYPLUS_API_KEY"),
    "secret-key": requireEnv("PAYPLUS_SECRET_KEY"),
    "Content-Type": "application/json",
  };
}

// Charged amount per billing cycle and the recurring cadence for each plan, derived from
// SUBSCRIPTION_PLANS (the single source of truth for cycle length and pricing) rather than
// duplicating those numbers here. A cycle's flat charge is its annualAmount when the cycle spans
// more than a month, otherwise the plain monthly price.
export const PAYPLUS_BILLING: Record<SubscriptionPlan, { amount: number; recurringRangeMonths: number }> = Object.fromEntries(
  (Object.keys(SUBSCRIPTION_PLANS) as SubscriptionPlan[]).map((key) => {
    const info = SUBSCRIPTION_PLANS[key];
    return [key, { amount: info.annualAmount ?? info.pricePerMonth, recurringRangeMonths: info.cycleMonths }];
  })
) as Record<SubscriptionPlan, { amount: number; recurringRangeMonths: number }>;

// Generates a hosted PayPlus checkout link for a recurring subscription charge. Requires a
// Payment Page pre-created in the PayPlus merchant dashboard (PAYPLUS_PAYMENT_PAGE_UID) — the
// API can only generate dynamic links against an existing one, not create it.
export async function createPayplusCheckoutLink(params: {
  photographerId: string;
  plan: SubscriptionPlan;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  baseUrl: string;
}): Promise<{ paymentPageLink: string }> {
  const { amount, recurringRangeMonths } = PAYPLUS_BILLING[params.plan];

  const res = await fetch(`${API_BASE}/PaymentPages/generateLink`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      payment_page_uid: requireEnv("PAYPLUS_PAYMENT_PAGE_UID"),
      amount,
      currency_code: "ILS",
      charge_method: 3, // recurring
      sendEmailApproval: true,
      sendEmailFailure: true,
      language_code: "he",
      customer: {
        customer_name: params.customerName,
        email: params.customerEmail,
        phone: params.customerPhone,
      },
      recurring_settings: {
        instant_first_payment: true,
        recurring_type: 2, // monthly cadence; recurring_range controls the interval length
        recurring_range: recurringRangeMonths,
        number_of_charges: 0, // unlimited, until canceled
        start_date_on_payment_date: true,
      },
      more_info: params.photographerId,
      more_info_1: params.plan,
      refURL_success: `${params.baseUrl}/billing/success`,
      refURL_failure: `${params.baseUrl}/billing?error=1`,
      refURL_callback: `${params.baseUrl}/api/payplus/webhook`,
    }),
  });

  const data = await res.json();
  if (!res.ok || data?.results?.status !== "success" || !data?.data?.payment_page_link) {
    throw new Error(data?.results?.description ?? "יצירת קישור לתשלום נכשלה");
  }
  return { paymentPageLink: data.data.payment_page_link };
}

// Verifies the `hash` header PayPlus signs every webhook/callback request with, per their docs:
// HMAC-SHA256 of the raw JSON body, base64-encoded, using the account's secret key.
export function verifyPayplusWebhookSignature(rawBody: string, hashHeader: string | null): boolean {
  if (!hashHeader) return false;
  const secretKey = requireEnv("PAYPLUS_SECRET_KEY");
  const expected = crypto.createHmac("sha256", secretKey).update(rawBody).digest("base64");
  // timingSafeEqual over a plain === (see verifyWhatsAppSignature in whatsapp.ts for the same
  // pattern) — a naive string compare short-circuits on the first mismatched byte, leaking a tiny
  // but real timing signal an attacker could in principle use to guess the signature byte by byte.
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(hashHeader);
  return expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);
}

// A plan switch never takes effect immediately — see migration 0073's comment for why. The
// target date is always derived from the CURRENT plan's already-paid-through date
// (current_period_end), never "now": switching off a monthly plan finishes out whatever month is
// already paid for and the very next scheduled charge becomes the new plan's instead (one day's
// buffer before that renewal, so our cancellation is guaranteed to land before PayPlus's own
// scheduled charge fires — otherwise the old monthly recurring could still auto-charge that same
// day). Switching off an annual plan keeps full access for the first 10 of the already-paid 12
// months (that's what the annual charge covers), then starts the new plan's billing for months
// 11 and 12 instead of those being the old annual plan's two free bonus months. Keyed off the
// CURRENT plan's billing-cycle length (not its literal identity) so this works for any of the
// four plans, including a cross-tier switch like annual -> studio_pro_monthly.
export function computePlanSwitchEffectiveDate(currentPlan: SubscriptionPlan, currentPeriodEnd: Date): Date {
  const result = new Date(currentPeriodEnd);
  if (PAYPLUS_BILLING[currentPlan].recurringRangeMonths <= 1) {
    result.setDate(result.getDate() - 1);
  } else {
    result.setMonth(result.getMonth() - 2);
  }
  return result;
}

// Cancels a photographer's recurring subscription so no future charges occur.
export async function deletePayplusRecurring(recurringUid: string): Promise<void> {
  const res = await fetch(`${API_BASE}/RecurringPayments/DeleteRecurring/${recurringUid}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ terminal_uid: process.env.PAYPLUS_TERMINAL_UID ?? "" }),
  });
  const data = await res.json();
  if (!res.ok || data?.result?.status !== "success") {
    throw new Error(data?.result?.description ?? "ביטול המנוי נכשל");
  }
}
