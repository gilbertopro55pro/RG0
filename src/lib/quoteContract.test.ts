import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contractBookingDetails, contractIncludes } from "@/lib/quoteContract";
import type { LeadQuoteDetails } from "@/lib/leadQuote";
import type { PriceQuoteItem } from "@/lib/types";

const line = (item: string, details = "", price = 1000): PriceQuoteItem => ({ item, details, price });

describe("contractIncludes", () => {
  it("lists each line with its details in brackets, without prices", () => {
    expect(contractIncludes([line("צלם וידאו", "מ-13:00", 2500), line("אלבום מעוצב", "", 1800)])).toEqual(["צלם וידאו (מ-13:00)", "אלבום מעוצב"]);
  });

  it("separates details that already have brackets with a dash", () => {
    expect(contractIncludes([line("צילום סטילס", "צלם ראשי (מ 13:00)")])).toEqual(["צילום סטילס – צלם ראשי (מ 13:00)"]);
  });

  it("counts identical lines instead of repeating them", () => {
    expect(contractIncludes([line("מגנטים"), line("צלם וידאו", "מ-13:00"), line("מגנטים")])).toEqual(["מגנטים ×2", "צלם וידאו (מ-13:00)"]);
    expect(contractIncludes([line("צילום סטילס"), line("צילום סטילס"), line("צילום סטילס")])).toEqual(["צילום סטילס ×3"]);
  });

  it("keeps lines with different details apart", () => {
    expect(contractIncludes([line("צילום סטילס", "צלם ראשי"), line("צילום סטילס", "צלם שני")])).toEqual(["צילום סטילס (צלם ראשי)", "צילום סטילס (צלם שני)"]);
  });

  it("trims, and skips lines with no name", () => {
    expect(contractIncludes([line("  רחפן  ", "  "), line("   ", "פרטים"), { item: undefined, details: undefined, price: 0 } as unknown as PriceQuoteItem])).toEqual(["רחפן"]);
  });

  it("is empty for no lines", () => {
    expect(contractIncludes([])).toEqual([]);
  });
});

// A stand-in for the one read contractBookingDetails makes: the lead the event was converted from.
function fakeClient(quote: Partial<LeadQuoteDetails> | null | undefined) {
  const calls: { table?: string; eq?: [string, unknown] } = {};
  const client = {
    from(table: string) {
      calls.table = table;
      const q = {
        select: () => q,
        eq: (col: string, value: unknown) => {
          calls.eq = [col, value];
          return q;
        },
        order: () => q,
        limit: () => q,
        maybeSingle: () => Promise.resolve({ data: quote === undefined ? null : { quote_details: quote }, error: null }),
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const event = (start: string | null, end: string | null) => ({ id: "ev1", event_start_time: start, event_end_time: end });

describe("contractBookingDetails", () => {
  it("takes the hours and the lines from the quote the client approved", async () => {
    const { client, calls } = fakeClient({
      startTime: "13:00",
      endTime: "00:30",
      items: [line("צלם וידאו", "מ-13:00"), line("מגנטים"), line("מגנטים")],
    });
    expect(await contractBookingDetails(client, event("19:00:00", "23:00:00"))).toEqual({
      workHours: "13:00-00:30",
      includes: ["צלם וידאו (מ-13:00)", "מגנטים ×2"],
    });
    expect(calls).toEqual({ table: "leads", eq: ["converted_event_id", "ev1"] });
  });

  it("falls back to the event's own hours when there's no quote", async () => {
    expect(await contractBookingDetails(fakeClient(undefined).client, event("19:00:00", "23:30:00"))).toEqual({ workHours: "19:00-23:30", includes: [] });
    expect(await contractBookingDetails(fakeClient(null).client, event("19:00:00", "23:30:00"))).toEqual({ workHours: "19:00-23:30", includes: [] });
  });

  it("falls back to the event's hours for a quote without times (freelance)", async () => {
    const { client } = fakeClient({ items: [line("צילום אירוע", "6 שעות")] });
    expect(await contractBookingDetails(client, event("18:00:00", "00:00:00"))).toEqual({ workHours: "18:00-00:00", includes: ["צילום אירוע (6 שעות)"] });
  });

  it("writes only the start when there's no end", async () => {
    expect((await contractBookingDetails(fakeClient(undefined).client, event("19:00:00", null))).workHours).toBe("מ-19:00");
  });

  it("has no hours when neither the quote nor the event has them", async () => {
    expect((await contractBookingDetails(fakeClient(undefined).client, event(null, null))).workHours).toBeNull();
    expect((await contractBookingDetails(fakeClient(undefined).client, event(null, "23:00:00"))).workHours).toBeNull();
  });

  it("has no lines for a quote saved without items", async () => {
    const { client } = fakeClient({ startTime: "19:00", endTime: "00:00", items: undefined });
    expect(await contractBookingDetails(client, event(null, null))).toEqual({ workHours: "19:00-00:00", includes: [] });
  });
});
