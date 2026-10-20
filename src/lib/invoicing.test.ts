import { afterEach, describe, expect, it, vi } from "vitest";

// The providers' network calls are replaced; their document-type helpers stay real.
vi.mock("@/lib/finbot", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/finbot")>()),
  issueReceipt: vi.fn(async () => ({ documentLink: "https://finbot.example/doc" })),
}));
vi.mock("@/lib/greenInvoice", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/greenInvoice")>()),
  issueDocument: vi.fn(async () => ({ documentLink: "https://greeninvoice.example/doc" })),
}));

import { documentTypeForTaxStatus as finbotType, issueReceipt } from "@/lib/finbot";
import { documentTypeForTaxStatus as greenType, issueDocument } from "@/lib/greenInvoice";
import { isInvoiceProviderConnected, issueClientDocument } from "@/lib/invoicing";

afterEach(() => {
  vi.clearAllMocks();
});

const keys = (finbot: string | null, greenId: string | null, greenSecret: string | null) => ({
  finbot_api_key: finbot,
  green_invoice_api_id: greenId,
  green_invoice_api_secret: greenSecret,
});

describe("isInvoiceProviderConnected", () => {
  // The issue-document route checks this before issuing, so a photographer's client receipt can't
  // go out without the photographer's own provider account.
  it("needs a Finbot key for Finbot", () => {
    expect(isInvoiceProviderConnected("finbot", keys("fb-key", null, null))).toBe(true);
    expect(isInvoiceProviderConnected("finbot", keys(null, null, null))).toBe(false);
    expect(isInvoiceProviderConnected("finbot", keys("", null, null))).toBe(false);
  });

  it("doesn't count Green Invoice keys for Finbot", () => {
    expect(isInvoiceProviderConnected("finbot", keys(null, "gi-id", "gi-secret"))).toBe(false);
  });

  it("needs both the id and the secret for Green Invoice", () => {
    expect(isInvoiceProviderConnected("green_invoice", keys(null, "gi-id", "gi-secret"))).toBe(true);
    expect(isInvoiceProviderConnected("green_invoice", keys(null, "gi-id", null))).toBe(false);
    expect(isInvoiceProviderConnected("green_invoice", keys(null, null, "gi-secret"))).toBe(false);
    expect(isInvoiceProviderConnected("green_invoice", keys(null, "", "gi-secret"))).toBe(false);
  });

  it("doesn't count a Finbot key for Green Invoice", () => {
    expect(isInvoiceProviderConnected("green_invoice", keys("fb-key", null, null))).toBe(false);
  });
});

describe("issueClientDocument", () => {
  const common = {
    customerName: "דנה כהן",
    customerEmail: "dana@example.com",
    amount: 1500,
    description: "צילום חתונה",
    emailSubject: "קבלה",
    emailBody: "תודה",
    paymentMethod: "bit" as const,
    paymentMethodLabel: "ביט",
  };

  it("issues through the photographer's Finbot key, with the document type of their tax status", async () => {
    const out = await issueClientDocument({ ...common, provider: "finbot", taxStatus: "licensed", photographer: keys("fb-key", "gi-id", "gi-secret") });

    expect(out).toEqual({ documentLink: "https://finbot.example/doc" });
    expect(issueDocument).not.toHaveBeenCalled();
    expect(issueReceipt).toHaveBeenCalledWith({
      apiKey: "fb-key",
      documentType: finbotType("licensed"),
      customerName: "דנה כהן",
      customerEmail: "dana@example.com",
      amount: 1500,
      description: "צילום חתונה",
      emailSubject: "קבלה",
      emailBody: "תודה",
      paymentMethod: "bit",
      paymentMethodLabel: "ביט",
    });
  });

  it("refuses without the photographer's own keys, so nothing is issued under the platform's account", async () => {
    await expect(issueClientDocument({ ...common, provider: "finbot", taxStatus: "licensed", photographer: keys(null, "gi-id", "gi-secret") })).rejects.toThrow();
    await expect(issueClientDocument({ ...common, provider: "green_invoice", taxStatus: "licensed", photographer: keys("fb-key", "gi-id", null) })).rejects.toThrow();
    expect(issueReceipt).not.toHaveBeenCalled();
    expect(issueDocument).not.toHaveBeenCalled();
  });

  it("issues an exempt business's Finbot document as a receipt type, not a tax invoice", async () => {
    await issueClientDocument({ ...common, provider: "finbot", taxStatus: "exempt", photographer: keys("fb-key", null, null) });
    const sent = vi.mocked(issueReceipt).mock.calls[0][0];
    expect(sent.documentType).toBe(finbotType("exempt"));
    expect(sent.documentType).not.toBe(finbotType("licensed"));
  });

  it("issues through the photographer's Green Invoice id and secret", async () => {
    const out = await issueClientDocument({ ...common, provider: "green_invoice", taxStatus: "exempt", photographer: keys("fb-key", "gi-id", "gi-secret") });

    expect(out).toEqual({ documentLink: "https://greeninvoice.example/doc" });
    expect(issueReceipt).not.toHaveBeenCalled();
    expect(issueDocument).toHaveBeenCalledWith({
      apiId: "gi-id",
      apiSecret: "gi-secret",
      documentType: greenType("exempt"),
      customerName: "דנה כהן",
      customerEmail: "dana@example.com",
      amount: 1500,
      description: "צילום חתונה",
      emailBody: "תודה",
      paymentMethod: "bit",
      paymentMethodLabel: "ביט",
    });
  });
});
