import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { checkRateLimit } from "@/lib/rateLimit";
import { photographerLang } from "@/lib/clientLang";
import { sourceLabel } from "@/lib/leadSource";
import {
  HISTORY_COLUMNS,
  LEAD_COLUMNS,
  buildCampaignReport,
  eventValues,
  fromHistoryRow,
  fromLeadRow,
  isCampaignPeriod,
  periodMonths,
  type AdSpendRow,
  type CampaignInsights,
  type EventPaymentValueRow,
  type HistoryReportRow,
  type LeadReportRow,
} from "@/lib/campaigns";
import { campaignsAllowed } from "@/lib/campaignsAccess";
import type { Lang } from "@/i18n/config";

export const runtime = "nodejs";
export const maxDuration = 60;

// "ניתוח והמלצות" on /leads/campaigns (owner, 2026-10-14): the period's campaign numbers go to Claude,
// which answers with a short summary and concrete tips. Only aggregate numbers are sent, never a
// client's name, phone or conversation. The answer is stored per period (campaign_insights) and
// returned again while the numbers are unchanged, so opening the page or asking twice costs nothing.

const MODEL = "claude-opus-5-5";
// Bump when the prompt changes, so stored answers from the old prompt are recomputed.
const PROMPT_VERSION = 2;

const LANGUAGE_NAME: Record<Lang, string> = { he: "Hebrew", en: "English", ru: "Russian" };

const SYSTEM = `You analyze the ad campaigns of an event photographer in Israel (weddings, bar and bat mitzvahs, brit ceremonies and similar). The photographer uses Gilberto, a management app: ads lead to an AI intake chat, every inquiry becomes a lead, the photographer sends a price quote, and a booked client becomes an event.

You get the numbers for one period, per campaign (or per source for leads without a campaign name): leads, quotes sent, booked events, revenue (the booked events' value, in ILS), ad spend the photographer entered (ILS, null when not entered), median hours from inquiry to quote, and leads per ad.

Write a short, honest analysis and 3 to 5 concrete tips that would improve results: where to move budget, which campaign or ad to pause or scale, what to test in the creative or audience, how fast to answer, how to follow up on quotes that got no answer.

Rules:
- Every statement must come from the numbers given. Never invent numbers, benchmarks or facts about the ads you can't see.
- Small numbers are not proof. With fewer than 10 leads in a campaign or fewer than 3 bookings, say the sample is small and phrase the tip as something to test. Set lowData to true when the period has fewer than 10 leads in total, or when no spend was entered at all.
- When spend is missing, one tip is to enter it, because cost per booked event can't be measured without it.
- When both are known, compare the cost per booked event with the average booking value.
- Write in {LANGUAGE}, plainly and directly, as a business advisor would speak to the owner. No marketing language, no emojis, no markdown. The summary is at most 2 sentences; each tip is at most 2 sentences.
- In Hebrew, address the photographer in the plural, as the rest of the app does ("שלחו", "הוצאתם", "כדאי לכם"), never in the singular masculine or feminine. Write "פנייה" (two yods) for an inquiry, "ליד" for a lead, "הצעת מחיר" for a quote.`;

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    tips: { type: "array", items: { type: "string" } },
    lowData: { type: "boolean" },
  },
  required: ["summary", "tips", "lowData"],
  additionalProperties: false,
};

// Nothing to analyze yet: answered without a model call.
const EMPTY: Record<Lang, CampaignInsights> = {
  he: { summary: "אין עדיין לידים או הוצאות על מודעות בתקופה הזו, ולכן אין מה לנתח.", tips: ["כדי שלידים מהמודעות יופיעו כאן, השתמשו בקישור ובפרמטרים שבהסבר \"איך מחברים מודעה במטא\".", "הזינו כמה הוצאתם על כל קמפיין, כדי שאפשר יהיה לחשב כמה עולה כל אירוע שנסגר."], lowData: true },
  en: { summary: "There are no leads or ad spend in this period yet, so there's nothing to analyze.", tips: ["For leads from your ads to show up here, use the link and parameters from \"How to connect a Meta ad\".", "Enter what you spent on each campaign, so the cost of each booked event can be calculated."], lowData: true },
  ru: { summary: "За этот период пока нет заявок и расходов на рекламу, поэтому анализировать нечего.", tips: ["Чтобы заявки из рекламы появлялись здесь, используйте ссылку и параметры из раздела «Как подключить рекламу в Meta».", "Укажите расходы на каждую кампанию, чтобы рассчитать стоимость каждого забронированного мероприятия."], lowData: true },
};

