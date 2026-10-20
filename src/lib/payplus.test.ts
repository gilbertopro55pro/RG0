import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import { INTAKE_PACK_TAG } from "@/lib/intakeCredits";
import {
  PAYPLUS_BILLING,
  computePlanSwitchEffectiveDate,
  createPayplusCheckoutLink,
  createPayplusOneTimeLink,
  deletePayplusRecurring,
  payplusLanguageFor,
  verifyPayplusWebhookSignature,
} from "@/lib/payplus";

// Fake credentials only. fetch is stubbed below, so nothing here reaches PayPlus.
const SECRET = "test-secret-key";
beforeEach(() => {
  vi.stubEnv("PAYPLUS_API_KEY", "test-api-key");
  vi.stubEnv("PAYPLUS_SECRET_KEY", SECRET);
  vi.stubEnv("PAYPLUS_PAYMENT_PAGE_UID", "page-uid");
  vi.stubEnv("PAYPLUS_TERMINAL_UID", "terminal-uid");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PLANS = Object.keys(SUBSCRIPTION_PLANS) as SubscriptionPlan[];

describe("payplusLanguageFor", () => {
  it("gives English to photographers using the app in English or Russian", () => {
    expect(payplusLanguageFor("en")).toBe("en");
    expect(payplusLanguageFor("ru")).toBe("en");
  });

  it("gives Hebrew otherwise", () => {
    expect(payplusLanguageFor("he")).toBe("he");
    expect(payplusLanguageFor(null)).toBe("he");
    expect(payplusLanguageFor(undefined)).toBe("he");
    expect(payplusLanguageFor("fr")).toBe("he");
    expect(payplusLanguageFor(1)).toBe("he");
  });
});

describe("PAYPLUS_BILLING", () => {
  it("has an entry for every plan", () => {
    expect(Object.keys(PAYPLUS_BILLING).sort()).toEqual([...PLANS].sort());
  });

  it("charges the exact amount and cadence per plan", () => {
    expect(PAYPLUS_BILLING).toEqual({
      basic_monthly: { amount: 25, recurringRangeMonths: 1 },
      basic_annual: { amount: 228, recurringRangeMonths: 12 },
      monthly: { amount: 59, recurringRangeMonths: 1 },
      annual: { amount: 500, recurringRangeMonths: 12 },
      studio_pro_monthly: { amount: 119, recurringRangeMonths: 1 },
      studio_pro_annual: { amount: 990, recurringRangeMonths: 12 },
    });
  });

  it("follows SUBSCRIPTION_PLANS: the annual amount for a long cycle, the monthly price otherwise", () => {
    for (const p of PLANS) {
      const info = SUBSCRIPTION_PLANS[p];
      expect(PAYPLUS_BILLING[p].recurringRangeMonths, p).toBe(info.cycleMonths);
      expect(PAYPLUS_BILLING[p].amount, p).toBe(info.cycleMonths > 1 ? info.annualAmount : info.pricePerMonth);
    }
  });
});

describe("computePlanSwitchEffectiveDate", () => {
  it("switches a monthly plan one day before the paid month ends", () => {
    const end = new Date("2026-11-20T08:00:00Z");
    for (const p of ["basic_monthly", "monthly", "studio_pro_monthly"] as const) {
      expect(computePlanSwitchEffectiveDate(p, end).toISOString(), p).toBe("2026-11-19T08:00:00.000Z");
    }
  });

  it("switches an annual plan after 10 of the 12 paid months, at the same Israeli time", () => {
    const end = new Date("2027-10-20T07:00:00Z");
    for (const p of ["basic_annual", "annual", "studio_pro_annual"] as const) {
      expect(computePlanSwitchEffectiveDate(p, end).toISOString(), p).toBe("2027-08-20T07:00:00.000Z");
    }
  });

  it("clamps an annual switch to the end of a shorter month", () => {
    // 30.4.2027 10:00 (summer) → 28.2.2027 10:00 (winter).
    expect(computePlanSwitchEffectiveDate("annual", new Date("2027-04-30T07:00:00Z")).toISOString()).toBe("2027-02-28T08:00:00.000Z");
    expect(computePlanSwitchEffectiveDate("annual", new Date("2027-12-31T08:00:00Z")).toISOString()).toBe("2027-10-31T08:00:00.000Z");
  });

  it("always lands before the current period ends", () => {
    const end = new Date("2027-03-15T10:00:00Z");
    for (const p of PLANS) {
      expect(computePlanSwitchEffectiveDate(p, end).getTime(), p).toBeLessThan(end.getTime());
    }
  });

  it("doesn't change the period end it was given", () => {
    const end = new Date("2027-10-20T07:00:00Z");
    computePlanSwitchEffectiveDate("annual", end);
    computePlanSwitchEffectiveDate("monthly", end);
    expect(end.toISOString()).toBe("2027-10-20T07:00:00.000Z");
  });
});

describe("verifyPayplusWebhookSignature", () => {
  const body = JSON.stringify({ transaction: { uid: "tx-1", status_code: "000", amount: 59 } });
  const sign = (raw: string, secret = SECRET, encoding: "base64" | "hex" = "base64") =>
    crypto.createHmac("sha256", secret).update(raw).digest(encoding);

  it("accepts the base64 HMAC-SHA256 of the raw body", () => {
    expect(verifyPayplusWebhookSignature(body, sign(body))).toBe(true);
  });

  it("refuses a body that was changed after signing", () => {
    const tampered = body.replace('"amount":59', '"amount":5');
    expect(verifyPayplusWebhookSignature(tampered, sign(body))).toBe(false);
  });

  it("refuses a signature made with another secret", () => {
    expect(verifyPayplusWebhookSignature(body, sign(body, "someone-else"))).toBe(false);
  });

  it("refuses the right HMAC in the wrong encoding", () => {
    expect(verifyPayplusWebhookSignature(body, sign(body, SECRET, "hex"))).toBe(false);
  });

  it("refuses a missing or empty header", () => {
    expect(verifyPayplusWebhookSignature(body, null)).toBe(false);
    expect(verifyPayplusWebhookSignature(body, "")).toBe(false);
  });

  it("refuses a header of a different length without throwing", () => {
    expect(verifyPayplusWebhookSignature(body, "short")).toBe(false);
    expect(verifyPayplusWebhookSignature(body, sign(body) + "AAAA")).toBe(false);
  });

  it("refuses an unsigned request even when the secret isn't configured", () => {
    vi.stubEnv("PAYPLUS_SECRET_KEY", "");
    expect(verifyPayplusWebhookSignature(body, null)).toBe(false);
  });
});

// ---- Request bodies (fetch stubbed, nothing leaves the process) ----

type Call = { url: string; body: Record<string, unknown>; headers: Record<string, string> };

function stubFetch(...answers: { ok?: boolean; status?: number; json: unknown }[]) {
  const calls: Call[] = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
      const a = answers[Math.min(i++, answers.length - 1)];
      return new Response(JSON.stringify(a.json), { status: a.status ?? (a.ok === false ? 500 : 200) });
    })
  );
  return calls;
}

