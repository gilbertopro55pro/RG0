"use client";

import { useEffect, useState } from "react";
import { buildWaMeLink } from "@/lib/waLink";
import Link from "next/link";
import dynamic from "next/dynamic";
import { PACKAGE_LABELS, resolveLeadPackageLabel, type PackageType } from "@/lib/stages";
import type { CustomPackageRow, EventTypeRow, LeadRow, LeadStatus, PackagePriceRow, PriceQuoteRow, PriceQuoteTemplateRow, PricingSupplier } from "@/lib/types";
import { buildLeadQuotePrefill, buildPrefillFromSentQuote, hasQuotePrefill, hasSentQuote } from "@/lib/leadQuotePrefill";
import { useModalEntered } from "@/lib/useModalEntered";
import { CustomPackageBuilder } from "@/components/CustomPackagesSettings";
import PageGuide from "@/components/PageGuide";
import { IconClose } from "@/components/icons/AlbumIcons";
import BackLink from "@/components/BackLink";
import RowMenu from "@/components/RowMenu";
import { sourceLabel } from "@/lib/leadSource";
import { daysUntilPurge } from "@/lib/leadRetention";
import { createClient } from "@/lib/supabase/client";
import ContactReminderDialog from "@/components/ContactReminderDialog";
import BodyPortal from "@/components/BodyPortal";
import ToneTag from "@/components/ToneTag";
import QuoteHistoryList from "@/components/QuoteHistoryList";
import { useVivid } from "@/components/VividProvider";
import { toneStyle, toneVars } from "@/lib/tones";
import { leadStatusTone } from "@/lib/statusTones";
import ClientMessageSheet from "@/components/ClientMessageSheet";
import { announceContactReminder, onContactReminderChange } from "@/lib/contactReminderSync";
import { useT, useLang } from "@/i18n/client";
import { dateLocale, isLang, LANG_LABELS, LANGS, type Lang } from "@/i18n/config";
import type { TFn } from "@/i18n/translate";
import { shortClientUrl } from "@/lib/shortLinks";
import { leadReminderDue, leadReminderKind, leadReminderMessage, leadReminderSubject, type LeadReminderChannel, type LeadReminderFields } from "@/lib/leadReminder";

// A lead with the reminder columns (migration 0186), which LeadRow leaves out (lib/leadReminder.ts).
type Lead = LeadRow & LeadReminderFields;

const CREATE_CUSTOM_PACKAGE_VALUE = "__create_custom__";

const NewEventModal = dynamic(() => import("@/components/NewEventModal"), { ssr: false });
const EventPricingCalculator = dynamic(() => import("@/components/EventPricingCalculator"), { ssr: false });

// What the quote builder (EventPricingCalculator) needs, loaded by the leads page.
export type LeadsQuoteBuilderData = {
  hourlyRate: number;
  suppliers: PricingSupplier[];
  priceQuotes: PriceQuoteRow[];
  templates: PriceQuoteTemplateRow[];
  customEventTypes: string[];
  defaultTaxStatus: "exempt" | "licensed";
  quoteExtras?: boolean;
  // The client-language picker (UI languages phase 2): canChooseClientLang, admin only for now.
  clientLangPicker?: boolean;
};

