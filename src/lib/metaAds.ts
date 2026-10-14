import { createHmac } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanCampaignName, israelMonth, type MetaStatus } from "@/lib/campaigns";

// A connected Meta ad account for campaign tracking (owner, 2026-10-14; admin only for now,
// lib/campaignsAccess.ts; migration 0173). The photographer signs in with Facebook once
// (api/meta/connect → api/meta/callback), picks the ad account, and each campaign's monthly spend,
// impressions and clicks are synced into ad_spend (source "meta"), matched to the leads by campaign
// name: the chat link's utm_campaign is {{campaign.name}}.
//
// Setup (Meta app, Vercel env): META_APP_ID, META_APP_SECRET (sensitive), and optionally
// META_LOGIN_CONFIG_ID (a "Facebook Login for Business" configuration with ads_read; without it the
// classic login asks for scope=ads_read). Reading one's own ad account needs no App Review; other
// photographers' accounts would need Meta's Advanced Access review and business verification.
// Server only: the access token never leaves the server (meta_ad_connections has no RLS policy).

const VERSION = process.env.META_GRAPH_VERSION || "v23.0";
const GRAPH = `https://graph.facebook.com/${VERSION}`;
// Months synced back from the current one (13 months including it).
const SYNC_MONTHS = 12;

export function metaConfigured(): boolean {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function metaRedirectUri(): string {
  return process.env.META_REDIRECT_URI || "https://myframeflow.com/api/meta/callback";
}

export function metaAuthUrl(state: string): string {
  const p = new URLSearchParams({ client_id: process.env.META_APP_ID ?? "", redirect_uri: metaRedirectUri(), state, response_type: "code" });
  const configId = process.env.META_LOGIN_CONFIG_ID;
  if (configId) {
    p.set("config_id", configId);
    p.set("override_default_response_type", "true");
  } else {
    p.set("scope", "ads_read");
  }
  return `https://www.facebook.com/${VERSION}/dialog/oauth?${p}`;
}

export class MetaError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
  }
}

function appSecretProof(token: string): string {
  return createHmac("sha256", process.env.META_APP_SECRET ?? "").update(token).digest("hex");
}

async function getJson<T>(url: URL): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
  if (!res.ok || data.error) throw new MetaError(data.error?.message ?? `Meta HTTP ${res.status}`, data.error?.code);
  return data as T;
}

async function graph<T>(pathOrUrl: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH}${pathOrUrl}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  url.searchParams.set("appsecret_proof", appSecretProof(token));
  return getJson<T>(url);
}

// The sign-in code → a long-lived user token (about 60 days). Falls back to the short-lived one when
// the exchange isn't available (a Login for Business token can already be long-lived).
export async function exchangeCode(code: string): Promise<{ token: string; expiresAt: string | null }> {
  const base = { client_id: process.env.META_APP_ID ?? "", client_secret: process.env.META_APP_SECRET ?? "" };
  const shortUrl = new URL(`${GRAPH}/oauth/access_token`);
  for (const [k, v] of Object.entries({ ...base, redirect_uri: metaRedirectUri(), code })) shortUrl.searchParams.set(k, v);
  const short = await getJson<{ access_token: string; expires_in?: number }>(shortUrl);
  let token = short.access_token;
  let expiresIn = short.expires_in ?? null;
  try {
    const longUrl = new URL(`${GRAPH}/oauth/access_token`);
    for (const [k, v] of Object.entries({ ...base, grant_type: "fb_exchange_token", fb_exchange_token: token })) longUrl.searchParams.set(k, v);
    const long = await getJson<{ access_token: string; expires_in?: number }>(longUrl);
    token = long.access_token;
    expiresIn = long.expires_in ?? null;
  } catch (e) {
    console.error("Meta long-lived token exchange failed, keeping the short one:", e instanceof Error ? e.message : e);
  }
  return { token, expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null };
}

export type MetaAdAccount = { id: string; name: string; currency: string | null };

export async function listAdAccounts(token: string): Promise<MetaAdAccount[]> {
  const res = await graph<{ data?: { id: string; name?: string; currency?: string; account_status?: number }[] }>("/me/adaccounts", token, {
    fields: "name,currency,account_status",
    limit: "100",
  });
  return (res.data ?? []).map((a) => ({ id: a.id, name: a.name || a.id, currency: a.currency ?? null }));
}

type ConnectionRow = {
  access_token: string;
  token_expires_at: string | null;
  ad_account_id: string | null;
  ad_account_name: string | null;
  currency: string | null;
  ad_accounts: MetaAdAccount[] | null;
  last_sync_at: string | null;
  last_error: string | null;
};