const linkOk = (link: string) => ({ json: { results: { status: "success" }, data: { payment_page_link: link } } });
const linkFail = (description: string) => ({ json: { results: { status: "error", description } } });

const checkoutParams = {
  photographerId: "ph-1",
  customerName: "סטודיו אור",
  customerEmail: "studio@example.com",
  customerPhone: "0501234567",
  baseUrl: "https://myframeflow.com",
};

describe("createPayplusCheckoutLink", () => {
  it("creates a recurring charge for the plan's amount and cadence", async () => {
    const calls = stubFetch(linkOk("https://pay.example/annual"));
    const out = await createPayplusCheckoutLink({ ...checkoutParams, plan: "annual" });

    expect(out).toEqual({ paymentPageLink: "https://pay.example/annual" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/PaymentPages\/generateLink$/);
    expect(calls[0].headers["api-key"]).toBe("test-api-key");
    const b = calls[0].body;
    expect(b.amount).toBe(500);
    expect(b.currency_code).toBe("ILS");
    expect(b.charge_method).toBe(3);
    expect(b.payment_page_uid).toBe("page-uid");
    expect(b.recurring_settings).toMatchObject({ recurring_type: 2, recurring_range: 12, number_of_charges: 0 });
    expect(b.more_info).toBe("ph-1");
    expect(b.more_info_1).toBe("annual");
    expect(b.refURL_success).toBe("https://myframeflow.com/billing/success");
    expect(b.refURL_failure).toBe("https://myframeflow.com/billing?error=1");
    expect(b.refURL_callback).toBe("https://myframeflow.com/api/payplus/webhook");
    expect(b.language_code).toBe("he");
  });

  it("renews a monthly plan every month at its monthly price", async () => {
    const calls = stubFetch(linkOk("https://pay.example/m"));
    await createPayplusCheckoutLink({ ...checkoutParams, plan: "monthly" });
    expect(calls[0].body.amount).toBe(59);
    expect((calls[0].body.recurring_settings as { recurring_range: number }).recurring_range).toBe(1);
  });

  it("retries in Hebrew when PayPlus refuses the English page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const calls = stubFetch(linkFail("language not supported"), linkOk("https://pay.example/he"));
    const out = await createPayplusCheckoutLink({ ...checkoutParams, plan: "monthly", language: "en" });

    expect(out.paymentPageLink).toBe("https://pay.example/he");
    expect(calls.map((c) => c.body.language_code)).toEqual(["en", "he"]);
    expect(calls[1].body.amount).toBe(calls[0].body.amount);
  });

  it("throws PayPlus's message when the Hebrew page fails, without retrying", async () => {
    const calls = stubFetch(linkFail("terminal closed"));
    await expect(createPayplusCheckoutLink({ ...checkoutParams, plan: "monthly" })).rejects.toThrow("terminal closed");
    expect(calls).toHaveLength(1);
  });

  it("treats a success answer without a link as a failure", async () => {
    stubFetch({ json: { results: { status: "success" }, data: {} } });
    await expect(createPayplusCheckoutLink({ ...checkoutParams, plan: "monthly" })).rejects.toThrow();
  });
});

