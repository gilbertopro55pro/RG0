import { describe, expect, it } from "vitest";
import type { LeadQuoteDetails } from "@/lib/leadQuote";
import {
  buildLeadQuotePrefill,
  buildPrefillFromSentQuote,
  classifyName,
  hasQuotePrefill,
  hasSentQuote,
  matchTemplate,
  normalizeHe,
  parseCoverage,
} from "@/lib/leadQuotePrefill";
import { quoteTotals } from "@/lib/quoteDiscount";
import type { PriceQuoteTemplateRow, PricingSupplier } from "@/lib/types";

const SUPPLIERS: PricingSupplier[] = [
  { id: "stills", name: "צילום סטילס – צלם ראשי", price: 2000 },
  { id: "second", name: "צלם שני", price: 900 },
  { id: "video", name: "צלם וידאו", price: 2500 },
  { id: "album", name: "אלבום מעוצב", price: 1500 },
  { id: "magnets", name: "מגנטים", price: 1400 },
];

function sentQuote(q: Partial<LeadQuoteDetails>): LeadQuoteDetails {
  return { items: [], subtotal: 0, vatAmount: 0, total: 0, showVat: true, createdAt: "2026-10-10T08:00:00.000Z", ...q };
}

describe("buildPrefillFromSentQuote", () => {
  // An event quote as the builder sent it: hand-typed prices that differ from the supplier list,
  // a free-text row, a 10% discount, VAT, notes and hours.
  const eventQuote = sentQuote({
    items: [
      { item: "צילום סטילס – צלם ראשי", details: "מ-19:00", price: 2300 },
      { item: "מגנטים", details: "", price: 1200 },
      { item: "אלבום 30x60", details: "20 עמודים", price: 1800 },
    ],
    subtotal: 4770,
    vatAmount: 858.6,
    total: 5628.6,
    showVat: true,
    eventType: " חתונה ",
    eventDate: "2027-06-12",
    eventLocation: " אולם הגן ",
    startTime: "19:00",
    endTime: "00:00",
    notes: "האלבום יימסר תוך 60 יום.",
    discount: { type: "percent", value: 10, amount: 530 },
  });

  it("brings every line back with the price that was sent, not the supplier's list price", () => {
    const p = buildPrefillFromSentQuote({ quote: eventQuote, leadName: "דנה", leadPhone: "0501234567", suppliers: SUPPLIERS });
    expect(p.vendorRows).toEqual([
      { supplierId: "stills", customName: "", note: "מ-19:00", price: 2300, reason: "sent" },
      { supplierId: "magnets", customName: "", note: "", price: 1200, reason: "sent" },
      { supplierId: "__custom__", customName: "אלבום 30x60 (20 עמודים)", price: 1800, reason: "sent" },
    ]);
  });

  it("brings back the event, the hours, VAT, the notes and the discount as sent", () => {
    const p = buildPrefillFromSentQuote({ quote: eventQuote, leadName: " דנה ", leadPhone: " 0501234567 ", suppliers: SUPPLIERS });
    expect(p).toMatchObject({
      clientName: "דנה",
      clientPhone: "0501234567",
      eventType: "חתונה",
      eventDate: "2027-06-12",
      eventLocation: "אולם הגן",
      startTime: "19:00",
      endTime: "00:00",
      templateId: null,
      requested: [],
      hints: [],
    });
    expect(p.sent).toEqual({
      at: "2026-10-10T08:00:00.000Z",
      mode: "event",
      hours: null,
      shootPrice: null,
      taxStatus: "licensed",
      notes: "האלבום יימסר תוך 60 יום.",
      discount: { type: "percent", value: 10, amount: 530 },
    });
  });

  it("lands on the same totals that went out", () => {
    const p = buildPrefillFromSentQuote({ quote: eventQuote, suppliers: SUPPLIERS });
    const itemsSum = p.vendorRows.reduce((s, r) => s + r.price, 0);
    expect(quoteTotals(itemsSum, p.sent!.discount, p.sent!.taxStatus === "licensed" ? 0.18 : 0)).toMatchObject({
      subtotal: eventQuote.subtotal,
      vatAmount: eventQuote.vatAmount,
      total: eventQuote.total,
    });
  });

  it("keeps a free-text row's price when the supplier was renamed or removed since", () => {
    const p = buildPrefillFromSentQuote({ quote: eventQuote, suppliers: [] });
    expect(p.vendorRows.map((r) => [r.supplierId, r.customName, r.price])).toEqual([
      ["__custom__", "צילום סטילס – צלם ראשי (מ-19:00)", 2300],
      ["__custom__", "מגנטים", 1200],
      ["__custom__", "אלבום 30x60 (20 עמודים)", 1800],
    ]);
  });

  it("keeps an old event quote's priced shoot line as a row, so the total stays as sent", () => {
    const p = buildPrefillFromSentQuote({
      quote: sentQuote({
        items: [
          { item: "צילום אירוע", details: "19:00–00:00", price: 875 },
          { item: "מגנטים", details: "", price: 1425 },
        ],
        startTime: "19:00",
        endTime: "00:00",
      }),
      suppliers: SUPPLIERS,
    });
    expect(p.sent!.mode).toBe("event");
    expect(p.vendorRows).toEqual([
      { supplierId: "__custom__", customName: "צילום אירוע (19:00–00:00)", price: 875, reason: "sent" },
      { supplierId: "magnets", customName: "", note: "", price: 1425, reason: "sent" },
    ]);
  });

  it("drops an event quote's unpriced shoot line", () => {
    const p = buildPrefillFromSentQuote({
      quote: sentQuote({
        items: [
          { item: "צילום אירוע", details: "19:00–00:00", price: 0 },
          { item: "מגנטים", details: "", price: 1400 },
        ],
        startTime: "19:00",
        endTime: "00:00",
      }),
      suppliers: SUPPLIERS,
    });
    expect(p.vendorRows.map((r) => r.supplierId)).toEqual(["magnets"]);
  });

  it("reopens a freelance quote with its hours and the shoot's price, and no rows", () => {
    const p = buildPrefillFromSentQuote({
      quote: sentQuote({ items: [{ item: "צילום אירוע", details: "6 שעות", price: 1500 }], showVat: false }),
      suppliers: SUPPLIERS,
    });
    expect(p.vendorRows).toEqual([]);
    expect(p.startTime).toBe("");
    expect(p.sent).toMatchObject({ mode: "freelance", hours: 6, shootPrice: 1500, taxStatus: "exempt", notes: "", discount: null });
  });

  it("reads half hours in a freelance quote", () => {
    const p = buildPrefillFromSentQuote({ quote: sentQuote({ items: [{ item: "צילום אירוע", details: "3.5 שעות", price: 875 }] }), suppliers: [] });
    expect(p.sent).toMatchObject({ mode: "freelance", hours: 3.5, shootPrice: 875 });
  });

  it("treats a quote with times as an event quote even if it has only the shoot line", () => {
    const p = buildPrefillFromSentQuote({
      quote: sentQuote({ items: [{ item: "צילום אירוע", details: "6 שעות", price: 1500 }], startTime: "18:00", endTime: "00:00" }),
      suppliers: [],
    });
    expect(p.sent).toMatchObject({ mode: "event", hours: null, shootPrice: null });
    expect(p.vendorRows.map((r) => r.price)).toEqual([1500]);
  });

  it("normalizes the times and drops what isn't a time or a date", () => {
    const p = buildPrefillFromSentQuote({
      quote: sentQuote({ items: [{ item: "מגנטים", details: "", price: 1 }], startTime: "9:30", endTime: "25:00", eventDate: "12/06/2027" }),
      suppliers: [],
    });
    expect([p.startTime, p.endTime, p.eventDate]).toEqual(["09:30", "", ""]);
    const q = buildPrefillFromSentQuote({ quote: sentQuote({ items: [{ item: "מגנטים", details: "", price: 1 }], startTime: "19:00:00", endTime: "23:30:00" }), suppliers: [] });
    expect([q.startTime, q.endTime]).toEqual(["19:00", "23:30"]);
  });

  it("drops a malformed discount", () => {
    const p = buildPrefillFromSentQuote({
      quote: sentQuote({ items: [{ item: "מגנטים", details: "", price: 1000 }], discount: { type: "percent", value: 10, amount: 0 } }),
      suppliers: [],
    });
    expect(p.sent!.discount).toBeNull();
  });
});

