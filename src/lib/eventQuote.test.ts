import { describe, expect, it } from "vitest";
import { eventQuoteHistoryId, eventQuoteTotal } from "@/lib/eventQuote";
import { quoteLinkMessage } from "@/lib/quoteDefaults";

// The quote an event was booked from, on the event page (owner, 2026-10-22).
describe("eventQuoteHistoryId", () => {
  const rows = [
    { id: "h1", created_at: "2026-10-20T08:00:00Z", details: { createdAt: "2026-10-20T07:59:58Z" } },
    { id: "h2", created_at: "2026-10-22T06:54:01Z", details: { createdAt: "2026-10-22T06:53:59Z" } },
    { id: "h3", created_at: "2026-10-21T10:00:00Z", details: { createdAt: "2026-10-21T09:59:59Z" } },
  ];

  it("takes the history row of the quote the lead holds, not just the newest", () => {
    expect(eventQuoteHistoryId(rows, { createdAt: "2026-10-21T09:59:59Z" })).toBe("h3");
  });

  it("falls back to the newest row when none matches", () => {
    expect(eventQuoteHistoryId(rows, { createdAt: "2026-01-01T00:00:00Z" })).toBe("h2");
    expect(eventQuoteHistoryId(rows, null)).toBe("h2");
  });

  it("has no PDF for a quote with no history (an amount-only quote)", () => {
    expect(eventQuoteHistoryId([], { createdAt: "2026-10-22T06:53:59Z" })).toBeNull();
  });
});

describe("eventQuoteTotal", () => {
  it("is the itemised total, or the amount of an old amount-only quote", () => {
    expect(eventQuoteTotal({ details: { items: [], subtotal: 1610.17, vatAmount: 289.83, total: 1900, showVat: true, createdAt: "x" }, amount: 1900 })).toBe(1900);
    expect(eventQuoteTotal({ details: null, amount: 2500 })).toBe(2500);
    expect(eventQuoteTotal({ details: null, amount: null })).toBeNull();
  });
});

describe("quoteLinkMessage", () => {
  it("asks to approve a quote that's still open, and only to view one already approved", () => {
    const open = quoteLinkMessage("אדוה הצעת מחיר", "https://myframeflow.com/s/qX", "גילברטו", true);
    expect(open).toContain("לצפייה ואישור הצעת המחיר");
    expect(open).toContain("וחותמים על החוזה");
    const approved = quoteLinkMessage("אדוה הצעת מחיר", "https://myframeflow.com/s/qX", "גילברטו", true, "he", true);
    expect(approved).toContain("יש ללחוץ על הקישור לצפייה בהצעת המחיר.");
    expect(approved).not.toContain("ואישור");
    expect(approved).not.toContain("החוזה");
    expect(approved.split("\n").at(-1)).toBe("גילברטו");
  });

  it("speaks the client's language", () => {
    expect(quoteLinkMessage("Quote", "https://x/s/q", null, false, "en", true)).toContain("Tap the link to view the quote.");
  });
});