// "20.10, 18:30" for a reminder, Israel time.
function reminderLabel(iso: string, lang: Lang): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(dateLocale(lang), { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric" });
  const time = d.toLocaleTimeString(dateLocale(lang), { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date}, ${time}`;
}

// "נוצר ב-29.9.2026, 15:55", Israel time.
function createdLabel(iso: string, t: TFn, lang: Lang): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(dateLocale(lang), { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString(dateLocale(lang), { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false });
  return t("נוצר ב-{date}, {time}", { date, time });
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "חדש",
  contacted: "יצרתי קשר",
  quoted: "נשלחה הצעת מחיר",
  won: "הומר לאירוע",
  lost: "לא התקדם",
};

const STATUS_COLORS: Record<LeadStatus, { bg: string; text: string }> = {
  new: { bg: "var(--color-chip)", text: "var(--color-ink-soft)" },
  contacted: { bg: "var(--color-amber-bg)", text: "var(--color-amber-deep)" },
  // Muted slate-teal from the palette (was an off-palette indigo) — still distinct from the
  // brass "contacted" and the green "won" next to it.
  quoted: { bg: "color-mix(in srgb, var(--color-lime) 18%, transparent)", text: "var(--color-lime-deep)" },
  won: { bg: "var(--color-sage-bg)", text: "var(--color-sage)" },
  lost: { bg: "var(--color-rose-bg)", text: "var(--color-rose)" },
};

export default function LeadsView({
  initialLeads,
  archivedLeads,
  customPackages: initialCustomPackages,
  eventTypes: initialEventTypes,
  prices: initialPrices,
  isAdmin,
  quoteBuilder,
  signature = null,
  senderName = null,
  initialTab = "leads",
}: {
  initialLeads: LeadRow[];
  // Idle leads the daily retention job moved out of the list (lib/leadRetention.ts).
  archivedLeads: LeadRow[];
  customPackages: CustomPackageRow[];
  eventTypes: EventTypeRow[];
  prices: PackagePriceRow[];
  isAdmin: boolean;
  quoteBuilder: LeadsQuoteBuilderData;
  // The reminder message ends with the WhatsApp signature, or the photographer's name without one.
  signature?: string | null;
  senderName?: string | null;
  // "?tab=quotes" opens the quote history.
  initialTab?: "leads" | "quotes";
}) {
  const t = useT();
  const lang = useLang();
  const vivid = useVivid();
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  // "Now" for the days-since-quote counters, fixed when the page opens.
  const [now] = useState(() => Date.now());
  // Start of the "sources in the last 30 days" window, fixed when the page opens.
  const [sourcesSince] = useState(() => Date.now() - 30 * 86_400_000);
  // Owned here (not inside AddLeadModal) so a package created via "+ חבילה מותאמת אישית חדשה"
  // shows up immediately in the lead-row label below, without waiting for a page refresh.
  const [customPackages, setCustomPackages] = useState(initialCustomPackages);
  const [eventTypes, setEventTypes] = useState(initialEventTypes);
  const [prices, setPrices] = useState(initialPrices);
  const [showAdd, setShowAdd] = useState(false);
  const [quoteFormLeadId, setQuoteFormLeadId] = useState<string | null>(null);
  // A lead from the intake assistant whose quote opens in the full builder, pre-filled from the chat.
  const [builderLead, setBuilderLead] = useState<LeadRow | null>(null);
  const [convertLead, setConvertLead] = useState<LeadRow | null>(null);
  const [archived, setArchived] = useState(archivedLeads);
  const [showArchive, setShowArchive] = useState(false);
  // The leads, or the history of every quote that went out (owner, 2026-10-22): the same list as the
  // quote builder's "היסטוריית הצעות" tab (QuoteHistoryList), from leads and from the quote tool alike.
  const [tab, setTab] = useState<"leads" | "quotes">(initialTab);
  const switchTab = (next: "leads" | "quotes") => {
    setTab(next);
    // Kept in the address, so a refresh or the back button lands on the same tab.
    const url = new URL(window.location.href);
    if (next === "quotes") url.searchParams.set("tab", "quotes");
    else url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", url);
  };
  // Archived lead whose "delete for good" is waiting for the second tap, and a failed delete's message.
  const [purgeConfirmId, setPurgeConfirmId] = useState<string | null>(null);
  const [purgingId, setPurgingId] = useState<string | null>(null);
  const [purgeError, setPurgeError] = useState<{ id: string; message: string } | null>(null);

  const purgeArchivedLead = async (id: string) => {
    setPurgingId(id);
    setPurgeError(null);
    const res = await fetch(`/api/leads/${id}`, { method: "DELETE" }).catch(() => null);
    setPurgingId(null);
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setPurgeError({ id, message: data?.error ?? t("המחיקה נכשלה, נסו שוב") });
      return;
    }
    setPurgeConfirmId(null);
    setArchived((prev) => prev.filter((l) => l.id !== id));
  };

  // NewEventModal has no success callback (it navigates to the new event when finished). If it was
  // closed after the event was already created from an archived lead, the DB trigger has cleared
  // archived_at; re-read the lead and move it back to the active list as converted.
  const closeConvert = async () => {
    const lead = convertLead;
    setConvertLead(null);
    if (!lead?.archived_at) return;
    const { data } = await createClient()
      .from("leads")
      .select("status, converted_event_id, archived_at, last_activity_at")
      .eq("id", lead.id)
      .maybeSingle<Pick<LeadRow, "status" | "converted_event_id" | "archived_at" | "last_activity_at">>();
    if (!data?.converted_event_id) return;
    setArchived((prev) => prev.filter((l) => l.id !== lead.id));
    setLeads((prev) => [{ ...lead, ...data, archived_at: null }, ...prev.filter((l) => l.id !== lead.id)]);
  };

  const updateLead = (id: string, patch: Partial<Lead>) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  // Marking a lead "יצרתי קשר" asks whether to set a reminder to get back to the client (owner,
  // 2026-10-15; lib/leadContactReminder.ts).
  const [contactAsk, setContactAsk] = useState<LeadRow | null>(null);
  const setContactReminder = async (id: string, remindAt: string | null) => {
    const res = await fetch(`/api/leads/${id}/contact-reminder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remindAt }),
    }).catch(() => null);
    if (!res?.ok) return false;
    announceContactReminder(id, remindAt);
    return true;
  };
  // Every change, from here or from the reminder popup (lib/contactReminderSync.ts), lands on the card.
  useEffect(
    () => onContactReminderChange((id, remindAt) => setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, contact_remind_at: remindAt } : l)))),
    []
  );

  const setStatus = async (id: string, status: LeadStatus) => {
    const before = leads.find((l) => l.id === id);
    if (status === "contacted" && before && before.status !== "contacted") setContactAsk({ ...before, status });
    updateLead(id, { status });
    await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };

  // The language of this client's pages (quote, contract, portal, gallery). Admin only for now.
  const setClientLang = async (id: string, clientLang: string) => {
    if (!isLang(clientLang)) return;
    updateLead(id, { client_lang: clientLang });
    await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_lang: clientLang }),
    });
  };

  const deleteLead = async (id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
  };

  // Tapping a lead's phone asks how to reach them: WhatsApp or a call (owner, 2026-10-16).
  const [phoneLead, setPhoneLead] = useState<LeadRow | null>(null);
  // "שליחת תזכורת" (lib/leadReminder.ts): the lead whose reminder sheet is open.
  const [reminderLead, setReminderLead] = useState<Lead | null>(null);
  // "מחיקת הליד" sits next to the language picker and asks once before deleting.
  const [deleteAskId, setDeleteAskId] = useState<string | null>(null);
  // The photographer's own note (leads.photographer_note), added and edited from the "⋯" menu.
  const [noteEdit, setNoteEdit] = useState<{ id: string; text: string } | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState(false);
  const saveNote = async () => {
    if (!noteEdit) return;
    const note = noteEdit.text.trim() || null;
    setNoteSaving(true);
    setNoteError(false);
    const res = await fetch(`/api/leads/${noteEdit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photographer_note: note }),
    }).catch(() => null);
    setNoteSaving(false);
    if (!res?.ok) {
      setNoteError(true);
      return;
    }
    updateLead(noteEdit.id, { photographer_note: note });
    setNoteEdit(null);
  };

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-1.5">
        <BackLink href="/" label={t("חזרה לדף הבית")} />
        <button onClick={() => setShowAdd(true)} className="h-11 px-4 rounded-full bg-ink text-white text-sm font-bold">
          {t("+ ליד חדש")}
        </button>
      </div>
      <h1 className="text-[26px] font-bold mb-1.5 font-display">{t("לידים ופניות")}</h1>
      <PageGuide
        pageKey="leads"
        blurb={t("כל פנייה חדשה מתחילה כאן כליד. שולחים ללקוח/ה הצעת מחיר, ואחרי שהיא מאושרת אפשר להפוך אותה לאירוע סגור בלחיצה.")}
      />

      <div className="flex border-b border-line mb-4" role="tablist">
        {([
          ["leads", "לידים"],
          ["quotes", "היסטוריית הצעות"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => switchTab(k)}
            className={`flex-1 sm:flex-none sm:px-6 pb-2 -mb-px text-sm font-semibold border-b-2 ${tab === k ? "border-ink text-ink" : "border-transparent text-ink-soft"}`}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {tab === "quotes" && <QuoteHistoryList signature={signature} />}

      {tab === "leads" && (
      <>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3">
        {(() => {
          // Leads per source over the last 30 days: which channel (ad, Instagram, WhatsApp, QR...) brings clients.
          const counts = new Map<string, number>();
          for (const l of leads) {
            if (!l.referral_source || new Date(l.created_at).getTime() < sourcesSince) continue;
            const label = t(sourceLabel(l.referral_source)!);
            counts.set(label, (counts.get(label) ?? 0) + 1);
          }
          if (counts.size === 0) return null;
          const parts = [...counts.entries()].sort((a, b) => b[1] - a[1]);
          return (
            <p className="text-xs text-ink-soft">
              {t("מקורות ב-30 הימים האחרונים:")}{" "}
              {parts.map(([label, n], i) => (
                <span key={label}>
                  {i > 0 && ", "}
                  {label} <span className="font-data font-semibold text-ink">{n}</span>
                </span>
              ))}
            </p>
          );
        })()}
        {/* Campaign tracking (owner, 2026-10-14): per-campaign leads, bookings and cost. Admin only for now (campaignsAllowed). */}
        {isAdmin && (
          <Link
            href="/leads/campaigns"
            className="h-9 px-3.5 rounded-full border border-line text-[13px] font-bold text-ink inline-flex items-center gap-1.5 shrink-0"
            style={{ background: "var(--color-input-bg)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 3v18h18M7 15l4-4 3 3 5-6" />
            </svg>
            {t("מעקב קמפיינים")}
          </Link>
        )}
      </div>

      {leads.length === 0 && <div className="text-center py-16 text-sm text-ink-soft">{t("אין עדיין לידים. לחצו על \"ליד חדש\" כדי להוסיף")}</div>}

      {/* Design stage 5: one list split by hairlines, not a card per lead. */}
      <div className={leads.length > 0 ? "rounded-2xl bg-card overflow-hidden divide-y divide-[var(--color-line)]" : ""}>
        {leads.map((lead) => (
          <div key={lead.id} className="p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-[15px]">{lead.name}</span>
                  {/* Where the lead came from isn't a state, so in the vivid look it's neutral (amber
                      there means "waiting on someone"). */}
                  {lead.source === "assistant" && (
                    <ToneTag
                      tone="neutral"
                      legacyClassName="text-[10.5px] font-semibold rounded-full px-2 py-0.5"
                      legacyStyle={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}
                    >
                      {t("מהעוזר")}
                    </ToneTag>
                  )}
                  {lead.source === "form" && (
                    <ToneTag tone="neutral" legacyClassName="text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-chip text-ink-soft">
                      {t("מטופס הפנייה")}
                    </ToneTag>
                  )}
                  {sourceLabel(lead.referral_source) && (
                    <ToneTag tone="neutral" legacyClassName="text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-chip text-ink-soft">
                      {t("מקור: {source}", { source: t(sourceLabel(lead.referral_source)!) })}
                    </ToneTag>
                  )}
                  {lead.needs_details && (
                    <ToneTag
                      tone="attention"
                      legacyClassName="text-[10.5px] font-semibold rounded-full px-2 py-0.5"
                      legacyStyle={{ background: "var(--color-rose-bg)", color: "var(--color-rose)" }}
                    >
                      {t("חסרים פרטים")}
                    </ToneTag>
                  )}
                </div>
                {(lead.event_date_interest || resolveLeadPackageLabel(lead.package_interest, customPackages)) && (
                  <div className="text-[13px] text-ink-soft">
                    {[
                      lead.event_date_interest ? new Date(lead.event_date_interest).toLocaleDateString(dateLocale(lang)) : null,
                      (() => { const pl = resolveLeadPackageLabel(lead.package_interest, customPackages); return pl ? t(pl) : null; })(),
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                )}
                {lead.phone && (
                  <button
                    type="button"
                    onClick={() => setPhoneLead(lead)}
                    className="block text-[13px] text-ink-soft font-data underline-offset-2 hover:underline"
                    dir="ltr"
                    aria-label={t("יצירת קשר עם {name}", { name: lead.name })}
                  >
                    {lead.phone}
                  </button>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {vivid ? (
                  // Vivid (admin): the status is a tag in its tone (lib/statusTones.ts), with the
                  // dot, and the select sits on it so it still changes the status.
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full ps-2.5 pe-1"
                    style={toneStyle(leadStatusTone(lead.status))}
                  >
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: toneVars(leadStatusTone(lead.status)).solid }} />
                    <select
                      value={lead.status}
                      onChange={(e) => setStatus(lead.id, e.target.value as LeadStatus)}
                      className="text-[11.5px] font-semibold py-0.5 border-none bg-transparent"
                      style={{ color: "inherit" }}
                    >
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {t(label)}
                        </option>
                      ))}
                    </select>
                  </span>
                ) : (
                  <select
                    value={lead.status}
                    onChange={(e) => setStatus(lead.id, e.target.value as LeadStatus)}
                    className="text-[11px] px-2 py-1 rounded-full font-medium border-none"
                    style={{ background: STATUS_COLORS[lead.status].bg, color: STATUS_COLORS[lead.status].text }}
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {t(label)}
                      </option>
                    ))}
                  </select>
                )}
                <div className="text-[10.5px] text-ink-soft leading-tight">{createdLabel(lead.created_at, t, lang)}</div>
                {lead.contact_remind_at && lead.status !== "won" && lead.status !== "lost" && (
                  <div className="text-[10.5px] leading-tight flex items-center gap-1" style={{ color: "var(--color-amber-deep)" }}>
                    <span>{t("תזכורת ליצירת קשר: {when}", { when: reminderLabel(lead.contact_remind_at, lang) })}</span>
                    <button onClick={() => setContactReminder(lead.id, null)} className="underline" aria-label={t("ביטול התזכורת")}>
                      {t("ביטול")}
                    </button>
                  </div>
                )}
                {lead.quote_sent_at && <QuoteSentAge sentAt={lead.quote_sent_at} closed={lead.status === "won" || lead.status === "lost"} now={now} />}
                {lead.reminder_sent_at && leadReminderKind(lead) && (
                  <div className="text-[10.5px] text-ink-soft leading-tight">
                    {t("תזכורת נשלחה: {date}", {
                      date: new Date(lead.reminder_sent_at).toLocaleDateString(dateLocale(lang), { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric" }),
                    })}
                  </div>
                )}
              </div>
            </div>

            {lead.event_type_name && <p className="text-[13px] mb-1">{lead.event_type_name}</p>}
            {lead.notes && <p className="text-xs text-ink-soft mb-2.5">{lead.notes}</p>}
            {lead.photographer_note && noteEdit?.id !== lead.id && (
              <p className="text-xs mb-2.5 rounded-lg bg-chip px-2.5 py-1.5 whitespace-pre-line">
                <span className="font-semibold">{t("הערה:")}</span> {lead.photographer_note}
              </p>
            )}
            {lead.bot_conversation_id && <ConversationToggle leadId={lead.id} hasPhone={!!lead.phone} />}

            {lead.quoted_amount && (
              <div className="text-[13px] font-bold mb-2.5">
                {t("הצעת מחיר:")} <span className="font-data">₪{Number(lead.quoted_amount).toLocaleString(dateLocale(lang))}</span>
              </div>
            )}

            {/* Admin-only for now (see the standing "עדכון אדמין" staged-rollout process) — the
                client-side approve+questionnaire flow on /quotes/[token] only actually works for
                this account, so showing its pipeline state to any other photographer would just
                be confusing (their clients still see the old call-us-to-confirm page). */}
            {isAdmin && lead.quoted_amount && !lead.converted_event_id && (
              vivid ? (
                <div className="mb-2.5">
                  <ToneTag tone={lead.quote_approved_at ? "paid" : "pending"}>
                    {lead.quote_approved_at
                      ? t("ההצעה אושרה ע\"י הלקוח/ה: ממתין למילוי שאלון פרטי האירוע")
                      : t("ממתין לאישור ההצעה ע\"י הלקוח/ה")}
                  </ToneTag>
                </div>
              ) : (
                <div
                  className="text-xs mb-2.5 rounded-lg px-2.5 py-1.5 inline-block"
                  style={
                    lead.quote_approved_at
                      ? { background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }
                      : { background: "#F1EFE9", color: "var(--color-ink-soft)" }
                  }
                >
                  {lead.quote_approved_at
                    ? t("ההצעה אושרה ע\"י הלקוח/ה: ממתין למילוי שאלון פרטי האירוע")
                    : t("ממתין לאישור ההצעה ע\"י הלקוח/ה")}
                </div>
              )
            )}

            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              {leadReminderDue(lead, now) && (
                <button
                  onClick={() => setReminderLead(lead)}
                  className="text-[13px] font-bold h-9 px-3 rounded-lg"
                  style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}
                >
                  {t("שליחת תזכורת")}
                </button>
              )}
              {!lead.converted_event_id && (
                <button
                  onClick={() => setConvertLead(lead)}
                  className="text-[13px] font-bold h-9 px-3 rounded-lg bg-ink text-white"
                >
                  {t("המרה לאירוע")}
                </button>
              )}
              {lead.converted_event_id && (
                <Link
                  href={`/events/${lead.converted_event_id}`}
                  className="text-[13px] font-bold h-9 px-3 rounded-lg bg-sage-bg text-sage flex items-center"
                >
                  {t("הפך לאירוע, לפתיחה")}
                </Link>
              )}
              {quoteFormLeadId !== lead.id && !lead.converted_event_id && (
                <button
                  onClick={() => (hasSentQuote(lead.quote_details) || hasQuotePrefill(lead.details) ? setBuilderLead(lead) : setQuoteFormLeadId(lead.id))}
                  className="text-[13px] font-bold h-9 px-3 rounded-lg bg-white border border-line text-ink"
                >
                  {lead.quote_sent_at || lead.quoted_amount ? t("עדכון הצעת מחיר") : t("שליחת הצעת מחיר")}
                </button>
              )}
              {lead.quoted_amount && <CopyQuoteLinkButton token={lead.quote_token} />}
              {lead.quote_details?.items?.length ? <QuotePdfButton lead={lead} /> : null}
              <span className="flex-1" />
              {quoteBuilder.clientLangPicker && (
                <select
                  value={isLang(lead.client_lang) ? lead.client_lang : "he"}
                  onChange={(e) => setClientLang(lead.id, e.target.value)}
                  aria-label={t("שפת הלקוח/ה")}
                  title={t("שפת הלקוח/ה")}
                  className="text-[11px] h-7 px-1.5 rounded-full font-medium border-none bg-chip text-ink-soft"
                >
                  {LANGS.map((l) => (
                    <option key={l} value={l}>
                      {LANG_LABELS[l]}
                    </option>
                  ))}
                </select>
              )}
              {deleteAskId === lead.id ? (
                <span className="flex items-center gap-1.5 text-[12px]">
                  <span className="font-semibold text-rose">{t("למחוק את הליד?")}</span>
                  <button
                    onClick={() => {
                      setDeleteAskId(null);
                      void deleteLead(lead.id);
                    }}
                    className="h-7 px-2.5 rounded-full bg-rose text-white font-semibold"
                  >
                    {t("כן, מחיקה")}
                  </button>
                  <button onClick={() => setDeleteAskId(null)} className="h-7 px-2 rounded-full text-ink-soft underline">
                    {t("ביטול")}
                  </button>
                </span>
              ) : (
                <button onClick={() => setDeleteAskId(lead.id)} className="text-[11px] h-7 px-2.5 rounded-full font-semibold bg-chip text-rose">
                  {t("מחיקת הליד")}
                </button>
              )}
              <RowMenu
                items={[
                  {
                    label: lead.photographer_note ? t("עריכת ההערה") : t("הוספת הערה"),
                    onClick: () => {
                      setNoteError(false);
                      setNoteEdit({ id: lead.id, text: lead.photographer_note ?? "" });
                    },
                  },
                ]}
              />
            </div>

            {noteEdit?.id === lead.id && (
              <div className="mt-2.5 rounded-xl bg-chip p-3">
                <label htmlFor={`lead-note-${lead.id}`} className="block text-xs font-semibold mb-1.5">
                  {t("הערה")}
                </label>
                <textarea
                  id={`lead-note-${lead.id}`}
                  value={noteEdit.text}
                  onChange={(e) => setNoteEdit({ id: lead.id, text: e.target.value })}
                  rows={3}
                  maxLength={2000}
                  autoFocus
                  placeholder={t("למשל: ביקשו לחזור אחרי שיסגרו אולם")}
                  className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white resize-none"
                />
                {noteError && <p className="text-xs text-rose mt-1">{t("שגיאה בשמירה. נסו שוב")}</p>}
                <div className="flex gap-2 mt-2">
                  <button onClick={saveNote} disabled={noteSaving} className="h-9 px-4 rounded-lg bg-ink text-white text-[13px] font-bold disabled:opacity-60">
                    {noteSaving ? t("שומר...") : t("שמירה")}
                  </button>
                  <button onClick={() => setNoteEdit(null)} disabled={noteSaving} className="h-9 px-4 rounded-lg bg-white border border-line text-[13px] font-semibold text-ink">
                    {t("ביטול")}
                  </button>
                </div>
              </div>
            )}

            {quoteFormLeadId === lead.id && (
              <QuoteForm
                lead={lead}
                onClose={() => setQuoteFormLeadId(null)}
                onSaved={(updated) => {
                  updateLead(lead.id, updated);
                  setQuoteFormLeadId(null);
                }}
              />
            )}
          </div>
        ))}
      </div>

      {archived.length > 0 && (
        <div className="mt-6 text-start">
          <button
            type="button"
            onClick={() => setShowArchive((v) => !v)}
            aria-expanded={showArchive}
            className="text-xs font-semibold underline underline-offset-2"
            style={{ color: "var(--color-amber-deep)" }}
          >
            {t("ארכיון ({n})", { n: archived.length })}
          </button>
          <p className="text-ink-soft text-xs mt-1">{t("לידים בלי פעילות 13 יום עוברים לכאן, ונמחקים לצמיתות אחרי 14 ימים נוספים.")}</p>

          {showArchive && (
            <div className="mt-3 rounded-2xl bg-card overflow-hidden divide-y divide-[var(--color-line)]">
              {archived.map((lead) => {
                const days = daysUntilPurge(lead.archived_at ?? new Date(now).toISOString(), now);
                const purgeLabel =
                  days === 0 ? t("יימחק לצמיתות היום") : days === 1 ? t("יימחק לצמיתות מחר") : t("יימחק לצמיתות בעוד {n} ימים", { n: days });
                const rawPackageLabel = resolveLeadPackageLabel(lead.package_interest, customPackages);
                const packageLabel = rawPackageLabel ? t(rawPackageLabel) : null;
                return (
                  <div key={lead.id} className="p-4">
                    <div className="min-w-0 mb-2">
                      <span className="font-bold text-[15px]">{lead.name}</span>
                      {(lead.event_date_interest || packageLabel) && (
                        <div className="text-[13px] text-ink-soft">
                          {[lead.event_date_interest ? new Date(lead.event_date_interest).toLocaleDateString(dateLocale(lang)) : null, packageLabel]
                            .filter(Boolean)
                            .join(", ")}
                        </div>
                      )}
                      {lead.phone && (
                        <button
                          type="button"
                          onClick={() => setPhoneLead(lead)}
                          className="block text-[13px] text-ink-soft font-data underline-offset-2 hover:underline"
                          dir="ltr"
                          aria-label={t("יצירת קשר עם {name}", { name: lead.name })}
                        >
                          {lead.phone}
                        </button>
                      )}
                    </div>
                    {lead.event_type_name && <p className="text-[13px] mb-1">{lead.event_type_name}</p>}
                    <p className="text-[11px] font-bold text-rose">{purgeLabel}</p>

                    {purgeConfirmId === lead.id ? (
                      <div className="mt-2.5 rounded-xl p-3 bg-chip space-y-2">
                        <p className="text-xs font-semibold text-rose">{t("למחוק את הליד לצמיתות? אי אפשר לשחזר.")}</p>
                        {purgeError?.id === lead.id && <p className="text-xs text-rose">{purgeError.message}</p>}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => purgeArchivedLead(lead.id)}
                            disabled={purgingId === lead.id}
                            className="flex-1 rounded-lg py-2 text-xs font-semibold bg-rose text-white disabled:opacity-60"
                          >
                            {purgingId === lead.id ? t("מוחק...") : t("מחיקה לצמיתות")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPurgeConfirmId(null);
                              setPurgeError(null);
                            }}
                            className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft"
                          >
                            {t("ביטול")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 mt-2.5">
                        <button
                          type="button"
                          onClick={() => setConvertLead(lead)}
                          className="text-[13px] font-bold h-9 px-3 rounded-lg bg-ink text-white"
                        >
                          {t("המרה לאירוע")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPurgeConfirmId(lead.id);
                            setPurgeError(null);
                          }}
                          className="text-[13px] font-bold h-9 px-3 rounded-lg bg-white border border-line text-rose"
                        >
                          {t("מחיקה לצמיתות")}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      </>
      )}

      {showAdd && (
        <AddLeadModal
          customPackages={customPackages}
          eventTypes={eventTypes}
          prices={prices}
          onCustomPackageSaved={(pkg, updatedEventTypes, updatedPrices) => {
            setCustomPackages((prev) => [...prev, pkg]);
            setEventTypes(updatedEventTypes);
            setPrices(updatedPrices);
          }}
          onEventTypeDeleted={(eventTypeId) => {
            setEventTypes((prev) => prev.filter((t) => t.id !== eventTypeId));
            setPrices((prev) => prev.filter((p) => p.event_type_id !== eventTypeId));
          }}
          onClose={() => setShowAdd(false)}
          onAdded={(lead) => {
            setLeads((prev) => [lead, ...prev]);
            setShowAdd(false);
          }}
        />
      )}

      {builderLead && (hasSentQuote(builderLead.quote_details) || hasQuotePrefill(builderLead.details)) && (
        <EventPricingCalculator
          hourlyRate={quoteBuilder.hourlyRate}
          suppliers={quoteBuilder.suppliers}
          priceQuotes={quoteBuilder.priceQuotes}
          templates={quoteBuilder.templates}
          eventTypes={eventTypes.map((t) => ({ id: t.id, name: t.name }))}
          initialCustomEventTypes={quoteBuilder.customEventTypes}
          defaultTaxStatus={quoteBuilder.defaultTaxStatus}
          quoteExtras={quoteBuilder.quoteExtras}
          clientLangPicker={quoteBuilder.clientLangPicker}
          initialClientLang={builderLead.client_lang}
          prefill={
            // "עדכון הצעת מחיר" reopens the quote that was sent, as it went out; a first quote starts
            // from the assistant's conversation.
            hasSentQuote(builderLead.quote_details)
              ? buildPrefillFromSentQuote({
                  quote: builderLead.quote_details,
                  leadName: builderLead.name,
                  leadPhone: builderLead.phone,
                  suppliers: quoteBuilder.suppliers,
                })
              : buildLeadQuotePrefill({
                  details: builderLead.details!,
                  leadName: builderLead.name,
                  leadPhone: builderLead.phone,
                  suppliers: quoteBuilder.suppliers,
                  templates: quoteBuilder.templates,
                })
          }
          leadId={builderLead.id}
          onLeadQuoted={(patch) => updateLead(builderLead.id, patch)}
          onClose={() => setBuilderLead(null)}
        />
      )}

      {phoneLead?.phone && (
        <BodyPortal>
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4"
            style={{ background: "rgba(28, 27, 25, 0.45)" }}
            role="dialog"
            aria-modal="true"
            aria-label={t("יצירת קשר עם {name}", { name: phoneLead.name })}
            onClick={() => setPhoneLead(null)}
          >
            <div className="w-full max-w-xs rounded-3xl p-5 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold font-display">{phoneLead.name}</h2>
              <p className="text-sm text-ink-soft font-data mb-4" dir="ltr" style={{ textAlign: lang === "he" ? "right" : "left" }}>
                {phoneLead.phone}
              </p>
              <div className="flex flex-col gap-2">
                <a
                  href={buildWaMeLink(phoneLead.phone, "")}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setPhoneLead(null)}
                  className="h-11 rounded-xl bg-sage text-white text-sm font-semibold flex items-center justify-center"
                >
                  {t("וואטסאפ")}
                </a>
                <a href={`tel:${phoneLead.phone}`} onClick={() => setPhoneLead(null)} className="h-11 rounded-xl bg-ink text-white text-sm font-semibold flex items-center justify-center">
                  {t("חיוג")}
                </a>
                <button onClick={() => setPhoneLead(null)} className="h-10 rounded-xl text-sm font-semibold text-ink-soft">
                  {t("ביטול")}
                </button>
              </div>
            </div>
          </div>
        </BodyPortal>
      )}

      {reminderLead && (
        <LeadReminderSheet
          lead={reminderLead}
          signature={signature}
          senderName={senderName}
          now={now}
          onSent={(patch) => updateLead(reminderLead.id, patch)}
          onClose={() => setReminderLead(null)}
        />
      )}

      {contactAsk && (
        <ContactReminderDialog
          title={t("לקבוע תזכורת ליצירת קשר?")}
          text={t("תזכורת ליצור קשר עם {name}, בתאריך ובשעה שתבחרו. היא תקפוץ באפליקציה ותגיע גם כהתראה לטלפון.", { name: contactAsk.name })}
          onCancel={() => setContactAsk(null)}
          onConfirm={async (remindAt) => {
            const ok = await setContactReminder(contactAsk.id, remindAt);
            if (ok) setContactAsk(null);
            return ok;
          }}
        />
      )}
      {convertLead && (
        <NewEventModal
          onClose={closeConvert}
          leadId={convertLead.id}
          customPackages={customPackages}
          initial={{
            clientName: convertLead.name,
            eventType: convertLead.event_type_name ?? undefined,
            clientPhone: convertLead.phone ?? undefined,
            eventDate: convertLead.event_date_interest ?? undefined,
            pkg: convertLead.package_interest ?? undefined,
          }}
        />
      )}
    </div>
  );
}

// The PDF of the quote sent from the builder, rebuilt from leads.quote_details (admin only for now:
// the builder sends the client a link, and the file lives here, owner 2026-10-01).
function QuotePdfButton({ lead }: { lead: LeadRow }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const d = lead.quote_details;
  if (!d) return null;
  const download = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const [y, m, day] = (d.eventDate ?? "").split("-");
      const res = await fetch("/api/price-quotes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: lead.name,
          items: d.items,
          subtotal: d.subtotal,
          vatAmount: d.vatAmount,
          total: d.total,
          showVat: d.showVat,
          eventDetails: {
            type: d.eventType,
            date: y && m && day ? `${day}.${m}.${y}` : undefined,
            location: d.eventLocation,
            workHours: d.startTime && d.endTime ? `${d.startTime}-${d.endTime}` : undefined,
          },
          notes: d.notes,
          discount: d.discount,
          createdAt: d.createdAt,
          // The client's language (the route keeps Hebrew for every non-admin account).
          clientLang: lead.client_lang ?? undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `הצעת-מחיר-${lead.name}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button onClick={download} disabled={busy} className="text-[13px] font-bold h-9 px-3 rounded-lg bg-white border border-line text-ink disabled:opacity-60">
      {busy ? t("מכין PDF...") : failed ? t("נכשל, לנסות שוב") : t("הורדת PDF")}
    </button>
  );
}