describe("hasSentQuote", () => {
  it("is true only for a quote with items (the simple amount form saves none)", () => {
    expect(hasSentQuote(null)).toBe(false);
    expect(hasSentQuote(undefined)).toBe(false);
    expect(hasSentQuote(sentQuote({ items: [] }))).toBe(false);
    expect(hasSentQuote({ ...sentQuote({}), items: undefined } as unknown as LeadQuoteDetails)).toBe(false);
    expect(hasSentQuote(sentQuote({ items: [{ item: "מגנטים", details: "", price: 1400 }] }))).toBe(true);
  });
});

describe("hasQuotePrefill", () => {
  it("is true only when the assistant collected some text", () => {
    expect(hasQuotePrefill(null)).toBe(false);
    expect(hasQuotePrefill({})).toBe(false);
    expect(hasQuotePrefill({ eventType: "   ", dateAvailable: true })).toBe(false);
    expect(hasQuotePrefill({ eventType: "חתונה" })).toBe(true);
  });
});

describe("normalizeHe", () => {
  it("folds the spellings people type onto one form", () => {
    expect(normalizeHe("מצווה")).toBe(normalizeHe("מצוה"));
    expect(normalizeHe("היילייט")).toBe("היליט");
    expect(normalizeHe("בר-מצווה")).toBe("בר מצוה");
    expect(normalizeHe("אלבום")).toBe("אלבומ");
    expect(normalizeHe("  Photo   Album ")).toBe("photo album");
    expect(normalizeHe("סה״כ")).toBe("סהכ");
  });
});

