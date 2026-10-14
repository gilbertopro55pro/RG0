// Campaign tracking (owner, 2026-10-14; migration 0172). The chat link in an ad carries the
// campaign and ad names (Meta fills {{campaign.name}} / {{ad.name}} in the ad's URL parameters), the
// lead keeps them (leads.referral_campaign / referral_ad), the photographer enters what each campaign
// cost per month (ad_spend), and the report puts it together: leads, quotes, booked events, their
// value, and what each lead and each booking cost. Deleted leads count through lead_history.
// Pure functions only: used by the page, the spend route and the AI analysis route alike.

// What goes in the "URL parameters" field of a Meta ad whose destination is the chat link (?src=ad).
export const META_URL_PARAMS = "utm_campaign={{campaign.name}}&utm_content={{ad.name}}";

const MAX_NAME = 120;

// A campaign or ad name from a link or a form. Null when empty, or when it's the raw Meta placeholder
// (someone opened the link as written, outside an ad).
export function cleanCampaignName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  if (!v || /\{\{.*\}\}/.test(v)) return null;
  return v;
}

export function campaignFromSearch(search: string): { campaign: string | null; ad: string | null } {
  const q = new URLSearchParams(search);
  return { campaign: cleanCampaignName(q.get("utm_campaign")), ad: cleanCampaignName(q.get("utm_content")) };
}

// ---- Periods (months in Israel time, "YYYY-MM") ----

export const CAMPAIGN_PERIODS = ["this_month", "last_month", "last_3_months", "this_year"] as const;
export type CampaignPeriod = (typeof CAMPAIGN_PERIODS)[number];

export function isCampaignPeriod(v: unknown): v is CampaignPeriod {
  return typeof v === "string" && (CAMPAIGN_PERIODS as readonly string[]).includes(v);
}

export function israelMonth(at: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).formatToParts(new Date(at));
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// The months a period covers, oldest first.
export function periodMonths(period: CampaignPeriod, now: Date = new Date()): string[] {
  const cur = israelMonth(now);
  switch (period) {
    case "this_month":
      return [cur];
    case "last_month":
      return [shiftMonth(cur, -1)];
    case "last_3_months":
      return [shiftMonth(cur, -2), shiftMonth(cur, -1), cur];
    case "this_year": {
      const n = Number(cur.slice(5, 7));
      return Array.from({ length: n }, (_, i) => shiftMonth(cur, i - n + 1));
    }
  }
}

// ---- The report ----

// One lead, live (leads) or deleted (lead_history), reduced to what the report needs.
export type CampaignLead = {
  created_at: string;
  referral_source: string | null;
  referral_campaign: string | null;
  referral_ad: string | null;
  quoteSent: boolean;
  quoted_amount: number | null;
  converted_event_id: string | null;
  status: string | null;
  // Hours from the lead to the quote, when both are known (live leads only).
  hoursToQuote: number | null;
};

// The columns to select for each source.
export const LEAD_COLUMNS = "created_at, referral_source, referral_campaign, referral_ad, quote_sent_at, quoted_amount, converted_event_id, status";
export const HISTORY_COLUMNS = "lead_created_at, referral_source, referral_campaign, referral_ad, quote_sent, quoted_amount, converted_event_id, status";

export type LeadReportRow = {
  created_at: string;
  referral_source: string | null;
  referral_campaign: string | null;
  referral_ad: string | null;
  quote_sent_at: string | null;
  quoted_amount: number | string | null;
  converted_event_id: string | null;
  status: string | null;
};
export type HistoryReportRow = {
  lead_created_at: string;
  referral_source: string | null;
  referral_campaign: string | null;
  referral_ad: string | null;
  quote_sent: boolean;
  quoted_amount: number | string | null;
  converted_event_id: string | null;
  status: string | null;
};

const num = (v: number | string | null | undefined): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

export function fromLeadRow(r: LeadReportRow): CampaignLead {
  const hours = r.quote_sent_at ? (Date.parse(r.quote_sent_at) - Date.parse(r.created_at)) / 3_600_000 : null;
  return {
    created_at: r.created_at,
    referral_source: r.referral_source,
    referral_campaign: r.referral_campaign,
    referral_ad: r.referral_ad,
    quoteSent: !!r.quote_sent_at,
    quoted_amount: num(r.quoted_amount),
    converted_event_id: r.converted_event_id,
    status: r.status,
    hoursToQuote: hours !== null && hours >= 0 ? hours : null,
  };
}

export function fromHistoryRow(r: HistoryReportRow): CampaignLead {
  return {
    created_at: r.lead_created_at,
    referral_source: r.referral_source,
    referral_campaign: r.referral_campaign,
    referral_ad: r.referral_ad,
    quoteSent: r.quote_sent,
    quoted_amount: num(r.quoted_amount),
    converted_event_id: r.converted_event_id,
    status: r.status,
    hoursToQuote: null,
  };
}

// A month's spend on one campaign. Rows synced from a connected Meta ad account (lib/metaAds.ts)
// carry source "meta" and the campaign's impressions and clicks too.
export type AdSpendRow = {
  month: string;
  campaign: string;
  amount: number | string;
  source?: string | null;
  impressions?: number | null;
  clicks?: number | null;
};
export const SPEND_COLUMNS = "month, campaign, amount, source, impressions, clicks";

