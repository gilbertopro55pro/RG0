import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Photographer } from "@/lib/types";
import { hasAppAccess } from "@/lib/subscription";
import { chatLinkFor } from "@/lib/intakeGreeting";
import {
  CAMPAIGN_PERIODS,
  HISTORY_COLUMNS,
  LEAD_COLUMNS,
  eventValues,
  fromHistoryRow,
  fromLeadRow,
  isCampaignPeriod,
  periodMonths,
  type AdSpendRow,
  type EventPaymentValueRow,
  type HistoryReportRow,
  type LeadReportRow,
} from "@/lib/campaigns";
import { campaignsAllowed } from "@/lib/campaignsAccess";
import CampaignsView, { type StoredInsight } from "@/components/CampaignsView";

// Campaign tracking (owner, 2026-10-14; lib/campaigns.ts, migration 0172): which ad campaign brought
// each lead, what it cost, and what came back. Everything is read with the photographer's own client
// (RLS keeps it to their rows); the report itself is computed in the view, per selected period.

const PAGE = 1000;

// PostgREST answers at most 1000 rows per request: read page after page until a short one.
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < PAGE * 50; from += PAGE) {
    const { data } = await page(from, from + PAGE - 1);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export default async function CampaignsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: photographer } = await supabase.from("photographers").select("*").eq("id", user!.id).maybeSingle<Photographer>();
  if (!photographer) redirect("/");
  if (!hasAppAccess(photographer)) redirect("/billing");
  if (!campaignsAllowed(photographer.email)) redirect("/leads");

  // Computed once here and passed down, so the server and the browser agree on "this month".
  const now = new Date();
  // The oldest month any period reaches (January, or two months back early in the year), with a
  // day's margin for the Israel time offset; the report filters by Israel month exactly.
  const firstMonth = CAMPAIGN_PERIODS.map((p) => periodMonths(p, now)[0]).sort()[0];
  const [fy, fm] = firstMonth.split("-").map(Number);
  const since = new Date(Date.UTC(fy, fm - 1, 1) - 86_400_000).toISOString();

  const [leadRows, historyRows, { data: spend }, { data: insightRows }] = await Promise.all([
    // Archived leads count too: they were still leads.
    fetchAll<LeadReportRow>((from, to) =>
      supabase.from("leads").select(LEAD_COLUMNS).eq("photographer_id", user!.id).gte("created_at", since).order("created_at").range(from, to).returns<LeadReportRow[]>()
    ),
    fetchAll<HistoryReportRow>((from, to) =>
      supabase
        .from("lead_history")
        .select(HISTORY_COLUMNS)
        .eq("photographer_id", user!.id)
        .gte("lead_created_at", since)
        .order("lead_created_at")
        .range(from, to)
        .returns<HistoryReportRow[]>()
    ),
    supabase.from("ad_spend").select("month, campaign, amount").eq("photographer_id", user!.id).gte("month", firstMonth).returns<AdSpendRow[]>(),
    supabase.from("campaign_insights").select("period, result, created_at").eq("photographer_id", user!.id).returns<StoredInsight[]>(),
  ]);

  // What each booked event is worth (deposit + balance).
  const eventIds = [...new Set([...leadRows, ...historyRows].map((r) => r.converted_event_id).filter((id): id is string => !!id))];
  const payments: EventPaymentValueRow[] = [];
  for (let i = 0; i < eventIds.length; i += 200) {
    const { data } = await supabase
      .from("event_payments")
      .select("event_id, deposit_amount, balance_amount")
      .in("event_id", eventIds.slice(i, i + 200))
      .returns<EventPaymentValueRow[]>();
    payments.push(...(data ?? []));
  }

  const chatPath = `/chat/${photographer.portfolio_slug ?? photographer.intake_chat_token}`;

  return (
    <div className="max-w-md sm:max-w-none sm:w-[85%] lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <CampaignsView
        leads={[...leadRows.map(fromLeadRow), ...historyRows.map(fromHistoryRow)]}
        spend={spend ?? []}
        eventValue={eventValues(payments)}
        insights={(insightRows ?? []).filter((r) => isCampaignPeriod(r.period))}
        adLink={`${chatLinkFor(chatPath)}?src=ad`}
        nowIso={now.toISOString()}
      />
    </div>
  );
}