describe("classifyName", () => {
  it("puts a name in the most specific category it mentions", () => {
    expect(classifyName("צילום וידאו")).toBe("video");
    expect(classifyName("צלם וידיאו")).toBe("video");
    expect(classifyName("מגנטים + צילום")).toBe("magnets");
    expect(classifyName("קליפ היילייטס")).toBe("clip");
    expect(classifyName("שידור חי")).toBe("stream");
    expect(classifyName("צילום רחפן")).toBe("drone");
    expect(classifyName("אלבום דיגיטלי מעוצב")).toBe("album");
    expect(classifyName("הגדלות")).toBe("prints");
    expect(classifyName("צילום סטילס")).toBe("photo");
  });

  it("is null for a line that isn't a product (fees, travel)", () => {
    expect(classifyName("נסיעות")).toBeNull();
  });
});

describe("parseCoverage", () => {
  it("splits what was asked and drops what the client said no to", () => {
    expect(parseCoverage("תמונות, אלבום דיגיטלי מעוצב, בלי וידאו, אפשרות למגנטים")).toEqual([
      { text: "תמונות", categories: ["photo"] },
      { text: "אלבום דיגיטלי מעוצב", categories: ["album"] },
      { text: "אפשרות למגנטים", categories: ["magnets"] },
    ]);
  });

  it("adds a second video person only when video was asked and the answer isn't no", () => {
    expect(parseCoverage("תמונות + וידאו", "כן, צריך צלם וידאו").map((s) => s.categories)).toEqual([["photo"], ["video"], ["secondVideo"]]);
    expect(parseCoverage("תמונות + וידאו", "לא צריך").map((s) => s.categories)).toEqual([["photo"], ["video"]]);
    expect(parseCoverage("תמונות", "כן").map((s) => s.categories)).toEqual([["photo"]]);
  });
});