// "שליחת תזכורת" (owner, 2026-10-19; lib/leadReminder.ts): the reminder in ClientMessageSheet. The
// send is recorded on the way out (api/leads/[id]/reminder), so the button waits two more days.
function LeadReminderSheet({
  lead,
  signature,
  senderName,
  now,
  onSent,
  onClose,
}: {
  lead: Lead;
  signature: string | null;
  senderName: string | null;
  now: number;
  onSent: (patch: Partial<Lead>) => void;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const kind = leadReminderKind(lead) ?? "contact";
  const clientLang: Lang = isLang(lead.client_lang) ? lead.client_lang : "he";
  const [initialText] = useState(() =>
    leadReminderMessage({
      lead,
      kind,
      // The quote's page works once it has an amount (the same link "העתקת קישור" copies).
      quoteUrl: lead.quoted_amount ? shortClientUrl(window.location.origin, "quote", lead.quote_token) : null,
      signature,
      senderName,
      lang: clientLang,
    })
  );
  const since = kind === "quote" ? lead.quote_sent_at : lead.contacted_at;
  const day = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const days = since ? Math.max(0, Math.round((Date.parse(day(now)) - Date.parse(day(Date.parse(since)))) / 86_400_000)) : 0;

  const record = (channel: LeadReminderChannel) => {
    onSent({ reminder_sent_at: new Date().toISOString(), reminder_count: (lead.reminder_count ?? 0) + 1 });
    void fetch(`/api/leads/${lead.id}/reminder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel }),
      keepalive: true,
    }).catch(() => {});
  };

  return (
    <ClientMessageSheet
      title={t("שליחת תזכורת ל{name}", { name: lead.name })}
      intro={
        <>
          {kind === "quote"
            ? days === 2
              ? t("עברו יומיים מאז שנשלחה הצעת המחיר. אפשר לערוך את ההודעה לפני השליחה.")
              : t("עברו {n} ימים מאז שנשלחה הצעת המחיר. אפשר לערוך את ההודעה לפני השליחה.", { n: days })
            : days === 2
              ? t("עברו יומיים מאז יצירת הקשר. אפשר לערוך את ההודעה לפני השליחה.")
              : t("עברו {n} ימים מאז יצירת הקשר. אפשר לערוך את ההודעה לפני השליחה.", { n: days })}
          {lead.reminder_sent_at && (
            <>
              {" "}
              {t("תזכורת קודמת נשלחה ב-{date}.", {
                date: new Date(lead.reminder_sent_at).toLocaleDateString(dateLocale(lang), { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric" }),
              })}
            </>
          )}
        </>
      }
      initialText={initialText}
      lang={clientLang}
      phone={lead.phone}
      email={lead.email}
      subject={leadReminderSubject(kind, senderName, clientLang)}
      onSend={record}
      onClose={onClose}
    />
  );
}

function CopyQuoteLinkButton({ token }: { token: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(shortClientUrl(window.location.origin, "quote", token));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="text-[13px] font-bold h-9 px-3 rounded-lg bg-white border border-line text-ink"
    >
      {copied ? t("הועתק ✓") : t("העתקת קישור הצעה")}
    </button>
  );
}

function QuoteForm({
  lead,
  onClose,
  onSaved,
}: {
  lead: LeadRow;
  onClose: () => void;
  onSaved: (patch: Partial<LeadRow>) => void;
}) {
  const t = useT();
  const [amount, setAmount] = useState(lead.quoted_amount ? String(lead.quoted_amount) : "");
  const [note, setNote] = useState(lead.quote_note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!amount) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/leads/${lead.id}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount), note }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? t("שגיאה ביצירת ההצעה"));
      return;
    }
    onSaved(data.lead);
  };

  return (
    <div className="mt-3 rounded-xl p-3 bg-chip space-y-2">
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={t("סכום ההצעה (₪)")}
        className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("הערות (אופציונלי)")}
        rows={2}
        className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white resize-none"
      />
      {error && <p className="text-xs text-rose">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={!amount || saving}
          className="flex-1 rounded-lg py-2 text-xs font-semibold bg-ink text-white disabled:opacity-60"
        >
          {saving ? t("שומר...") : t("שמירת הצעת מחיר")}
        </button>
        <button onClick={onClose} className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft">
          {t("ביטול")}
        </button>
      </div>
    </div>
  );
}

function AddLeadModal({
  onClose,
  onAdded,
  customPackages,
  eventTypes,
  prices,
  onCustomPackageSaved,
  onEventTypeDeleted,
}: {
  onClose: () => void;
  onAdded: (lead: LeadRow) => void;
  customPackages: CustomPackageRow[];
  eventTypes: EventTypeRow[];
  prices: PackagePriceRow[];
  onCustomPackageSaved: (pkg: CustomPackageRow, eventTypes: EventTypeRow[], prices: PackagePriceRow[]) => void;
  onEventTypeDeleted: (eventTypeId: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [eventDateInterest, setEventDateInterest] = useState("");
  // A built-in PackageType key, `custom:<id>`, or "" for unknown — same convention as NewEventModal's
  // pkgValue, so a lead's package_interest can pre-fill NewEventModal's dropdown unchanged on convert.
  const [packageInterest, setPackageInterest] = useState<string>("");
  const [showCustomPackageBuilder, setShowCustomPackageBuilder] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Name of an existing lead with the same phone; set after the first submit warns about it.
  const [duplicateName, setDuplicateName] = useState<string | null>(null);
  const entered = useModalEntered();

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        phone,
        eventDateInterest: eventDateInterest || undefined,
        packageInterest: packageInterest || undefined,
        notes,
        allowDuplicate: !!duplicateName,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.status === 409 && data.duplicate) {
      // First time: warn. Pressing "הוספה" again adds it anyway (allowDuplicate).
      setDuplicateName(data.duplicate.name);
      return;
    }
    if (!res.ok) {
      setError(data.error ?? t("שגיאה בהוספת הליד"));
      return;
    }
    onAdded(data.lead);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        background: "rgba(28, 27, 25, 0.45)",
        backdropFilter: entered ? "blur(16px)" : "blur(0px)",
        WebkitBackdropFilter: entered ? "blur(16px)" : "blur(0px)",
        transition: "backdrop-filter 280ms ease, -webkit-backdrop-filter 280ms ease",
      }}
    >
      <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold font-display">{t("ליד חדש")}</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs block mb-1 text-ink-soft">{t("שם")}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white" />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">{t("טלפון")}</label>
            <input type="tel" value={phone} onChange={(e) => {
              setPhone(e.target.value);
              setDuplicateName(null);
            }} className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white font-data" />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">{t("תאריך אירוע משוער")}</label>
            <input type="date" value={eventDateInterest} onChange={(e) => setEventDateInterest(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white" />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">{t("חבילה מבוקשת")}</label>
            <select
              value={packageInterest}
              onChange={(e) => {
                if (e.target.value === CREATE_CUSTOM_PACKAGE_VALUE) {
                  setShowCustomPackageBuilder(true);
                  return;
                }
                setPackageInterest(e.target.value);
              }}
              className="w-full rounded-lg px-3 py-2.5 text-sm border border-line bg-white"
            >
              <option value="">{t("לא ידוע")}</option>
              {Object.keys(PACKAGE_LABELS).map((p) => (
                <option key={p} value={p}>
                  {t(PACKAGE_LABELS[p as PackageType])}
                </option>
              ))}
              {customPackages.map((cp) => (
                <option key={cp.id} value={`custom:${cp.id}`}>
                  {cp.name}
                </option>
              ))}
              <option value={CREATE_CUSTOM_PACKAGE_VALUE}>{t("+ חבילה מותאמת אישית חדשה")}</option>
            </select>
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">{t("הערות")}</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white resize-none" />
          </div>
          {error && <p className="text-xs text-rose">{error}</p>}
          {duplicateName && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}>
              {t("כבר יש ליד עם הטלפון הזה ({name}). אם זה אותו לקוח ואותו אירוע, עדיף לעדכן את הליד הקיים. אם זה אירוע אחר, אפשר להוסיף בכל זאת.", { name: duplicateName })}
            </p>
          )}
          <button onClick={submit} disabled={!name.trim() || saving} className="w-full rounded-lg py-3 text-sm font-semibold mt-2 bg-ink text-white disabled:opacity-60">
            {saving ? t("שומר...") : duplicateName ? t("להוסיף בכל זאת") : t("הוספת ליד")}
          </button>
        </div>
      </div>

      {showCustomPackageBuilder && (
        <CustomPackageBuilder
          pkg={null}
          initialStages={[]}
          eventTypes={eventTypes}
          prices={prices}
          onClose={() => setShowCustomPackageBuilder(false)}
          onSaved={(pkg, _stages, updatedEventTypes, updatedPrices) => {
            onCustomPackageSaved(pkg, updatedEventTypes, updatedPrices);
            setPackageInterest(`custom:${pkg.id}`);
            setShowCustomPackageBuilder(false);
          }}
          onEventTypeDeleted={onEventTypeDeleted}
        />
      )}
    </div>
  );
}

// When the quote went out, and (in red, while the lead is still open) how many days ago, so a quote
// that's waiting too long stands out. Days are counted by the calendar in Israel.
function QuoteSentAge({ sentAt, closed, now }: { sentAt: string; closed: boolean; now: number }) {
  const t = useT();
  const lang = useLang();
  const day = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const days = Math.max(0, Math.round((Date.parse(day(now)) - Date.parse(day(Date.parse(sentAt)))) / 86400000));
  const ago = days === 0 ? t("נשלחה היום") : days === 1 ? t("לפני יום") : days === 2 ? t("לפני יומיים") : t("לפני {n} ימים", { n: days });
  return (
    <div className="text-end leading-tight">
      <div className="text-[10.5px] text-ink-soft">
        {t("הצעת מחיר:")} {new Date(sentAt).toLocaleDateString(dateLocale(lang), { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", year: "2-digit" })}
      </div>
      {!closed && <div className="text-[11px] font-bold text-rose">{ago}</div>}
    </div>
  );
}

// The intake assistant's conversation behind a lead, loaded on demand, plus sending its PDF summary
// (api/leads/[id]/conversation/pdf) to the client on WhatsApp.
function ConversationToggle({ leadId, hasPhone }: { leadId: string; hasPhone: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<{ role: "client" | "assistant"; text: string }[] | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const sendSummary = async () => {
    setSendError(null);
    setSending(true);
    // Opened on the tap itself (before the await) so browsers don't block it as a popup; it's
    // pointed at the client's chat once the link is ready.
    const win = window.open("", "_blank");
    try {
      const res = await fetch(`/api/leads/${leadId}/conversation/pdf`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error ?? t("יצירת הסיכום נכשלה"));
      const link = data.phone ? buildWaMeLink(data.phone, data.message) : `https://wa.me/?text=${encodeURIComponent(data.message)}`;
      if (win) win.location.href = link;
      else window.location.href = link;
    } catch (e) {
      win?.close();
      setSendError(e instanceof Error ? e.message : t("יצירת הסיכום נכשלה"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mb-2.5">
      <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
      <button
        type="button"
        onClick={async () => {
          const next = !open;
          setOpen(next);
          if (next && !lines) {
            const res = await fetch(`/api/leads/${leadId}/conversation`).catch(() => null);
            const data = res?.ok ? await res.json() : { transcript: [] };
            setLines(data.transcript ?? []);
          }
        }}
        className="text-xs font-semibold underline underline-offset-2"
        style={{ color: "var(--color-amber-deep)" }}
      >
        {open ? t("הסתרת השיחה") : t("השיחה עם העוזר")}
      </button>
      {hasPhone && (
        <button
          type="button"
          onClick={sendSummary}
          disabled={sending}
          className="text-xs font-semibold underline underline-offset-2 disabled:opacity-60"
          style={{ color: "var(--color-amber-deep)" }}
        >
          {sending ? t("מכין את הסיכום…") : t("שליחת סיכום השיחה בוואטסאפ")}
        </button>
      )}
      </div>
      {sendError && <p className="text-xs text-rose mt-1">{sendError}</p>}
      {open && (
        <div className="mt-2 rounded-xl p-3 bg-chip grid gap-1.5 text-xs">
          {lines === null ? (
            <span className="text-ink-soft">{t("טוען…")}</span>
          ) : lines.length === 0 ? (
            <span className="text-ink-soft">{t("אין הודעות.")}</span>
          ) : (
            lines.map((l, i) => (
              <p key={i} className="[overflow-wrap:anywhere]">
                <b>{l.role === "client" ? t("לקוח/ה:") + " " : t("העוזר:") + " "}</b>
                {l.text}
              </p>
            ))
          )}
        </div>
      )}
    </div>
  );
}
