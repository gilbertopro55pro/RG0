"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import BackLink from "@/components/BackLink";
import ToneTag from "@/components/ToneTag";
import { useT, useLang } from "@/i18n/client";
import { dateLocale } from "@/i18n/config";
import type { TFn } from "@/i18n/translate";
import { sourceLabel } from "@/lib/leadSource";
import {
  CAMPAIGN_PERIODS,
  META_URL_PARAMS,
  buildCampaignReport,
  cleanCampaignName,
  isCampaignPeriod,
  periodMonths,
  type AdSpendRow,
  type CampaignInsights,
  type CampaignLead,
  type CampaignPeriod,
  type CampaignRow,
  type MetaStatus,
} from "@/lib/campaigns";

// Campaign tracking (owner, 2026-10-14; app/leads/campaigns, lib/campaigns.ts): per campaign, the
// leads, quotes, booked events and their value against what the ads cost; the spend entered per
// campaign per month (api/campaigns/spend); an AI reading of the numbers (api/campaigns/insights);
// how to set the link up in a Meta ad; and the connected Meta ad account (lib/metaAds.ts), which
// syncs each campaign's spend, impressions and clicks so they aren't typed in by hand.

// A row of campaign_insights, as read by the page.
export type StoredInsight = { period: string; result: unknown; created_at: string };

const PERIOD_LABELS: Record<CampaignPeriod, string> = {
  this_month: "החודש",
  last_month: "החודש הקודם",
  last_3_months: "3 החודשים האחרונים",
  this_year: "השנה",
};

const MAX_AMOUNT = 10_000_000;

// "1,500" / "₪1500" → 1500; "" → null; undefined when it isn't an amount.
function parseAmount(value: string): number | null | undefined {
  const raw = value.replace(/[,\s₪]/g, "");
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) return undefined;
  return Math.round(n * 100) / 100;
}

function asInsights(v: unknown): CampaignInsights | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.summary !== "string") return null;
  const tips = Array.isArray(o.tips) ? o.tips.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  return { summary: o.summary, tips, lowData: o.lowData === true };
}

function monthName(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
}

function hoursText(h: number, t: TFn): string {
  if (h < 1) return t("פחות משעה");
  if (h < 1.5) return t("כשעה");
  if (h < 36) return t("{n} שעות", { n: Math.round(h) });
  return t("{n} ימים", { n: Math.round(h / 24) });
}

// Paid rows: a named campaign, or ads that came without a campaign name. Spend belongs only to these.
const isPaid = (r: CampaignRow) => r.campaign !== null || r.key === "s:ad";
const spendCampaign = (r: CampaignRow) => r.campaign ?? "";

type Insight = { result: CampaignInsights; createdAt: string };

// A sync older than this is refreshed in the background when the page opens.
const META_STALE_MS = 6 * 60 * 60 * 1000;

// ?meta= after the Facebook sign-in (api/meta/callback).
const META_RESULTS: Record<string, { text: string; error?: boolean }> = {
  connected: { text: "חשבון המודעות חובר, וההוצאות עודכנו ממטא." },
  choose: { text: "בחרו איזה חשבון מודעות לחבר." },
  denied: { text: "החיבור למטא בוטל.", error: true },
  error: { text: "החיבור למטא נכשל. נסו שוב.", error: true },
  no_accounts: { text: "לא נמצא חשבון מודעות במשתמש הפייסבוק הזה.", error: true },
  not_configured: { text: "החיבור למטא עוד לא הוגדר במערכת.", error: true },
};

