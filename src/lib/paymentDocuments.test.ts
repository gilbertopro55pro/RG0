import { describe, expect, it } from "vitest";
import {
  RECEIPT_PAYMENT_METHODS,
  amountToDocument,
  documentedOnLeg,
  paymentMethodLabel,
  receivedOnLeg,
  type PaymentLegDocState,
} from "@/lib/paymentDocuments";

const leg = (over: Partial<PaymentLegDocState> = {}): PaymentLegDocState => ({
  amount: 3000,
  paid: false,
  paidAmount: null,
  documentedAmount: null,
  documentUrl: null,
  ...over,
});

describe("receivedOnLeg", () => {
  it("is the whole leg once it's marked paid", () => {
    expect(receivedOnLeg(leg({ paid: true }))).toBe(3000);
    expect(receivedOnLeg(leg({ paid: true, paidAmount: 1000 }))).toBe(3000);
  });

  it("is the partial payment so far otherwise", () => {
    expect(receivedOnLeg(leg({ paidAmount: 1200 }))).toBe(1200);
    expect(receivedOnLeg(leg({ paidAmount: null }))).toBe(0);
  });

  it("never goes below 0", () => {
    expect(receivedOnLeg(leg({ paidAmount: -50 }))).toBe(0);
  });

  it("reads amounts stored as strings (Postgres numeric)", () => {
    expect(receivedOnLeg(leg({ paid: true, amount: "2500.50" as unknown as number }))).toBe(2500.5);
    expect(receivedOnLeg(leg({ paidAmount: "800" as unknown as number }))).toBe(800);
  });
});

describe("documentedOnLeg", () => {
  it("is what earlier receipts recorded", () => {
    expect(documentedOnLeg(leg({ documentedAmount: 1000, documentUrl: "https://doc/1" }))).toBe(1000);
    expect(documentedOnLeg(leg({ documentedAmount: 0 }))).toBe(0);
  });

  it("counts a receipt from before amounts were tracked as covering the whole leg", () => {
    expect(documentedOnLeg(leg({ documentedAmount: null, documentUrl: "https://doc/old" }))).toBe(3000);
  });

  it("is 0 with no receipt", () => {
    expect(documentedOnLeg(leg())).toBe(0);
  });
});

describe("amountToDocument", () => {
  it("covers a partial payment with no receipt yet", () => {
    expect(amountToDocument(leg({ paidAmount: 1200 }))).toBe(1200);
  });

  it("covers only what wasn't documented yet", () => {
    expect(amountToDocument(leg({ paid: true, documentedAmount: 1200, documentUrl: "https://doc/1" }))).toBe(1800);
    expect(amountToDocument(leg({ paidAmount: 2000, documentedAmount: 1200, documentUrl: "https://doc/1" }))).toBe(800);
  });

  it("is 0 once everything received is documented", () => {
    expect(amountToDocument(leg({ paid: true, documentedAmount: 3000, documentUrl: "https://doc/1" }))).toBe(0);
    expect(amountToDocument(leg({ paidAmount: 1200, documentedAmount: 1200, documentUrl: "https://doc/1" }))).toBe(0);
  });

  it("never asks for a receipt on money not received", () => {
    expect(amountToDocument(leg())).toBe(0);
    expect(amountToDocument(leg({ paidAmount: 500, documentedAmount: 900, documentUrl: "https://doc/1" }))).toBe(0);
  });

  it("is 0 after an old receipt that covered the whole leg", () => {
    expect(amountToDocument(leg({ paid: true, documentUrl: "https://doc/old" }))).toBe(0);
  });

  it("rounds to agorot and ignores floating-point dust", () => {
    expect(amountToDocument(leg({ paidAmount: 1000 / 3 }))).toBe(333.33);
    expect(amountToDocument(leg({ paidAmount: 100.3, documentedAmount: 100.1, documentUrl: "https://doc/1" }))).toBe(0.2);
    expect(amountToDocument(leg({ paidAmount: 0.1 + 0.2, documentedAmount: 0.3, documentUrl: "https://doc/1" }))).toBe(0);
    expect(amountToDocument(leg({ paidAmount: 1000.004, documentedAmount: 1000, documentUrl: "https://doc/1" }))).toBe(0);
    expect(amountToDocument(leg({ paidAmount: 1000.01, documentedAmount: 1000, documentUrl: "https://doc/1" }))).toBe(0.01);
  });
});

describe("paymentMethodLabel", () => {
  it("is null when no method was chosen", () => {
    expect(paymentMethodLabel(undefined)).toBeNull();
  });

  it("gives the Hebrew name of each method", () => {
    expect(paymentMethodLabel("cash")).toBe("מזומן");
    expect(paymentMethodLabel("bit")).toBe("ביט");
    expect(paymentMethodLabel("paybox")).toBe("פייבוקס");
    expect(paymentMethodLabel("transfer")).toBe("העברה בנקאית");
  });

  it("uses the photographer's own words for 'other', trimmed", () => {
    expect(paymentMethodLabel("other", "  צ׳ק דחוי  ")).toBe("צ׳ק דחוי");
  });

  it("falls back to 'אחר' for 'other' with no text", () => {
    expect(paymentMethodLabel("other")).toBe("אחר");
    expect(paymentMethodLabel("other", "   ")).toBe("אחר");
  });

  it("ignores free text for the other methods", () => {
    expect(paymentMethodLabel("bit", "something")).toBe("ביט");
  });

  it("offers the five methods on the receipt screen", () => {
    expect(RECEIPT_PAYMENT_METHODS.map((m) => m.id)).toEqual(["cash", "bit", "paybox", "transfer", "other"]);
  });
});
