import crypto from "crypto";
import type { SubscriptionPlan } from "@/lib/stages";

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

// Charged amount per billing cycle and the recurring cadence for each plan. The annual amount
// is a flat ₪500 (not pricePerMonth * 12) to match the advertised "חיוב שנתי של ₪500" pricing.
export const PAYPLUS_BILLING: Record<SubscriptionPlan, { amount: number; recurringRangeMonths: number }> = {
  monthly: { amount: 50, recurringRangeMonths: 1 },
  annual: { amount: 500, recurringRangeMonths: 12 },
};

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
  return expected === hashHeader;
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
