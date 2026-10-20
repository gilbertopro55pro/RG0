import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_PERIODS,
  META_URL_PARAMS,
  buildCampaignReport,
  campaignFromSearch,
  cleanCampaignName,
  eventValues,
  fromHistoryRow,
  fromLeadRow,
  isBooked,
  isCampaignPeriod,
  israelMonth,
  periodMonths,
  type AdSpendRow,
  type CampaignLead,
} from "@/lib/campaigns";

const lead = (over: Partial<CampaignLead> = {}): CampaignLead => ({
  created_at: "2026-10-05T10:00:00Z",
  referral_source: "ad",
  referral_campaign: null,
  referral_ad: null,
  quoteSent: false,
  quoted_amount: null,
  converted_event_id: null,
  status: "new",
  hoursToQuote: null,
  ...over,
});

const OCT = ["2026-10"];

describe("cleanCampaignName", () => {
  it("keeps a real name, collapsing and trimming whitespace", () => {
    expect(cleanCampaignName("  Summer   Sale\n2026 ")).toBe("Summer Sale 2026");
    expect(cleanCampaignName("חתונות קיץ")).toBe("חתונות קיץ");
  });

  it("is null for empty and non-string values", () => {
    expect(cleanCampaignName("")).toBeNull();
    expect(cleanCampaignName("   ")).toBeNull();
    expect(cleanCampaignName(null)).toBeNull();
    expect(cleanCampaignName(undefined)).toBeNull();
    expect(cleanCampaignName(42)).toBeNull();
  });

  it("is null for Meta's raw placeholder (the link opened outside an ad)", () => {
    expect(cleanCampaignName("{{campaign.name}}")).toBeNull();
    expect(cleanCampaignName("{{ad.name}}")).toBeNull();
  });

  it("cuts long names to 120 characters", () => {
    expect(cleanCampaignName("x".repeat(300))).toBe("x".repeat(120));
  });
});

describe("campaignFromSearch", () => {
  it("reads the campaign and ad Meta fills in", () => {
    expect(campaignFromSearch("?src=ad&utm_campaign=Summer%20Sale&utm_content=Video+1")).toEqual({ campaign: "Summer Sale", ad: "Video 1" });
  });

  it("works without the leading question mark", () => {
    expect(campaignFromSearch("utm_campaign=A&utm_content=B")).toEqual({ campaign: "A", ad: "B" });
  });

  it("gives nulls when the parameters are missing", () => {
    expect(campaignFromSearch("?src=ad")).toEqual({ campaign: null, ad: null });
    expect(campaignFromSearch("")).toEqual({ campaign: null, ad: null });
  });

  it("ignores the placeholders when the URL parameters were pasted as written", () => {
    expect(campaignFromSearch(`?src=ad&${META_URL_PARAMS}`)).toEqual({ campaign: null, ad: null });
  });
});