describe("matchTemplate", () => {
  const tpl = (id: string, name: string, ...names: string[]): PriceQuoteTemplateRow => ({
    id,
    photographer_id: "p",
    name,
    created_at: "2026-10-01T00:00:00Z",
    items: names.map((item) => ({ item, details: "", price: 1000 })),
  });

  it("picks the template for the event that covers the most of what was asked", () => {
    const templates = [
      tpl("stills", "חתונה - סטילס", "צילום סטילס"),
      tpl("full", "חתונה - סטילס, אלבום ומגנטים", "צילום סטילס", "אלבום", "מגנטים"),
      tpl("bar", "בר מצווה - הכל", "צילום סטילס", "אלבום", "מגנטים"),
    ];
    expect(matchTemplate(templates, "חתונה", ["photo", "album", "magnets"])?.id).toBe("full");
  });

  it("matches a bar mitzvah to an 'עלייה לתורה' template", () => {
    expect(matchTemplate([tpl("t", "עלייה לתורה - בסיסי", "צילום סטילס")], "בר מצווה")?.id).toBe("t");
  });

  it("is null when no template is named for the event", () => {
    expect(matchTemplate([tpl("t", "חתונה", "צילום סטילס")], "ברית")).toBeNull();
    expect(matchTemplate([tpl("t", "חתונה", "צילום סטילס")], undefined)).toBeNull();
  });
});

describe("buildLeadQuotePrefill", () => {
  it("picks the main stills supplier for 'תמונות', not the second photographer, plus what else was asked", () => {
    const p = buildLeadQuotePrefill({
      details: { eventType: "חתונה", coverage: "תמונות, אלבום דיגיטלי מעוצב, אפשרות למגנטים" },
      suppliers: SUPPLIERS,
      templates: [],
    });
    expect(p.requested).toEqual(["photo", "album", "magnets"]);
    expect(p.vendorRows).toEqual([
      { supplierId: "stills", customName: "", price: 2000, reason: "photo" },
      { supplierId: "album", customName: "", price: 1500, reason: "album" },
      { supplierId: "magnets", customName: "", price: 1400, reason: "magnets" },
    ]);
  });

  it("adds a free-text row with no price for something no supplier sells, but no row for plain photos", () => {
    const p = buildLeadQuotePrefill({ details: { coverage: "תמונות, אפשרות למגנטים" }, suppliers: [], templates: [] });
    expect(p.vendorRows).toEqual([{ supplierId: "__custom__", customName: "מגנטים", price: 0, reason: "magnets" }]);
  });

  it("takes the template's price for the package and leaves out its lines nobody asked for", () => {
    const template: PriceQuoteTemplateRow = {
      id: "tpl",
      photographer_id: "p",
      name: "חתונה - מלא",
      created_at: "2026-10-01T00:00:00Z",
      items: [
        { item: "צילום אירוע", details: "", price: 0 },
        { item: "אלבום מעוצב", details: "", price: 1200 },
        { item: "צלם וידאו", details: "", price: 2200 },
        { item: "נסיעות", details: "", price: 150 },
      ],
    };
    const p = buildLeadQuotePrefill({ details: { eventType: "חתונה", coverage: "אלבום" }, suppliers: SUPPLIERS, templates: [template] });
    expect(p.templateId).toBe("tpl");
    expect(p.vendorRows).toEqual([
      { supplierId: "album", customName: "", note: "", price: 1200, reason: "template" },
      { supplierId: "__custom__", customName: "נסיעות", price: 150, reason: "template" },
    ]);
  });

  it("fills the client and event fields, with the lead's own name and phone as fallbacks", () => {
    const p = buildLeadQuotePrefill({
      details: { eventType: " בר מצווה ", eventDate: "2027-02-01", location: " ירושלים ", startTime: "9:00", endTime: "13:00", eventSlot: "morning", guests: "150" },
      leadName: "משה",
      leadPhone: "0521111111",
      suppliers: [],
      templates: [],
    });
    expect(p).toMatchObject({
      clientName: "משה",
      clientPhone: "0521111111",
      eventType: "בר מצווה",
      eventDate: "2027-02-01",
      eventLocation: "ירושלים",
      startTime: "09:00",
      endTime: "13:00",
      hints: ["אירוע בוקר", "150 מוזמנים"],
    });
  });

  it("leaves the date empty while the client hasn't decided one", () => {
    const p = buildLeadQuotePrefill({ details: { eventDate: "2027-02-01", dateUndecided: true, approxDate: "קיץ 2027" }, suppliers: [], templates: [] });
    expect(p.eventDate).toBe("");
    expect(p.hints).toContain("תאריך משוער: קיץ 2027");
  });
});