describe("createPayplusOneTimeLink (assistant conversation packs)", () => {
  it("makes a one-time charge tagged with the pack purchase, with no recurring", async () => {
    const calls = stubFetch(linkOk("https://pay.example/pack"));
    const out = await createPayplusOneTimeLink({
      ...checkoutParams,
      amount: 18,
      tag: `${INTAKE_PACK_TAG}purchase-42`,
      successUrl: "https://myframeflow.com/billing/intake-success",
      failureUrl: "https://myframeflow.com/settings?tab=automation",
    });

    expect(out.paymentPageLink).toBe("https://pay.example/pack");
    const b = calls[0].body;
    expect(b.charge_method).toBe(1);
    expect(b).not.toHaveProperty("recurring_settings");
    expect(b.amount).toBe(18);
    expect(b.more_info).toBe("ph-1");
    expect(b.more_info_1).toBe("intake_pack:purchase-42");
    expect(String(b.more_info_1).startsWith(INTAKE_PACK_TAG)).toBe(true);
    expect(String(b.more_info_1).slice(INTAKE_PACK_TAG.length)).toBe("purchase-42");
    expect(b.refURL_success).toBe("https://myframeflow.com/billing/intake-success");
    expect(b.refURL_callback).toBe("https://myframeflow.com/api/payplus/webhook");
  });

  it("never carries a subscription plan name in more_info_1", async () => {
    const calls = stubFetch(linkOk("https://pay.example/pack"));
    await createPayplusOneTimeLink({ ...checkoutParams, amount: 10, tag: `${INTAKE_PACK_TAG}p1`, successUrl: "s", failureUrl: "f" });
    expect(PLANS).not.toContain(calls[0].body.more_info_1);
  });
});

describe("deletePayplusRecurring", () => {
  it("cancels the recurring by its uid", async () => {
    const calls = stubFetch({ json: { results: { status: "success" } } });
    await expect(deletePayplusRecurring("rec-123")).resolves.toBeUndefined();
    expect(calls[0].url).toMatch(/\/RecurringPayments\/DeleteRecurring\/rec-123$/);
    expect(calls[0].body).toEqual({ terminal_uid: "terminal-uid" });
  });

  it("accepts PayPlus's answer under `results` (the cancel bug fixed on 2026-10-13)", async () => {
    stubFetch({ json: { results: { status: "success" } } });
    await expect(deletePayplusRecurring("rec-1")).resolves.toBeUndefined();
  });

  it("still accepts the older `result` spelling", async () => {
    stubFetch({ json: { result: { status: "success" } } });
    await expect(deletePayplusRecurring("rec-1")).resolves.toBeUndefined();
  });

  it("throws PayPlus's message when the cancel is refused", async () => {
    stubFetch({ json: { results: { status: "error", description: "recurring not found" } } });
    await expect(deletePayplusRecurring("rec-1")).rejects.toThrow("recurring not found");
  });

  it("throws on an HTTP error even if the body says success", async () => {
    stubFetch({ status: 500, json: { results: { status: "success" } } });
    await expect(deletePayplusRecurring("rec-1")).rejects.toThrow();
  });

  it("throws with the HTTP status when the answer isn't JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 })));
    await expect(deletePayplusRecurring("rec-1")).rejects.toThrow("502");
  });
});