function isInsights(v: unknown): v is CampaignInsights {
  const o = v as CampaignInsights;
  return !!o && typeof o.summary === "string" && Array.isArray(o.tips) && o.tips.every((x) => typeof x === "string") && typeof o.lowData === "boolean";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  if (!campaignsAllowed(user.email)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { period?: unknown; force?: unknown } | null;
  if (!isCampaignPeriod(body?.period)) return NextResponse.json({ error: "תקופה לא תקינה" }, { status: 400 });
  const period = body.period;
  const force = body?.force === true;

  const [{ data: photographer }, { data: leads }, { data: history }, { data: spend }, { data: stored }] = await Promise.all([
    supabase.from("photographers").select("ui_lang").eq("id", user.id).maybeSingle<{ ui_lang: string | null }>(),
    supabase.from("leads").select(LEAD_COLUMNS).eq("photographer_id", user.id).returns<LeadReportRow[]>(),
    supabase.from("lead_history").select(HISTORY_COLUMNS).eq("photographer_id", user.id).returns<HistoryReportRow[]>(),
    supabase.from("ad_spend").select("month, campaign, amount").eq("photographer_id", user.id).returns<AdSpendRow[]>(),
    supabase.from("campaign_insights").select("data_hash, result, created_at").eq("photographer_id", user.id).eq("period", period).maybeSingle<{ data_hash: string; result: unknown; created_at: string }>(),
  ]);
  if (!photographer) return NextResponse.json({ error: "החשבון לא נמצא" }, { status: 404 });
  const lang = photographerLang(photographer.ui_lang);

  const all = [...(leads ?? []).map(fromLeadRow), ...(history ?? []).map(fromHistoryRow)];
  const eventIds = [...new Set(all.map((l) => l.converted_event_id).filter((id): id is string => !!id))];
  const { data: payments } = eventIds.length
    ? await supabase.from("event_payments").select("event_id, deposit_amount, balance_amount").in("event_id", eventIds).returns<EventPaymentValueRow[]>()
    : { data: [] as EventPaymentValueRow[] };
  const months = periodMonths(period);
  const report = buildCampaignReport({ leads: all, spend: spend ?? [], eventValue: eventValues(payments ?? []), months });

  // Aggregates only: what the model sees.
  const data = {
    months,
    totals: report.totals,
    rows: report.rows.map((r) => ({
      campaign: r.campaign,
      source: r.campaign ? null : r.source ? `${r.source} (${sourceLabel(r.source)})` : "unknown",
      leads: r.leads,
      quotesSent: r.quoted,
      booked: r.booked,
      revenue: Math.round(r.revenue),
      spend: r.spend === null ? null : Math.round(r.spend),
      medianHoursToQuote: r.medianHoursToQuote === null ? null : Math.round(r.medianHoursToQuote * 10) / 10,
      ads: r.ads.slice(0, 8),
    })),
  };
  const hash = createHash("sha256").update(JSON.stringify({ v: PROMPT_VERSION, lang, data })).digest("hex");

  const now = Date.now();
  if (stored && isInsights(stored.result)) {
    if (stored.data_hash === hash && !force) return NextResponse.json({ insights: stored.result, generatedAt: stored.created_at, cached: true });
    if (now - Date.parse(stored.created_at) < 60_000) {
      return NextResponse.json({ error: "הניתוח רץ לפני רגע. אפשר לנסות שוב בעוד דקה." }, { status: 429 });
    }
  }

  let insights: CampaignInsights;
  if (report.totals.leads === 0 && report.totals.spend === 0) {
    insights = EMPTY[lang];
  } else {
    const { allowed } = await checkRateLimit(`campaign-insights:${user.id}`, { maxRequests: 20, windowSeconds: 86_400 });
    if (!allowed) return NextResponse.json({ error: "הגעתם למספר הניתוחים היומי. אפשר לנסות שוב מחר." }, { status: 429 });
    try {
      const response = await new Anthropic().beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
        system: SYSTEM.replace("{LANGUAGE}", LANGUAGE_NAME[lang]),
        messages: [{ role: "user", content: `Campaign numbers for this period (JSON):\n${JSON.stringify(data)}` }],
      });
      if (response.stop_reason === "refusal") throw new Error(`refusal: ${response.stop_details?.category ?? "unknown"}`);
      const text = response.content.find((b) => b.type === "text");
      const parsed: unknown = text && text.type === "text" ? JSON.parse(text.text) : null;
      if (!isInsights(parsed)) throw new Error("unexpected answer shape");
      insights = { summary: parsed.summary.trim(), tips: parsed.tips.map((x) => x.trim()).filter(Boolean).slice(0, 6), lowData: parsed.lowData };
    } catch (e) {
      console.error("campaign insights failed:", user.id, e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
      return NextResponse.json({ error: "הניתוח נכשל. אפשר לנסות שוב בעוד כמה דקות." }, { status: 502 });
    }
  }

  const generatedAt = new Date(now).toISOString();
  // No write policy on campaign_insights: the server stores it, scoped to this photographer.
  await createServiceRoleClient()
    .from("campaign_insights")
    .upsert({ photographer_id: user.id, period, data_hash: hash, lang, result: insights, created_at: generatedAt }, { onConflict: "photographer_id,period" });
  return NextResponse.json({ insights, generatedAt, cached: false });
}