export default function CampaignsView({
  leads,
  spend: initialSpend,
  eventValue,
  insights: storedInsights,
  adLink,
  nowIso,
  meta: initialMeta,
  metaResult,
}: {
  leads: CampaignLead[];
  spend: AdSpendRow[];
  eventValue: Record<string, number>;
  insights: StoredInsight[];
  adLink: string;
  nowIso: string;
  meta: MetaStatus;
  metaResult: string | null;
}) {
  const t = useT();
  const lang = useLang();
  const locale = dateLocale(lang);
  const money = (n: number) => `₪${Math.round(n).toLocaleString(locale)}`;
  const ratio = (n: number) => `×${n.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;

  const [period, setPeriod] = useState<CampaignPeriod>("this_month");
  const [spend, setSpend] = useState<AdSpendRow[]>(initialSpend);
  // Bumped after the "add campaign" form saves, so the per-row inputs pick up the new amounts.
  const [formRev, setFormRev] = useState(0);

  const [insights, setInsights] = useState<Partial<Record<CampaignPeriod, Insight>>>(() => {
    const out: Partial<Record<CampaignPeriod, Insight>> = {};
    for (const row of storedInsights) {
      const result = asInsights(row.result);
      if (result && isCampaignPeriod(row.period)) out[row.period] = { result, createdAt: row.created_at };
    }
    return out;
  });
  const [analyzing, setAnalyzing] = useState<CampaignPeriod | null>(null);
  const [insightError, setInsightError] = useState<{ period: CampaignPeriod; message: string } | null>(null);

  const [copied, setCopied] = useState<"link" | "params" | null>(null);

  const [meta, setMeta] = useState<MetaStatus>(initialMeta);
  const [metaBusy, setMetaBusy] = useState<"sync" | "account" | "disconnect" | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [pickAccount, setPickAccount] = useState(initialMeta.accounts[0]?.id ?? "");
  const [notice, setNotice] = useState(metaResult ? META_RESULTS[metaResult] ?? null : null);

  // One call for sync, account choice and disconnect: the answer carries the new status (and spend).
  const metaCall = async (kind: "sync" | "account" | "disconnect", body?: object) => {
    setMetaBusy(kind);
    setMetaError(null);
    try {
      const res = await fetch(`/api/meta/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const data = (await res.json().catch(() => ({}))) as { status?: MetaStatus; spend?: AdSpendRow[]; syncError?: string | null; error?: string };
      if (!res.ok || !data.status) {
        setMetaError(data.error ? t(data.error) : t("הפעולה נכשלה, נסו שוב"));
        return;
      }
      setMeta(data.status);
      if (data.spend) {
        setSpend(data.spend);
        setFormRev((r) => r + 1);
      }
      if (data.syncError) setMetaError(t("העדכון ממטא נכשל. אם זה חוזר, חברו את החשבון מחדש."));
    } catch {
      setMetaError(t("הפעולה נכשלה, נסו שוב"));
    } finally {
      setMetaBusy(null);
    }
  };

  // Opening the page refreshes a sync that's a few hours old, in the background.
  useEffect(() => {
    if (!initialMeta.connected || !initialMeta.accountId) return;
    const last = initialMeta.lastSyncAt ? Date.parse(initialMeta.lastSyncAt) : 0;
    if (Date.parse(nowIso) - last < META_STALE_MS) return;
    const timer = setTimeout(() => void metaCall("sync"), 0);
    return () => clearTimeout(timer);
    // Once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const months = useMemo(() => periodMonths(period, new Date(nowIso)), [period, nowIso]);
  const singleMonth = months.length === 1 ? months[0] : null;
  const report = useMemo(() => buildCampaignReport({ leads, spend, eventValue, months }), [leads, spend, eventValue, months]);

  const paidRows = report.rows.filter(isPaid);
  const otherRows = report.rows.filter((r) => !isPaid(r));
  const paid = paidRows.reduce(
    (s, r) => ({ leads: s.leads + r.leads, booked: s.booked + r.booked, revenue: s.revenue + r.revenue, spend: s.spend + (r.spend ?? 0) }),
    { leads: 0, booked: 0, revenue: 0, spend: 0 }
  );
  const hasAnyAdLead = useMemo(() => leads.some((l) => !!l.referral_campaign || l.referral_source === "ad"), [leads]);

  const rangeLabel = months.length === 1 ? monthName(months[0], locale) : `${monthName(months[0], locale)} – ${monthName(months[months.length - 1], locale)}`;

  // Optimistic: the report updates at once, and goes back if the server refuses. Returns the error.
  const saveSpend = async (month: string, campaign: string, amount: number | null): Promise<string | null> => {
    const same = (s: AdSpendRow) => s.month === month && s.campaign === campaign;
    const before = spend.find(same);
    setSpend((cur) => [...cur.filter((s) => !same(s)), ...(amount ? [{ month, campaign, amount }] : [])]);
    const revert = () => setSpend((cur) => [...cur.filter((s) => !same(s)), ...(before ? [before] : [])]);
    try {
      const res = await fetch("/api/campaigns/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, campaign, amount }),
      });
      if (res.ok) return null;
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      revert();
      return data.error ? t(data.error) : t("השמירה נכשלה, נסו שוב");
    } catch {
      revert();
      return t("השמירה נכשלה, נסו שוב");
    }
  };

  const addCampaign = async (e: FormEvent) => {
    e.preventDefault();
    if (!singleMonth || addSaving) return;
    const name = cleanCampaignName(addName);
    if (!name) {
      setAddError(t("חסר שם קמפיין"));
      return;
    }
    const amount = parseAmount(addAmount);
    if (!amount) {
      setAddError(t("סכום לא תקין"));
      return;
    }
    setAddSaving(true);
    setAddError(null);
    const err = await saveSpend(singleMonth, name, amount);
    setAddSaving(false);
    if (err) {
      setAddError(err);
      return;
    }
    setAddName("");
    setAddAmount("");
    setShowAdd(false);
    setFormRev((r) => r + 1);
  };

  const analyze = async () => {
    const p = period;
    if (analyzing) return;
    setAnalyzing(p);
    setInsightError(null);
    try {
      const res = await fetch("/api/campaigns/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: p, force: !!insights[p] }),
      });
      const data = (await res.json().catch(() => ({}))) as { insights?: unknown; generatedAt?: unknown; error?: string };
      const result = res.ok ? asInsights(data.insights) : null;
      if (!result) {
        setInsightError({ period: p, message: data.error ? t(data.error) : t("הניתוח נכשל, נסו שוב") });
        return;
      }
      const createdAt = typeof data.generatedAt === "string" ? data.generatedAt : new Date().toISOString();
      setInsights((cur) => ({ ...cur, [p]: { result, createdAt } }));
    } catch {
      setInsightError({ period: p, message: t("הניתוח נכשל, נסו שוב") });
    } finally {
      setAnalyzing(null);
    }
  };

  const copy = async (what: "link" | "params", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 1500);
    } catch {}
  };

  const rowTitle = (r: CampaignRow): string =>
    r.campaign ?? (r.key === "s:ad" ? t("מודעה (ללא שם קמפיין)") : r.source ? t(sourceLabel(r.source)!) : t("ללא מקור"));

  const stored = insights[period];
  const shownError = insightError?.period === period ? insightError.message : null;
  const isAnalyzing = analyzing === period;

  return (
    <div className="pb-8">
      <BackLink href="/leads" label={t("חזרה ללידים")} className="mb-5" />
      <h1 className="text-[26px] font-bold mb-1.5 font-display">{t("מעקב קמפיינים")}</h1>
      <p className="text-sm text-ink-soft mb-4">{t("כמה פניות, הצעות מחיר ואירועים הביא כל קמפיין, ומה כל אחד מהם עלה לכם.")}</p>

      {/* The Meta ad account: connect, pick the account, sync, disconnect (lib/metaAds.ts). */}
      <section aria-labelledby="campaigns-meta" className="rounded-2xl bg-card border border-line p-4 mb-5">
        <h2 id="campaigns-meta" className="text-base font-bold font-display mb-1">
          {t("חשבון המודעות במטא")}
        </h2>
        {notice && (
          <p
            className="text-xs rounded-lg px-3 py-2 mb-2.5"
            style={notice.error ? { background: "var(--color-rose-bg)", color: "var(--color-rose)" } : { background: "var(--color-sage-bg)", color: "var(--color-sage)" }}
          >
            {t(notice.text)}
            <button type="button" onClick={() => setNotice(null)} className="ms-2 underline" aria-label={t("סגירה")}>
              ✕
            </button>
          </p>
        )}
        {!meta.configured ? (
          <p className="text-sm text-ink-soft">{t("החיבור למטא עוד לא הוגדר במערכת. אחרי שתוקם האפליקציה במטא, יופיע כאן כפתור לחיבור החשבון.")}</p>
        ) : !meta.connected ? (
          <div className="grid gap-2.5">
            <p className="text-sm text-ink-soft">{t("מחברים פעם אחת, וההוצאה, ההופעות והקליקים של כל קמפיין מתעדכנים כאן לבד, בלי להקליד.")}</p>
            <a
              href="/api/meta/connect"
              className="justify-self-start h-10 px-4 rounded-full text-sm font-bold inline-flex items-center"
              style={{ background: "#1877F2", color: "#fff" }}
            >
              {t("חיבור חשבון המודעות במטא")}
            </a>
          </div>
        ) : !meta.accountId ? (
          <div className="grid gap-2.5">
            <p className="text-sm text-ink-soft">{t("למשתמש הזה יש כמה חשבונות מודעות. בחרו את החשבון של המודעות לצ'אט.")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={pickAccount}
                onChange={(e) => setPickAccount(e.target.value)}
                aria-label={t("חשבון מודעות")}
                className="rounded-lg px-3 py-2 text-sm border border-line"
                style={{ background: "var(--color-input-bg)" }}
              >
                {meta.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.currency ? ` (${a.currency})` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!pickAccount || !!metaBusy}
                onClick={() => void metaCall("account", { accountId: pickAccount })}
                className="h-10 px-4 rounded-full bg-ink text-white text-sm font-bold disabled:opacity-60"
              >
                {metaBusy === "account" ? t("מחבר…") : t("חיבור החשבון")}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            <div className="text-sm">
              {t("מחובר:")} <b dir="auto">{meta.accountName}</b>
            </div>
            <div className="text-xs text-ink-soft">
              {metaBusy === "sync"
                ? t("מעדכן ממטא…")
                : meta.lastSyncAt
                  ? t("עודכן לאחרונה: {time}", {
                      time: new Date(meta.lastSyncAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" }),
                    })
                  : t("עוד לא עודכן")}
            </div>
            {meta.currency && meta.currency !== "ILS" && (
              <p className="text-xs rounded-lg px-3 py-2" style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}>
                {t("חשבון המודעות מחויב ב-{currency}, וההוצאה מוצגת כאן בלי המרה לשקלים.", { currency: meta.currency })}
              </p>
            )}
            {meta.expiresAt && Date.parse(meta.expiresAt) - Date.parse(nowIso) < 7 * 24 * 3600 * 1000 && (
              <p className="text-xs rounded-lg px-3 py-2" style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}>
                {t("החיבור למטא פג או יפוג בקרוב. כדי שהנתונים ימשיכו להתעדכן, חברו את החשבון מחדש.")}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <button
                type="button"
                disabled={!!metaBusy}
                onClick={() => void metaCall("sync")}
                className="h-9 px-3.5 rounded-full border border-line text-[13px] font-bold disabled:opacity-60"
                style={{ background: "var(--color-input-bg)" }}
              >
                {t("עדכון ממטא")}
              </button>
              <a href="/api/meta/connect" className="h-9 px-3.5 rounded-full border border-line text-[13px] font-bold inline-flex items-center" style={{ background: "var(--color-input-bg)" }}>
                {t("חיבור מחדש")}
              </a>
              <button
                type="button"
                disabled={!!metaBusy}
                onClick={() => void metaCall("disconnect")}
                className="h-9 px-3 text-[13px] font-semibold text-ink-soft underline underline-offset-2 disabled:opacity-60"
              >
                {metaBusy === "disconnect" ? t("מנתק…") : t("ניתוק")}
              </button>
            </div>
          </div>
        )}
        {metaError && (
          <p className="text-xs rounded-lg px-3 py-2 mt-2" style={{ background: "var(--color-rose-bg)", color: "var(--color-rose)" }}>
            {metaError}
          </p>
        )}
      </section>

      {/* Period */}
      <div role="group" aria-label={t("תקופה")} className="flex flex-wrap gap-1.5 mb-1.5">
        {CAMPAIGN_PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            aria-pressed={period === p}
            className="rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-semibold border"
            style={
              period === p
                ? { background: "var(--color-amber-deep)", borderColor: "var(--color-amber-deep)", color: "var(--color-on-accent)" }
                : { background: "var(--color-input-bg)", borderColor: "var(--color-line)", color: "var(--color-ink-soft)" }
            }
          >
            {t(PERIOD_LABELS[p])}
          </button>
        ))}
      </div>
      <div className="text-xs text-ink-soft mb-4">{rangeLabel}</div>

      {/* Totals: the ads only, so the cost per booked event isn't diluted by bookings from other sources. */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-2">
        <Tile label={t("פניות ממודעות")} value={paid.leads.toLocaleString(locale)} />
        <Tile label={t("אירועים שנסגרו")} value={paid.booked.toLocaleString(locale)} />
        <Tile label={t("הכנסה")} value={money(paid.revenue)} />
        <Tile label={t("הוצאה על מודעות")} value={paid.spend > 0 ? money(paid.spend) : "—"} />
        <Tile
          label={t("עלות לאירוע שנסגר")}
          value={paid.spend > 0 && paid.booked > 0 ? money(paid.spend / paid.booked) : "—"}
          className="col-span-2 sm:col-span-1"
          lead
        />
      </div>
      {otherRows.length > 0 && (
        <p className="text-xs text-ink-soft mb-5">
          {t("מכל המקורות בתקופה: {leads} פניות, {booked} אירועים שנסגרו.", {
            leads: report.totals.leads.toLocaleString(locale),
            booked: report.totals.booked.toLocaleString(locale),
          })}
        </p>
      )}
      {otherRows.length === 0 && <div className="mb-5" />}

      {/* Campaigns and ads */}
      <section aria-labelledby="campaigns-paid" className="mb-6">
        <h2 id="campaigns-paid" className="text-lg font-bold font-display mb-1">
          {t("קמפיינים ומודעות")}
        </h2>
        {!singleMonth && paidRows.length > 0 && <p className="text-xs text-ink-soft mb-2">{t("להזנת הוצאה בחרו חודש אחד")}</p>}

        {paidRows.length === 0 ? (
          <div className="rounded-2xl bg-card p-4 text-sm text-ink-soft mt-2">
            {t("עדיין אין פניות ממודעות בתקופה הזו. הן יופיעו כאן ברגע שמודעה תפנה לקישור שבהמשך העמוד.")}
          </div>
        ) : (
          <div className="grid gap-3 mt-2">
            {paidRows.map((r) => (
              <RowCard key={r.key} row={r} title={rowTitle(r)} paid money={money} ratio={ratio} t={t}>
                {singleMonth && r.metaSynced && (
                  <div className="mt-3 pt-3 border-t border-line text-xs text-ink-soft">
                    {t("ההוצאה ב{month} מסונכרנת מחשבון המודעות במטא.", { month: monthName(singleMonth, locale) })}
                  </div>
                )}
                {singleMonth && !r.metaSynced && (
                  <div className="mt-3 pt-3 border-t border-line">
                    <SpendInput
                      key={`${singleMonth}|${r.key}|${formRev}`}
                      label={t("הוצאה על המודעות ב{month}", { month: monthName(singleMonth, locale) })}
                      initial={r.spend}
                      onSave={(amount) => saveSpend(singleMonth, spendCampaign(r), amount)}
                      t={t}
                    />
                  </div>
                )}
              </RowCard>
            ))}
          </div>
        )}

        {singleMonth && (
          <div className="mt-3">
            {!showAdd ? (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="text-xs font-semibold underline underline-offset-2"
                style={{ color: "var(--color-amber-deep)" }}
              >
                {t("+ הוספת קמפיין")}
              </button>
            ) : (
              <form onSubmit={addCampaign} className="rounded-2xl bg-card p-4 grid gap-2.5">
                <div className="text-sm font-semibold">{t("הוספת קמפיין")}</div>
                <p className="text-xs text-ink-soft">
                  {t("קמפיין שכבר הוצאתם עליו כסף ב{month}, גם אם עוד לא הגיעו ממנו פניות.", { month: monthName(singleMonth, locale) })}
                </p>
                <div className="grid sm:grid-cols-[1fr_auto] gap-2.5">
                  <div>
                    <label htmlFor="add-campaign-name" className="text-xs text-ink-soft block mb-1">
                      {t("שם הקמפיין, כמו שהוא מופיע במטא")}
                    </label>
                    <input
                      id="add-campaign-name"
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      maxLength={120}
                      dir="auto"
                      className="w-full rounded-lg px-3 py-2 text-sm border border-line"
                      style={{ background: "var(--color-input-bg)" }}
                    />
                  </div>
                  <div>
                    <label htmlFor="add-campaign-amount" className="text-xs text-ink-soft block mb-1">
                      {t("סכום (₪)")}
                    </label>
                    <input
                      id="add-campaign-amount"
                      value={addAmount}
                      onChange={(e) => setAddAmount(e.target.value)}
                      inputMode="decimal"
                      dir="ltr"
                      className="w-full sm:w-32 rounded-lg px-3 py-2 text-sm border border-line font-data"
                      style={{ background: "var(--color-input-bg)" }}
                    />
                  </div>
                </div>
                {addError && (
                  <p className="text-xs rounded-lg px-3 py-2" style={{ background: "var(--color-rose-bg)", color: "var(--color-rose)" }}>
                    {addError}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <button type="submit" disabled={addSaving} className="h-10 px-4 rounded-full bg-ink text-white text-sm font-bold disabled:opacity-60">
                    {addSaving ? t("שומר…") : t("הוספה")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdd(false);
                      setAddError(null);
                    }}
                    className="h-10 px-4 rounded-full text-sm font-semibold text-ink-soft"
                  >
                    {t("ביטול")}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </section>

      {/* Other sources: no spend, just what each brought. */}
      {otherRows.length > 0 && (
        <section aria-labelledby="campaigns-other" className="mb-6">
          <h2 id="campaigns-other" className="text-lg font-bold font-display mb-1">
            {t("מקורות אחרים")}
          </h2>
          <p className="text-xs text-ink-soft mb-2">{t("פניות שלא הגיעו ממודעה, לפי המקור שלהן.")}</p>
          <div className="grid gap-3">
            {otherRows.map((r) => (
              <RowCard key={r.key} row={r} title={rowTitle(r)} paid={false} money={money} ratio={ratio} t={t} />
            ))}
          </div>
        </section>
      )}

      {/* AI analysis */}
      <section aria-labelledby="campaigns-insights" className="rounded-2xl bg-card border border-line p-4 mb-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <h2 id="campaigns-insights" className="text-lg font-bold font-display">
              {t("ניתוח והמלצות")}
            </h2>
            {stored && (
              <div className="text-xs text-ink-soft">
                {t("ניתוח מ-{date}", {
                  date: new Date(stored.createdAt).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jerusalem" }),
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={analyze}
            disabled={!!analyzing || report.rows.length === 0}
            className="shrink-0 h-10 px-4 rounded-full text-sm font-bold disabled:opacity-50"
            style={{ background: "var(--color-amber-deep)", color: "var(--color-on-accent)" }}
          >
            {isAnalyzing ? t("מנתח…") : stored ? t("ניתוח מחדש") : t("ניתוח הנתונים")}
          </button>
        </div>

        {shownError && (
          <p className="text-xs rounded-lg px-3 py-2 mb-2" style={{ background: "var(--color-rose-bg)", color: "var(--color-rose)" }}>
            {shownError}
          </p>
        )}

        {stored ? (
          <div className={isAnalyzing ? "opacity-60" : ""}>
            <p className="text-sm leading-relaxed">{stored.result.summary}</p>
            {stored.result.tips.length > 0 && (
              <ul className="list-disc ps-5 mt-2.5 grid gap-1.5 text-sm leading-relaxed">
                {stored.result.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            )}
            {stored.result.lowData && (
              <p className="text-xs rounded-lg px-3 py-2 mt-3" style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}>
                {t("יש עדיין מעט נתונים, ולכן ההמלצות כלליות. הן יהיו מדויקות יותר ככל שיגיעו עוד פניות.")}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">
            {report.rows.length === 0
              ? t("אין עדיין נתונים לניתוח בתקופה הזו.")
              : t("לחצו על \"ניתוח הנתונים\" כדי לקבל תמונה של הקמפיינים והמלצות לשיפור.")}
          </p>
        )}
        <p className="text-[11px] text-ink-soft mt-3">{t("הניתוח נעשה על מספרים בלבד, בלי פרטי לקוחות.")}</p>
      </section>

      {/* Setup in Meta */}
      <details className="group rounded-2xl bg-card" open={!hasAnyAdLead}>
        <summary className="px-4 py-3.5 text-sm font-semibold cursor-pointer list-none flex items-center justify-between gap-2">
          <span>{t("איך מחברים מודעה במטא")}</span>
          <span className="text-ink-soft transition-transform group-open:rotate-180" aria-hidden>
            ⌄
          </span>
        </summary>
        <div className="px-4 pb-4 grid gap-3.5">
          <CopyRow label={t("הקישור למודעה")} value={adLink} copied={copied === "link"} onCopy={() => copy("link", adLink)} t={t} />
          <CopyRow
            label={t("פרמטרים של כתובת URL")}
            value={META_URL_PARAMS}
            copied={copied === "params"}
            onCopy={() => copy("params", META_URL_PARAMS)}
            t={t}
          />
          <ol className="list-decimal ps-5 grid gap-2 text-sm leading-relaxed">
            <li>{t("במנהל המודעות, ברמת המודעה, בחרו ביעד \"אתר\" והדביקו את הקישור בשדה \"כתובת האתר\" (Website URL).")}</li>
            <li>
              {t("בשדה \"פרמטרים של כתובת URL\" (URL parameters) הדביקו את שורת הפרמטרים. מטא מחליפה בעצמה את {{campaign.name}} ואת {{ad.name}} בשם האמיתי של הקמפיין ושל המודעה.")}
            </li>
            <li>{t("מפרסמים את המודעה. כל פנייה שמגיעה ממנה תופיע כאן, תחת שם הקמפיין.")}</li>
            <li>{t("ההוצאה על כל קמפיין מתעדכנת לבד כשחשבון המודעות מחובר. בלי חיבור, רושמים אותה כאן פעם בחודש.")}</li>
          </ol>
          <p className="text-xs rounded-lg px-3 py-2" style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}>
            {t("מודעות שפותחות ישירות את וואטסאפ (קליק לוואטסאפ) עדיין לא נמדדות כאן. נמדדות רק מודעות שמובילות לקישור של הצ'אט.")}
          </p>
        </div>
      </details>
    </div>
  );
}

function Tile({ label, value, className = "", lead = false }: { label: string; value: string; className?: string; lead?: boolean }) {
  return (
    <div className={`rounded-2xl bg-card p-3.5 ${className}`} style={lead ? { boxShadow: "inset 0 0 0 1px var(--color-amber)" } : undefined}>
      <div className="text-xs text-ink-soft mb-1">{label}</div>
      <div className="text-[22px] leading-tight font-extrabold font-data">
        <bdi>{value}</bdi>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] leading-tight text-ink-soft mb-0.5">{label}</div>
      <div className="text-[15px] font-bold font-data">
        <bdi>{value}</bdi>
      </div>
    </div>
  );
}

function RowCard({
  row: r,
  title,
  paid,
  money,
  ratio,
  t,
  children,
}: {
  row: CampaignRow;
  title: string;
  paid: boolean;
  money: (n: number) => string;
  ratio: (n: number) => string;
  t: TFn;
  children?: React.ReactNode;
}) {
  const spend = r.spend ?? 0;
  const adLeads = r.ads.reduce((s, a) => s + a.leads, 0);
  const unnamedAdLeads = r.leads - adLeads;
  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="font-bold text-[15px] break-words min-w-0" dir="auto">
          {title}
        </div>
        {paid && spend > 0 && r.leads === 0 && (
          <ToneTag
            tone="attention"
            className="shrink-0"
            legacyClassName="shrink-0 text-[10.5px] font-semibold rounded-full px-2 py-0.5"
            legacyStyle={{ background: "var(--color-rose-bg)", color: "var(--color-rose)" }}
          >
            {t("הוצאה בלי פניות")}
          </ToneTag>
        )}
      </div>

      <div className={`grid gap-x-3 gap-y-3 ${paid ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-8" : "grid-cols-4"}`}>
        <Metric label={t("פניות")} value={String(r.leads)} />
        <Metric label={t("הצעות מחיר")} value={String(r.quoted)} />
        <Metric label={t("אירועים שנסגרו")} value={String(r.booked)} />
        <Metric label={t("הכנסה")} value={money(r.revenue)} />
        {paid && (
          <>
            <Metric label={t("הוצאה")} value={r.spend !== null ? money(r.spend) : "—"} />
            <Metric label={t("עלות לפנייה")} value={spend > 0 && r.leads > 0 ? money(spend / r.leads) : "—"} />
            <Metric label={t("עלות לאירוע")} value={spend > 0 && r.booked > 0 ? money(spend / r.booked) : "—"} />
            <Metric label={t("הכנסה מול הוצאה")} value={spend > 0 ? ratio(r.revenue / spend) : "—"} />
            {r.clicks > 0 && (
              <>
                <Metric label={t("קליקים")} value={r.clicks.toLocaleString()} />
                <Metric label={t("עלות לקליק")} value={spend > 0 ? `₪${(spend / r.clicks).toFixed(2)}` : "—"} />
                <Metric label={t("מקליק לפנייה")} value={`${((r.leads / r.clicks) * 100).toFixed(1)}%`} />
              </>
            )}
          </>
        )}
      </div>

      {r.medianHoursToQuote !== null && (
        <div className="text-xs text-ink-soft mt-3">{t("זמן עד הצעת מחיר (חציון): {time}", { time: hoursText(r.medianHoursToQuote, t) })}</div>
      )}

      {r.ads.length > 0 && (
        <details className="group mt-3">
          <summary className="text-xs font-semibold cursor-pointer list-none flex items-center gap-1.5" style={{ color: "var(--color-amber-deep)" }}>
            <span>{t("פירוט לפי מודעה ({n})", { n: r.ads.length })}</span>
            <span className="transition-transform group-open:rotate-180" aria-hidden>
              ⌄
            </span>
          </summary>
          <div className="mt-2 rounded-xl border border-line overflow-hidden divide-y divide-[var(--color-line)]" style={{ background: "var(--color-input-bg)" }}>
            <div className="flex items-center gap-3 px-3 py-1.5 text-[11px] text-ink-soft">
              <span className="flex-1 min-w-0">{t("מודעה")}</span>
              <span className="w-14 text-end">{t("פניות")}</span>
              <span className="w-14 text-end">{t("נסגרו")}</span>
            </div>
            {r.ads.map((a) => (
              <div key={a.ad} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1 min-w-0 break-words" dir="auto">
                  {a.ad}
                </span>
                <span className="w-14 text-end font-data">{a.leads}</span>
                <span className="w-14 text-end font-data">{a.booked}</span>
              </div>
            ))}
            {unnamedAdLeads > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 text-sm text-ink-soft">
                <span className="flex-1 min-w-0">{t("בלי שם מודעה")}</span>
                <span className="w-14 text-end font-data">{unnamedAdLeads}</span>
                <span className="w-14" />
              </div>
            )}
          </div>
        </details>
      )}

      {children}
    </div>
  );
}

// The month's spend for one campaign: saved on blur or Enter; empty or 0 removes it.
function SpendInput({
  label,
  initial,
  onSave,
  t,
}: {
  label: string;
  initial: number | null;
  onSave: (amount: number | null) => Promise<string | null>;
  t: TFn;
}) {
  const id = useId();
  const [value, setValue] = useState(initial ? String(initial) : "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const commit = async () => {
    const amount = parseAmount(value);
    if (amount === undefined) {
      setError(t("סכום לא תקין"));
      return;
    }
    if ((amount || null) === (initial || null)) {
      setError(null);
      return;
    }
    setStatus("saving");
    setError(null);
    const err = await onSave(amount);
    if (err) {
      setStatus("idle");
      setError(err);
      return;
    }
    setStatus("saved");
    setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1800);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-xs font-semibold">
          {label}
        </label>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-ink-soft" aria-hidden>
            ₪
          </span>
          <input
            id={id}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            inputMode="decimal"
            dir="ltr"
            placeholder="0"
            aria-invalid={!!error}
            className="w-28 rounded-lg px-2.5 py-1.5 text-sm border border-line font-data"
            style={{ background: "var(--color-input-bg)" }}
          />
        </div>
        <span className="text-xs text-ink-soft" aria-live="polite">
          {status === "saving" ? t("שומר…") : status === "saved" ? t("נשמר") : ""}
        </span>
      </div>
      {error && (
        <p className="text-xs rounded-lg px-3 py-2 mt-2" style={{ background: "var(--color-rose-bg)", color: "var(--color-rose)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function CopyRow({ label, value, copied, onCopy, t }: { label: string; value: string; copied: boolean; onCopy: () => void; t: TFn }) {
  return (
    <div>
      <div className="text-xs font-semibold mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 rounded-lg border border-line px-3 py-2 text-xs font-data break-all" dir="ltr" style={{ background: "var(--color-input-bg)" }}>
          {value}
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="text-xs font-semibold rounded-lg px-3 py-2 border border-line shrink-0"
          style={{ background: "var(--color-input-bg)" }}
        >
          {copied ? t("הועתק") : t("העתקה")}
        </button>
      </div>
    </div>
  );
}
