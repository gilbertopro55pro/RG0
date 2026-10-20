import { describe, expect, it } from "vitest";
import { addBillingMonths, israelDateString, israelIsoDateString } from "@/lib/billingDates";

// Israel moves to summer time (UTC+3) on 2026-03-27 and 2027-03-26, and back to winter time (UTC+2)
// on 2026-10-25 and 2027-10-31.
const add = (iso: string, months: number) => addBillingMonths(new Date(iso), months).toISOString();

describe("addBillingMonths", () => {
  it("renews a charge made after midnight Israel time on the next Israeli date, not a day early", () => {
    // 01:39 on 28.8 in Israel is still 27.8 in UTC (the account in the skill's history).
    expect(add("2026-08-27T22:39:00Z", 1)).toBe("2026-09-27T22:39:00.000Z");
    expect(israelDateString(addBillingMonths(new Date("2026-08-27T22:39:00Z"), 1))).toBe("28/09/2026");
  });

  it("clamps Jan 31 to the last day of February", () => {
    expect(add("2027-01-31T08:00:00Z", 1)).toBe("2027-02-28T08:00:00.000Z");
  });

  it("lands on Feb 29 in a leap year", () => {
    expect(add("2028-01-31T08:00:00Z", 1)).toBe("2028-02-29T08:00:00.000Z");
  });

  it("renews a Feb 29 annual plan on Feb 28 of the next year", () => {
    expect(add("2028-02-29T08:00:00Z", 12)).toBe("2029-02-28T08:00:00.000Z");
  });

  it("clamps by the Israeli date even when UTC is already on the next day", () => {
    // 23:30 on 31.1 in Israel (21:30 UTC) → 23:30 on 28.2 in Israel.
    expect(add("2027-01-31T21:30:00Z", 1)).toBe("2027-02-28T21:30:00.000Z");
  });

  it("rolls into the next year", () => {
    expect(add("2026-12-15T08:00:00Z", 1)).toBe("2027-01-15T08:00:00.000Z");
  });

  it("keeps the same Israeli time across the switch to winter time", () => {
    // 10:00 summer time (07:00 UTC) → 10:00 winter time (08:00 UTC).
    expect(add("2026-10-20T07:00:00Z", 1)).toBe("2026-11-20T08:00:00.000Z");
  });

  it("keeps the same Israeli time across the switch to summer time", () => {
    // 10:00 winter time (08:00 UTC) → 10:00 summer time (07:00 UTC).
    expect(add("2027-02-26T08:00:00Z", 1)).toBe("2027-03-26T07:00:00.000Z");
  });

  it("handles a target just before the switch to winter time (the UTC day differs)", () => {
    // 23:30 on 24.9 in Israel (summer) → 23:30 on 24.10 (still summer: the switch is at 02:00 on 25.10).
    expect(add("2026-09-24T20:30:00Z", 1)).toBe("2026-10-24T20:30:00.000Z");
    // 00:30 on 25.9 → 00:30 on 25.10, still summer time.
    expect(add("2026-09-24T21:30:00Z", 1)).toBe("2026-10-24T21:30:00.000Z");
  });

  it("stays on the right Israeli date for a time that doesn't exist on the target day", () => {
    // 02:30 on 26.2.2027; on 26.3.2027 the clock jumps from 02:00 to 03:00.
    expect(israelDateString(addBillingMonths(new Date("2027-02-26T00:30:00Z"), 1))).toBe("26/03/2027");
  });

  it("moves the 1st of the month after midnight Israel time to the 1st of the next month", () => {
    // 00:30 on 1.10 in Israel (21:30 UTC on 30.9) → 00:30 on 1.11 in Israel (winter time).
    expect(add("2026-09-30T21:30:00Z", 1)).toBe("2026-10-31T22:30:00.000Z");
  });

  it("adds a full year for an annual plan", () => {
    expect(add("2026-10-20T07:00:00Z", 12)).toBe("2027-10-20T07:00:00.000Z");
  });

  it("goes back in time for negative months, clamping the day", () => {
    expect(add("2026-12-31T08:00:00Z", -2)).toBe("2026-10-31T08:00:00.000Z");
    expect(add("2027-12-31T08:00:00Z", -10)).toBe("2027-02-28T08:00:00.000Z");
    // 11:00 summer time on 31.3 → 11:00 winter time on 28.2.
    expect(add("2027-03-31T08:00:00Z", -1)).toBe("2027-02-28T09:00:00.000Z");
  });

  it("returns the same moment for 0 months (to the second)", () => {
    expect(add("2026-10-20T07:00:00Z", 0)).toBe("2026-10-20T07:00:00.000Z");
  });

  it("doesn't change the input date", () => {
    const from = new Date("2027-01-31T08:00:00Z");
    addBillingMonths(from, 1);
    expect(from.toISOString()).toBe("2027-01-31T08:00:00.000Z");
  });
});

describe("israelDateString (Finbot dd/mm/yyyy)", () => {
  it("dates a charge at 01:39 Israel time by the Israeli date", () => {
    expect(israelDateString(new Date("2026-08-27T22:39:00Z"))).toBe("28/08/2026");
  });

  it("switches day at Israeli midnight in winter time (UTC+2)", () => {
    expect(israelDateString(new Date("2026-12-31T21:59:59Z"))).toBe("31/12/2026");
    expect(israelDateString(new Date("2026-12-31T22:00:00Z"))).toBe("01/01/2027");
  });

  it("switches day at Israeli midnight in summer time (UTC+3)", () => {
    expect(israelDateString(new Date("2026-07-14T20:59:59Z"))).toBe("14/07/2026");
    expect(israelDateString(new Date("2026-07-14T21:00:00Z"))).toBe("15/07/2026");
  });

  it("pads day and month to two digits", () => {
    expect(israelDateString(new Date("2026-03-05T10:00:00Z"))).toBe("05/03/2026");
  });
});

describe("israelIsoDateString (Green Invoice yyyy-mm-dd)", () => {
  it("gives the Israeli date in ISO order", () => {
    expect(israelIsoDateString(new Date("2026-08-27T22:39:00Z"))).toBe("2026-08-28");
    expect(israelIsoDateString(new Date("2026-12-31T22:00:00Z"))).toBe("2027-01-01");
    expect(israelIsoDateString(new Date("2026-03-05T10:00:00Z"))).toBe("2026-03-05");
  });
});