// The Meta ad account connection as the page shows it (never the token; lib/metaAds.ts metaStatus).
export type MetaStatus = {
  // META_APP_ID / META_APP_SECRET are set, so the connect button can work.
  configured: boolean;
  connected: boolean;
  accountId: string | null;
  accountName: string | null;
  currency: string | null;
  accounts: { id: string; name: string; currency: string | null }[];
  lastSyncAt: string | null;
  lastError: string | null;
  expiresAt: string | null;
};

// An event's value: what the photographer charges for it (event_payments deposit + balance).
export type EventPaymentValueRow = { event_id: string; deposit_amount: number | string | null; balance_amount: number | string | null };
export function eventValues(rows: EventPaymentValueRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.event_id] = (out[r.event_id] ?? 0) + (num(r.deposit_amount) ?? 0) + (num(r.balance_amount) ?? 0);
  return out;
}

export type CampaignRow = {
  // "c:<campaign>" for a named campaign, "s:<source>" for leads without one ("s:" = no source known).
  key: string;
  campaign: string | null;
  source: string | null;
  leads: number;
  quoted: number;
  booked: number;
  revenue: number;
  // What was entered (or synced from Meta) for this campaign over the period. Null when nothing was.
  spend: number | null;
  // From Meta, when the ad account is connected (0 otherwise).
  impressions: number;
  clicks: number;
  // Some of the period's spend came from Meta (so it isn't typed in by hand).
  metaSynced: boolean;
  // Leads and bookings per ad inside a campaign, most leads first.
  ads: { ad: string; leads: number; booked: number }[];
  // Median hours from lead to quote, over the leads where both are known.
  medianHoursToQuote: number | null;
};

export type CampaignReport = {
  months: string[];
  rows: CampaignRow[];
  totals: { leads: number; quoted: number; booked: number; revenue: number; spend: number; clicks: number };
};

export function isBooked(l: Pick<CampaignLead, "converted_event_id" | "status">): boolean {
  return !!l.converted_event_id || l.status === "won";
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function buildCampaignReport(input: { leads: CampaignLead[]; spend: AdSpendRow[]; eventValue: Record<string, number>; months: string[] }): CampaignReport {
  const inPeriod = new Set(input.months);
  type Acc = CampaignRow & { adMap: Map<string, { leads: number; booked: number }>; hours: number[] };
  const rows = new Map<string, Acc>();
  const row = (key: string, campaign: string | null, source: string | null): Acc => {
    let r = rows.get(key);
    if (!r) {
      r = { key, campaign, source, leads: 0, quoted: 0, booked: 0, revenue: 0, spend: null, impressions: 0, clicks: 0, metaSynced: false, ads: [], medianHoursToQuote: null, adMap: new Map(), hours: [] };
      rows.set(key, r);
    }
    return r;
  };

  for (const l of input.leads) {
    if (!inPeriod.has(israelMonth(l.created_at))) continue;
    const r = l.referral_campaign ? row(`c:${l.referral_campaign}`, l.referral_campaign, l.referral_source) : row(`s:${l.referral_source ?? ""}`, null, l.referral_source);
    const booked = isBooked(l);
    r.leads++;
    if (l.quoteSent || l.quoted_amount !== null || booked || l.status === "quoted") r.quoted++;
    if (booked) {
      r.booked++;
      r.revenue += (l.converted_event_id ? input.eventValue[l.converted_event_id] : undefined) ?? l.quoted_amount ?? 0;
    }
    if (l.hoursToQuote !== null) r.hours.push(l.hoursToQuote);
    if (l.referral_campaign && l.referral_ad) {
      const a = r.adMap.get(l.referral_ad) ?? { leads: 0, booked: 0 };
      a.leads++;
      if (booked) a.booked++;
      r.adMap.set(l.referral_ad, a);
    }
  }

  for (const s of input.spend) {
    if (!inPeriod.has(s.month)) continue;
    const amount = num(s.amount) ?? 0;
    // Spend without a campaign name belongs to the ads that came without one.
    const r = s.campaign ? row(`c:${s.campaign}`, s.campaign, "ad") : row("s:ad", null, "ad");
    r.spend = (r.spend ?? 0) + amount;
    r.impressions += num(s.impressions) ?? 0;
    r.clicks += num(s.clicks) ?? 0;
    if (s.source === "meta") r.metaSynced = true;
  }

  const out: CampaignRow[] = [...rows.values()].map(({ adMap, hours, ...r }) => ({
    ...r,
    ads: [...adMap.entries()].map(([ad, v]) => ({ ad, ...v })).sort((a, b) => b.leads - a.leads),
    medianHoursToQuote: median(hours),
  }));
  out.sort((a, b) => {
    const ac = a.campaign ? 0 : 1;
    const bc = b.campaign ? 0 : 1;
    if (ac !== bc) return ac - bc;
    return (b.spend ?? 0) - (a.spend ?? 0) || b.leads - a.leads;
  });
  const totals = out.reduce(
    (t, r) => ({ leads: t.leads + r.leads, quoted: t.quoted + r.quoted, booked: t.booked + r.booked, revenue: t.revenue + r.revenue, spend: t.spend + (r.spend ?? 0), clicks: t.clicks + r.clicks }),
    { leads: 0, quoted: 0, booked: 0, revenue: 0, spend: 0, clicks: 0 }
  );
  return { months: input.months, rows: out, totals };
}

// ---- The AI analysis (api/campaigns/insights) ----

export type CampaignInsights = {
  // One or two sentences: the overall picture.
  summary: string;
  // Concrete suggestions, most important first.
  tips: string[];
  // Set when there isn't enough data to say much yet.
  lowData: boolean;
};