const CONNECTION_COLUMNS = "access_token, token_expires_at, ad_account_id, ad_account_name, currency, ad_accounts, last_sync_at, last_error";

export async function loadConnection(service: SupabaseClient, photographerId: string): Promise<ConnectionRow | null> {
  const { data } = await service.from("meta_ad_connections").select(CONNECTION_COLUMNS).eq("photographer_id", photographerId).maybeSingle<ConnectionRow>();
  return data ?? null;
}

// What the page shows: everything but the token.
export async function metaStatus(service: SupabaseClient, photographerId: string): Promise<MetaStatus> {
  const c = await loadConnection(service, photographerId);
  return {
    configured: metaConfigured(),
    connected: !!c,
    accountId: c?.ad_account_id ?? null,
    accountName: c?.ad_account_name ?? null,
    currency: c?.currency ?? null,
    accounts: c?.ad_accounts ?? [],
    lastSyncAt: c?.last_sync_at ?? null,
    lastError: c?.last_error ?? null,
    expiresAt: c?.token_expires_at ?? null,
  };
}

function monthsBack(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

type InsightRow = { campaign_name?: string; spend?: string; impressions?: string; clicks?: string; date_start?: string };

// Pulls the chosen account's monthly spend, impressions and clicks per campaign (the last 13 months)
// and replaces the synced rows in ad_spend. A hand-typed row for the same campaign and month gives way
// to the synced one. Errors are kept on the connection (last_error) and thrown.
export async function syncMetaSpend(service: SupabaseClient, photographerId: string): Promise<void> {
  const c = await loadConnection(service, photographerId);
  if (!c?.ad_account_id) return;
  const thisMonth = israelMonth(new Date());
  const firstMonth = monthsBack(thisMonth, SYNC_MONTHS);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  try {
    const rows: InsightRow[] = [];
    let page = await graph<{ data?: InsightRow[]; paging?: { next?: string } }>(`/${c.ad_account_id}/insights`, c.access_token, {
      level: "campaign",
      fields: "campaign_name,spend,impressions,clicks",
      time_increment: "monthly",
      time_range: JSON.stringify({ since: `${firstMonth}-01`, until: today }),
      limit: "500",
    });
    for (let i = 0; i < 20; i++) {
      rows.push(...(page.data ?? []));
      if (!page.paging?.next) break;
      page = await graph(page.paging.next, c.access_token);
    }

    // One row per month and campaign name (the name as the chat link carries it: cleaned, 120 chars).
    const merged = new Map<string, { month: string; campaign: string; amount: number; impressions: number; clicks: number }>();
    for (const r of rows) {
      const campaign = cleanCampaignName(r.campaign_name);
      const month = r.date_start?.slice(0, 7);
      if (!campaign || !month || !/^\d{4}-\d{2}$/.test(month)) continue;
      const key = `${month}|${campaign}`;
      const cur = merged.get(key) ?? { month, campaign, amount: 0, impressions: 0, clicks: 0 };
      cur.amount += Number(r.spend ?? 0) || 0;
      cur.impressions += Number(r.impressions ?? 0) || 0;
      cur.clicks += Number(r.clicks ?? 0) || 0;
      merged.set(key, cur);
    }
    const now = new Date().toISOString();
    const upserts = [...merged.values()]
      .filter((r) => r.amount > 0 || r.impressions > 0)
      .map((r) => ({
        photographer_id: photographerId,
        month: r.month,
        campaign: r.campaign,
        amount: Math.round(r.amount * 100) / 100,
        impressions: Math.round(r.impressions),
        clicks: Math.round(r.clicks),
        source: "meta",
        updated_at: now,
      }));

    // Synced rows of the window are replaced as a whole, so a renamed or deleted campaign doesn't linger.
    const { error: delError } = await service.from("ad_spend").delete().eq("photographer_id", photographerId).eq("source", "meta").gte("month", firstMonth);
    if (delError) throw new Error(delError.message);
    if (upserts.length) {
      const { error } = await service.from("ad_spend").upsert(upserts, { onConflict: "photographer_id,month,campaign" });
      if (error) throw new Error(error.message);
    }
    await service.from("meta_ad_connections").update({ last_sync_at: now, last_error: null }).eq("photographer_id", photographerId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await service.from("meta_ad_connections").update({ last_error: message.slice(0, 500) }).eq("photographer_id", photographerId);
    throw e;
  }
}