describe("periods", () => {
  it("knows its four periods", () => {
    expect(CAMPAIGN_PERIODS).toEqual(["this_month", "last_month", "last_3_months", "this_year"]);
    for (const p of CAMPAIGN_PERIODS) expect(isCampaignPeriod(p)).toBe(true);
    expect(isCampaignPeriod("last_week")).toBe(false);
    expect(isCampaignPeriod(undefined)).toBe(false);
  });

  it("puts a moment in its Israeli month", () => {
    // 00:30 on 1.10 in Israel (summer time) is still September in UTC.
    expect(israelMonth("2026-09-30T21:30:00Z")).toBe("2026-10");
    expect(israelMonth("2026-09-30T20:59:59Z")).toBe("2026-09");
    // Winter time: midnight is 22:00 UTC.
    expect(israelMonth("2026-11-30T21:59:59Z")).toBe("2026-11");
    expect(israelMonth("2026-11-30T22:00:00Z")).toBe("2026-12");
    expect(israelMonth(new Date("2026-12-31T22:30:00Z"))).toBe("2027-01");
  });

  it("lists a period's months, oldest first", () => {
    const now = new Date("2026-10-20T09:00:00Z");
    expect(periodMonths("this_month", now)).toEqual(["2026-10"]);
    expect(periodMonths("last_month", now)).toEqual(["2026-09"]);
    expect(periodMonths("last_3_months", now)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(periodMonths("this_year", now)).toEqual([
      "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
  });

  it("crosses the year in January", () => {
    const now = new Date("2027-01-15T09:00:00Z");
    expect(periodMonths("last_month", now)).toEqual(["2026-12"]);
    expect(periodMonths("last_3_months", now)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(periodMonths("this_year", now)).toEqual(["2027-01"]);
  });

  it("covers all 12 months of the year in December", () => {
    expect(periodMonths("this_year", new Date("2026-12-10T09:00:00Z"))).toHaveLength(12);
  });

  it("uses the Israeli month on New Year's night", () => {
    // 00:30 on 1.1.2027 in Israel, still 2026 in UTC.
    const now = new Date("2026-12-31T22:30:00Z");
    expect(periodMonths("this_month", now)).toEqual(["2027-01"]);
    expect(periodMonths("this_year", now)).toEqual(["2027-01"]);
  });
});

describe("fromLeadRow / fromHistoryRow", () => {
  const base = {
    created_at: "2026-10-05T10:00:00Z",
    referral_source: "ad",
    referral_campaign: "Summer",
    referral_ad: "Video A",
    quote_sent_at: null as string | null,
    quoted_amount: null as number | string | null,
    converted_event_id: null,
    status: "new",
  };

  it("measures the hours from lead to quote", () => {
    const l = fromLeadRow({ ...base, quote_sent_at: "2026-10-06T12:00:00Z", quoted_amount: "2300.50" });
    expect(l.quoteSent).toBe(true);
    expect(l.hoursToQuote).toBe(26);
    expect(l.quoted_amount).toBe(2300.5);
  });

  it("ignores a quote time that is before the lead", () => {
    expect(fromLeadRow({ ...base, quote_sent_at: "2026-10-05T09:00:00Z" }).hoursToQuote).toBeNull();
  });

  it("has no quote and no hours without quote_sent_at", () => {
    const l = fromLeadRow(base);
    expect(l.quoteSent).toBe(false);
    expect(l.hoursToQuote).toBeNull();
    expect(l.quoted_amount).toBeNull();
    expect(fromLeadRow({ ...base, quoted_amount: "" }).quoted_amount).toBeNull();
  });

  it("reads a deleted lead's history row, with no hours", () => {
    const l = fromHistoryRow({
      lead_created_at: "2026-10-01T08:00:00Z",
      referral_source: "ad",
      referral_campaign: "Summer",
      referral_ad: null,
      quote_sent: true,
      quoted_amount: "4000",
      converted_event_id: null,
      status: "lost",
    });
    expect(l).toEqual({
      created_at: "2026-10-01T08:00:00Z",
      referral_source: "ad",
      referral_campaign: "Summer",
      referral_ad: null,
      quoteSent: true,
      quoted_amount: 4000,
      converted_event_id: null,
      status: "lost",
      hoursToQuote: null,
    });
  });
});

describe("eventValues", () => {
  it("adds deposit and balance per event, across rows", () => {
    expect(
      eventValues([
        { event_id: "e1", deposit_amount: 1000, balance_amount: "4200" },
        { event_id: "e2", deposit_amount: null, balance_amount: 3000 },
        { event_id: "e1", deposit_amount: "500.5", balance_amount: null },
      ])
    ).toEqual({ e1: 5700.5, e2: 3000 });
  });

  it("counts an event with no amounts as 0", () => {
    expect(eventValues([{ event_id: "e3", deposit_amount: null, balance_amount: "" }])).toEqual({ e3: 0 });
  });
});

describe("isBooked", () => {
  it("is a lead that became an event, or was marked won", () => {
    expect(isBooked({ converted_event_id: "e1", status: "new" })).toBe(true);
    expect(isBooked({ converted_event_id: null, status: "won" })).toBe(true);
    expect(isBooked({ converted_event_id: null, status: "quoted" })).toBe(false);
  });
});

describe("buildCampaignReport", () => {
  it("adds up a campaign: leads, quotes, bookings, revenue, spend, clicks, ads and time to quote", () => {
    const leads = [
      lead({ referral_campaign: "Summer", referral_ad: "Video A" }),
      lead({ referral_campaign: "Summer", referral_ad: "Video A", quoteSent: true, quoted_amount: 3000, hoursToQuote: 2 }),
      lead({ referral_campaign: "Summer", referral_ad: "Carousel", quoteSent: true, quoted_amount: 4000, converted_event_id: "e1", hoursToQuote: 10 }),
      lead({ referral_campaign: "Summer", referral_ad: "Video A", quoted_amount: 2500, status: "won", hoursToQuote: 5 }),
      // 23:00 on 30.9 in Israel: September, outside the period.
      lead({ created_at: "2026-09-30T20:00:00Z", referral_campaign: "Summer", referral_ad: "Video A", converted_event_id: "e9" }),
    ];
    const spend: AdSpendRow[] = [
      { month: "2026-10", campaign: "Summer", amount: 1000, source: "meta", impressions: 20000, clicks: 400 },
      { month: "2026-10", campaign: "Summer", amount: "250.50", source: "manual" },
      { month: "2026-09", campaign: "Summer", amount: 800, source: "meta", impressions: 9000, clicks: 100 },
    ];
    const report = buildCampaignReport({ leads, spend, eventValue: { e1: 5200, e9: 9999 }, months: OCT });

    expect(report.months).toEqual(OCT);
    expect(report.rows).toHaveLength(1);
    const r = report.rows[0];
    expect(r).toMatchObject({
      key: "c:Summer",
      campaign: "Summer",
      source: "ad",
      leads: 4,
      quoted: 3,
      booked: 2,
      // The booked event's real value (5200), plus the won lead's quote (2500).
      revenue: 7700,
      spend: 1250.5,
      impressions: 20000,
      clicks: 400,
      metaSynced: true,
      medianHoursToQuote: 5,
    });
    expect(r.ads).toEqual([
      { ad: "Video A", leads: 3, booked: 1 },
      { ad: "Carousel", leads: 1, booked: 1 },
    ]);
    expect(report.totals).toEqual({ leads: 4, quoted: 3, booked: 2, revenue: 7700, spend: 1250.5, clicks: 400 });
  });

  it("counts a lead as quoted by any sign of a quote", () => {
    const report = buildCampaignReport({
      leads: [
        lead({ referral_campaign: "C", quoteSent: true }),
        lead({ referral_campaign: "C", quoted_amount: 1800 }),
        lead({ referral_campaign: "C", status: "quoted" }),
        lead({ referral_campaign: "C", converted_event_id: "e1" }),
        lead({ referral_campaign: "C" }),
      ],
      spend: [],
      eventValue: {},
      months: OCT,
    });
    expect(report.rows[0].quoted).toBe(4);
  });

  it("takes a booking's revenue from the event, else from the quote, else 0", () => {
    const report = buildCampaignReport({
      leads: [
        lead({ referral_campaign: "C", converted_event_id: "e1", quoted_amount: 1000 }),
        // An event without payment rows: the quote is the best estimate.
        lead({ referral_campaign: "C", converted_event_id: "e-no-payments", quoted_amount: 2000 }),
        lead({ referral_campaign: "C", status: "won" }),
      ],
      spend: [],
      eventValue: { e1: 6000 },
      months: OCT,
    });
    expect(report.rows[0].booked).toBe(3);
    expect(report.rows[0].revenue).toBe(8000);
  });

  it("groups leads without a campaign by their source", () => {
    const report = buildCampaignReport({
      leads: [
        lead({ referral_source: "form" }),
        lead({ referral_source: "form", referral_ad: "stray ad name" }),
        lead({ referral_source: null }),
      ],
      spend: [],
      eventValue: {},
      months: OCT,
    });
    const byKey = Object.fromEntries(report.rows.map((r) => [r.key, r]));
    expect(byKey["s:form"]).toMatchObject({ campaign: null, source: "form", leads: 2, spend: null, ads: [] });
    expect(byKey["s:"]).toMatchObject({ campaign: null, source: null, leads: 1 });
  });

  it("gives spend with no campaign name to the ads that came without one", () => {
    const report = buildCampaignReport({
      leads: [lead({ referral_source: "ad" })],
      spend: [{ month: "2026-10", campaign: "", amount: 300 }],
      eventValue: {},
      months: OCT,
    });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ key: "s:ad", leads: 1, spend: 300 });
  });

  it("shows a campaign that cost money but brought no leads", () => {
    const report = buildCampaignReport({ leads: [], spend: [{ month: "2026-10", campaign: "Dud", amount: 450 }], eventValue: {}, months: OCT });
    expect(report.rows[0]).toMatchObject({ key: "c:Dud", campaign: "Dud", source: "ad", leads: 0, booked: 0, revenue: 0, spend: 450, metaSynced: false });
  });

  it("keeps spend null when nothing was entered, and 0 when 0 was", () => {
    const report = buildCampaignReport({
      leads: [lead({ referral_campaign: "NoSpend" }), lead({ referral_campaign: "Zero" })],
      spend: [{ month: "2026-10", campaign: "Zero", amount: 0 }],
      eventValue: {},
      months: OCT,
    });
    const byKey = Object.fromEntries(report.rows.map((r) => [r.key, r]));
    expect(byKey["c:NoSpend"].spend).toBeNull();
    expect(byKey["c:Zero"].spend).toBe(0);
  });

  it("adds spend over every month of a longer period, and only those", () => {
    const report = buildCampaignReport({
      leads: [],
      spend: [
        { month: "2026-07", campaign: "C", amount: 999 },
        { month: "2026-08", campaign: "C", amount: 100 },
        { month: "2026-09", campaign: "C", amount: 200 },
        { month: "2026-10", campaign: "C", amount: 300 },
      ],
      eventValue: {},
      months: ["2026-08", "2026-09", "2026-10"],
    });
    expect(report.rows[0].spend).toBe(600);
  });

  it("takes the median of an even number of quote times", () => {
    const report = buildCampaignReport({
      leads: [4, 1, 3, 2].map((h) => lead({ referral_campaign: "C", hoursToQuote: h })),
      spend: [],
      eventValue: {},
      months: OCT,
    });
    expect(report.rows[0].medianHoursToQuote).toBe(2.5);
  });

  it("lists named campaigns first, by spend and then by leads, and the other sources after", () => {
    const report = buildCampaignReport({
      leads: [
        lead({ referral_source: "form" }),
        lead({ referral_source: "form" }),
        lead({ referral_source: "form" }),
        lead({ referral_campaign: "Cheap" }),
        lead({ referral_campaign: "Cheap" }),
        lead({ referral_campaign: "NoSpendFew" }),
        lead({ referral_campaign: "NoSpendMany" }),
        lead({ referral_campaign: "NoSpendMany" }),
      ],
      spend: [
        { month: "2026-10", campaign: "Big", amount: 2000 },
        { month: "2026-10", campaign: "Cheap", amount: 100 },
      ],
      eventValue: {},
      months: OCT,
    });
    expect(report.rows.map((r) => r.key)).toEqual(["c:Big", "c:Cheap", "c:NoSpendMany", "c:NoSpendFew", "s:form"]);
    expect(report.totals).toEqual({ leads: 8, quoted: 0, booked: 0, revenue: 0, spend: 2100, clicks: 0 });
  });

  it("gives an empty report for no data", () => {
    expect(buildCampaignReport({ leads: [], spend: [], eventValue: {}, months: OCT })).toEqual({
      months: OCT,
      rows: [],
      totals: { leads: 0, quoted: 0, booked: 0, revenue: 0, spend: 0, clicks: 0 },
    });
  });
});
