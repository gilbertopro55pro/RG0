"use client";

import { useState } from "react";
import { buildWaMeLink } from "@/lib/waLink";
import Link from "next/link";
import dynamic from "next/dynamic";
import { PACKAGE_LABELS, resolveLeadPackageLabel, type PackageType } from "@/lib/stages";
import type { CustomPackageRow, EventTypeRow, LeadRow, LeadStatus, PackagePriceRow, PriceQuoteRow, PriceQuoteTemplateRow, PricingSupplier } from "@/lib/types";
import { buildLeadQuotePrefill, hasQuotePrefill } from "@/lib/leadQuotePrefill";
import { useModalEntered } from "@/lib/useModalEntered";
import { CustomPackageBuilder } from "@/components/CustomPackagesSettings";
import PageGuide from "@/components/PageGuide";
import { IconClose } from "@/components/icons/AlbumIcons";
import BackLink from "@/components/BackLink";
import RowMenu from "@/components/RowMenu";
import { sourceLabel } from "@/lib/leadSource";
import { daysUntilPurge } from "@/lib/leadRetention";
import { createClient } from "@/lib/supabase/client";

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
  defaultNotes?: string;
};

// "נוצר ב-29.9.2026, 15:55", Israel time.
function createdLabel(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false });
  return `נוצר ב-${date}, ${time}`;
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "חדש",
  contacted: "יצרתי קשר",
  quoted: "נשלחה הצעת מחיר",
  won: "הפך ללקוח",
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
}: {
  initialLeads: LeadRow[];
  // Idle leads the daily retention job moved out of the list (lib/leadRetention.ts).
  archivedLeads: LeadRow[];
  customPackages: CustomPackageRow[];
  eventTypes: EventTypeRow[];
  prices: PackagePriceRow[];
  isAdmin: boolean;
  quoteBuilder: LeadsQuoteBuilderData;
}) {
  const [leads, setLeads] = useState(initialLeads);
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
      setPurgeError({ id, message: data?.error ?? "המחיקה נכשלה, נסו שוב" });
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

  const updateLead = (id: string, patch: Partial<LeadRow>) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const setStatus = async (id: string, status: LeadStatus) => {
    updateLead(id, { status });
    await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };

  const deleteLead = async (id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
  };

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-1.5">
        <BackLink href="/" label="חזרה לדף הבית" />
        <button onClick={() => setShowAdd(true)} className="h-11 px-4 rounded-full bg-ink text-white text-sm font-bold">
          + ליד חדש
        </button>
      </div>
      <h1 className="text-[26px] font-bold mb-1.5 font-display">לידים ופניות</h1>
      <PageGuide
        pageKey="leads"
        blurb="כל פנייה חדשה מתחילה כאן כליד. שולחים ללקוח/ה הצעת מחיר, ואחרי שהיא מאושרת אפשר להפוך אותה לאירוע סגור בלחיצה."
      />

      {(() => {
        // Leads per source over the last 30 days: which channel (ad, Instagram, WhatsApp, QR...) brings clients.
        const counts = new Map<string, number>();
        for (const l of leads) {
          if (!l.referral_source || new Date(l.created_at).getTime() < sourcesSince) continue;
          const label = sourceLabel(l.referral_source)!;
          counts.set(label, (counts.get(label) ?? 0) + 1);
        }
        if (counts.size === 0) return null;
        const parts = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        return (
          <p className="text-xs text-ink-soft mb-3">
            מקורות ב-30 הימים האחרונים:{" "}
            {parts.map(([label, n], i) => (
              <span key={label}>
                {i > 0 && ", "}
                {label} <span className="font-data font-semibold text-ink">{n}</span>
              </span>
            ))}
          </p>
        );
      })()}

      {leads.length === 0 && <div className="text-center py-16 text-sm text-ink-soft">אין עדיין לידים. לחצו על &quot;ליד חדש&quot; כדי להוסיף</div>}

      {/* Design stage 5: one list split by hairlines, not a card per lead. */}
      <div className={leads.length > 0 ? "rounded-2xl bg-card overflow-hidden divide-y divide-[var(--color-line)]" : ""}>
        {leads.map((lead) => (
          <div key={lead.id} className="p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-[15px]">{lead.name}</span>
                  {lead.source === "assistant" && (
                    <span className="text-[10.5px] font-semibold rounded-full px-2 py-0.5" style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}>
                      מהעוזר
                    </span>
                  )}
                  {lead.source === "form" && (
                    <span className="text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-chip text-ink-soft">מטופס הפנייה</span>
                  )}
                  {sourceLabel(lead.referral_source) && (
                    <span className="text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-chip text-ink-soft">מקור: {sourceLabel(lead.referral_source)}</span>
                  )}
                  {lead.needs_details && (
                    <span className="text-[10.5px] font-semibold rounded-full px-2 py-0.5" style={{ background: "var(--color-rose-bg)", color: "var(--color-rose)" }}>
                      חסרים פרטים
                    </span>
                  )}
                </div>
                {(lead.event_date_interest || resolveLeadPackageLabel(lead.package_interest, customPackages)) && (
                  <div className="text-[13px] text-ink-soft">
                    {[
                      lead.event_date_interest ? new Date(lead.event_date_interest).toLocaleDateString("he-IL") : null,
                      resolveLeadPackageLabel(lead.package_interest, customPackages),
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                )}
                {lead.phone && (
                  <div className="text-[13px] text-ink-soft font-data" dir="ltr" style={{ textAlign: "right" }}>
                    {lead.phone}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <select
                  value={lead.status}
                  onChange={(e) => setStatus(lead.id, e.target.value as LeadStatus)}
                  className="text-[11px] px-2 py-1 rounded-full font-medium border-none"
                  style={{ background: STATUS_COLORS[lead.status].bg, color: STATUS_COLORS[lead.status].text }}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <div className="text-[10.5px] text-ink-soft leading-tight">{createdLabel(lead.created_at)}</div>
                {lead.quote_sent_at && <QuoteSentAge sentAt={lead.quote_sent_at} closed={lead.status === "won" || lead.status === "lost"} now={now} />}
              </div>
            </div>

            {lead.event_type_name && <p className="text-[13px] mb-1">{lead.event_type_name}</p>}
            {lead.notes && <p className="text-xs text-ink-soft mb-2.5">{lead.notes}</p>}
            {lead.bot_conversation_id && <ConversationToggle leadId={lead.id} hasPhone={!!lead.phone} />}

            {lead.quoted_amount && (
              <div className="text-[13px] font-bold mb-2.5">
                הצעת מחיר: <span className="font-data">₪{Number(lead.quoted_amount).toLocaleString("he-IL")}</span>
              </div>
            )}

            {/* Admin-only for now (see the standing "עדכון אדמין" staged-rollout process) — the
                client-side approve+questionnaire flow on /quotes/[token] only actually works for
                this account, so showing its pipeline state to any other photographer would just
                be confusing (their clients still see the old call-us-to-confirm page). */}
            {isAdmin && lead.quoted_amount && !lead.converted_event_id && (
              <div
                className="text-xs mb-2.5 rounded-lg px-2.5 py-1.5 inline-block"
                style={
                  lead.quote_approved_at
                    ? { background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }
                    : { background: "#F1EFE9", color: "var(--color-ink-soft)" }
                }
              >
                {lead.quote_approved_at
                  ? "ההצעה אושרה ע\"י הלקוח/ה: ממתין למילוי שאלון פרטי האירוע"
                  : "ממתין לאישור ההצעה ע\"י הלקוח/ה"}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              {!lead.converted_event_id && (
                <button
                  onClick={() => setConvertLead(lead)}
                  className="text-[13px] font-bold h-9 px-3 rounded-lg bg-ink text-white"
                >
                  המרה לאירוע
                </button>
              )}
              {lead.converted_event_id && (
                <Link
                  href={`/events/${lead.converted_event_id}`}
                  className="text-[13px] font-bold h-9 px-3 rounded-lg bg-sage-bg text-sage flex items-center"
                >
                  הפך לאירוע, לפתיחה
                </Link>
              )}
              {quoteFormLeadId !== lead.id && !lead.converted_event_id && (
                <button
                  onClick={() => (hasQuotePrefill(lead.details) ? setBuilderLead(lead) : setQuoteFormLeadId(lead.id))}
                  className="text-[13px] font-bold h-9 px-3 rounded-lg bg-white border border-line text-ink"
                >
                  {lead.quoted_amount ? "עדכון הצעה" : "הצעת מחיר"}
                </button>
              )}
              {lead.quoted_amount && <CopyQuoteLinkButton token={lead.quote_token} />}
              <span className="flex-1" />
              <RowMenu items={[{ label: "מחיקת הליד", onClick: () => deleteLead(lead.id), danger: true }]} />
            </div>

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
        <div className="mt-6 text-right">
          <button
            type="button"
            onClick={() => setShowArchive((v) => !v)}
            aria-expanded={showArchive}
            className="text-xs font-semibold underline underline-offset-2"
            style={{ color: "var(--color-amber-deep)" }}
          >
            ארכיון ({archived.length})
          </button>
          <p className="text-ink-soft text-xs mt-1">לידים בלי פעילות 13 יום עוברים לכאן, ונמחקים לצמיתות אחרי 14 ימים נוספים.</p>

          {showArchive && (
            <div className="mt-3 rounded-2xl bg-card overflow-hidden divide-y divide-[var(--color-line)]">
              {archived.map((lead) => {
                const days = daysUntilPurge(lead.archived_at ?? new Date(now).toISOString(), now);
                const purgeLabel =
                  days === 0 ? "יימחק לצמיתות היום" : days === 1 ? "יימחק לצמיתות מחר" : `יימחק לצמיתות בעוד ${days} ימים`;
                const packageLabel = resolveLeadPackageLabel(lead.package_interest, customPackages);
                return (
                  <div key={lead.id} className="p-4">
                    <div className="min-w-0 mb-2">
                      <span className="font-bold text-[15px]">{lead.name}</span>
                      {(lead.event_date_interest || packageLabel) && (
                        <div className="text-[13px] text-ink-soft">
                          {[lead.event_date_interest ? new Date(lead.event_date_interest).toLocaleDateString("he-IL") : null, packageLabel]
                            .filter(Boolean)
                            .join(", ")}
                        </div>
                      )}
                      {lead.phone && (
                        <div className="text-[13px] text-ink-soft font-data" dir="ltr" style={{ textAlign: "right" }}>
                          {lead.phone}
                        </div>
                      )}
                    </div>
                    {lead.event_type_name && <p className="text-[13px] mb-1">{lead.event_type_name}</p>}
                    <p className="text-[11px] font-bold text-rose">{purgeLabel}</p>

                    {purgeConfirmId === lead.id ? (
                      <div className="mt-2.5 rounded-xl p-3 bg-chip space-y-2">
                        <p className="text-xs font-semibold text-rose">למחוק את הליד לצמיתות? אי אפשר לשחזר.</p>
                        {purgeError?.id === lead.id && <p className="text-xs text-rose">{purgeError.message}</p>}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => purgeArchivedLead(lead.id)}
                            disabled={purgingId === lead.id}
                            className="flex-1 rounded-lg py-2 text-xs font-semibold bg-rose text-white disabled:opacity-60"
                          >
                            {purgingId === lead.id ? "מוחק..." : "מחיקה לצמיתות"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPurgeConfirmId(null);
                              setPurgeError(null);
                            }}
                            className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft"
                          >
                            ביטול
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
                          המרה לאירוע
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPurgeConfirmId(lead.id);
                            setPurgeError(null);
                          }}
                          className="text-[13px] font-bold h-9 px-3 rounded-lg bg-white border border-line text-rose"
                        >
                          מחיקה לצמיתות
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

      {builderLead && hasQuotePrefill(builderLead.details) && (
        <EventPricingCalculator
          hourlyRate={quoteBuilder.hourlyRate}
          suppliers={quoteBuilder.suppliers}
          priceQuotes={quoteBuilder.priceQuotes}
          templates={quoteBuilder.templates}
          eventTypes={eventTypes.map((t) => ({ id: t.id, name: t.name }))}
          initialCustomEventTypes={quoteBuilder.customEventTypes}
          defaultTaxStatus={quoteBuilder.defaultTaxStatus}
          defaultNotes={quoteBuilder.defaultNotes}
          prefill={buildLeadQuotePrefill({
            details: builderLead.details,
            leadName: builderLead.name,
            leadPhone: builderLead.phone,
            suppliers: quoteBuilder.suppliers,
            templates: quoteBuilder.templates,
          })}
          leadId={builderLead.id}
          onLeadQuoted={(patch) => updateLead(builderLead.id, patch)}
          onClose={() => setBuilderLead(null)}
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

function CopyQuoteLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}/quotes/${token}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="text-[13px] font-bold h-9 px-3 rounded-lg bg-white border border-line text-ink"
    >
      {copied ? "הועתק ✓" : "העתקת קישור הצעה"}
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
      setError(data.error ?? "שגיאה ביצירת ההצעה");
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
        placeholder="סכום ההצעה (₪)"
        className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="הערות (אופציונלי)"
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
          {saving ? "שומר..." : "שמירת הצעת מחיר"}
        </button>
        <button onClick={onClose} className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft">
          ביטול
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
      setError(data.error ?? "שגיאה בהוספת הליד");
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
          <h2 className="text-xl font-bold font-display">ליד חדש</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs block mb-1 text-ink-soft">שם</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white" />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">טלפון</label>
            <input type="tel" value={phone} onChange={(e) => {
              setPhone(e.target.value);
              setDuplicateName(null);
            }} className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white font-data" />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">תאריך אירוע משוער</label>
            <input type="date" value={eventDateInterest} onChange={(e) => setEventDateInterest(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white" />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">חבילה מבוקשת</label>
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
              <option value="">לא ידוע</option>
              {Object.keys(PACKAGE_LABELS).map((p) => (
                <option key={p} value={p}>
                  {PACKAGE_LABELS[p as PackageType]}
                </option>
              ))}
              {customPackages.map((cp) => (
                <option key={cp.id} value={`custom:${cp.id}`}>
                  {cp.name}
                </option>
              ))}
              <option value={CREATE_CUSTOM_PACKAGE_VALUE}>+ חבילה מותאמת אישית חדשה</option>
            </select>
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">הערות</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white resize-none" />
          </div>
          {error && <p className="text-xs text-rose">{error}</p>}
          {duplicateName && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}>
              כבר יש ליד עם הטלפון הזה ({duplicateName}). אם זה אותו לקוח ואותו אירוע, עדיף לעדכן את הליד הקיים. אם זה אירוע אחר, אפשר להוסיף בכל זאת.
            </p>
          )}
          <button onClick={submit} disabled={!name.trim() || saving} className="w-full rounded-lg py-3 text-sm font-semibold mt-2 bg-ink text-white disabled:opacity-60">
            {saving ? "שומר..." : duplicateName ? "להוסיף בכל זאת" : "הוספת ליד"}
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
  const day = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const days = Math.max(0, Math.round((Date.parse(day(now)) - Date.parse(day(Date.parse(sentAt)))) / 86400000));
  const ago = days === 0 ? "נשלחה היום" : days === 1 ? "לפני יום" : days === 2 ? "לפני יומיים" : `לפני ${days} ימים`;
  return (
    <div className="text-left leading-tight">
      <div className="text-[10.5px] text-ink-soft">
        הצעת מחיר: {new Date(sentAt).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", year: "2-digit" })}
      </div>
      {!closed && <div className="text-[11px] font-bold text-rose">{ago}</div>}
    </div>
  );
}

// The intake assistant's conversation behind a lead, loaded on demand, plus sending its PDF summary
// (api/leads/[id]/conversation/pdf) to the client on WhatsApp.
function ConversationToggle({ leadId, hasPhone }: { leadId: string; hasPhone: boolean }) {
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
      if (!res.ok || !data?.url) throw new Error(data?.error ?? "יצירת הסיכום נכשלה");
      const link = data.phone ? buildWaMeLink(data.phone, data.message) : `https://wa.me/?text=${encodeURIComponent(data.message)}`;
      if (win) win.location.href = link;
      else window.location.href = link;
    } catch (e) {
      win?.close();
      setSendError(e instanceof Error ? e.message : "יצירת הסיכום נכשלה");
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
        {open ? "הסתרת השיחה" : "השיחה עם העוזר"}
      </button>
      {hasPhone && (
        <button
          type="button"
          onClick={sendSummary}
          disabled={sending}
          className="text-xs font-semibold underline underline-offset-2 disabled:opacity-60"
          style={{ color: "var(--color-amber-deep)" }}
        >
          {sending ? "מכין את הסיכום…" : "שליחת סיכום השיחה בוואטסאפ"}
        </button>
      )}
      </div>
      {sendError && <p className="text-xs text-rose mt-1">{sendError}</p>}
      {open && (
        <div className="mt-2 rounded-xl p-3 bg-chip grid gap-1.5 text-xs">
          {lines === null ? (
            <span className="text-ink-soft">טוען…</span>
          ) : lines.length === 0 ? (
            <span className="text-ink-soft">אין הודעות.</span>
          ) : (
            lines.map((l, i) => (
              <p key={i} className="[overflow-wrap:anywhere]">
                <b>{l.role === "client" ? "לקוח/ה: " : "העוזר: "}</b>
                {l.text}
              </p>
            ))
          )}
        </div>
      )}
    </div>
  );
}
