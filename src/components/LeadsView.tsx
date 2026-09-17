"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { PACKAGE_LABELS, resolveLeadPackageLabel, type PackageType } from "@/lib/stages";
import type { CustomPackageRow, EventTypeRow, LeadRow, LeadStatus, PackagePriceRow } from "@/lib/types";
import { useModalEntered } from "@/lib/useModalEntered";
import { CustomPackageBuilder } from "@/components/CustomPackagesSettings";
import PageGuide from "@/components/PageGuide";

const CREATE_CUSTOM_PACKAGE_VALUE = "__create_custom__";

const NewEventModal = dynamic(() => import("@/components/NewEventModal"), { ssr: false });

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "חדש",
  contacted: "יצרתי קשר",
  quoted: "נשלחה הצעת מחיר",
  won: "הפך ללקוח",
  lost: "לא התקדם",
};

const STATUS_COLORS: Record<LeadStatus, { bg: string; text: string }> = {
  new: { bg: "#F1EFE9", text: "var(--color-ink-soft)" },
  contacted: { bg: "var(--color-amber-bg)", text: "var(--color-amber-deep)" },
  quoted: { bg: "#EEEDFC", text: "#5E5CE6" },
  won: { bg: "var(--color-sage-bg)", text: "var(--color-sage)" },
  lost: { bg: "#FBEEEC", text: "var(--color-rose)" },
};

export default function LeadsView({
  initialLeads,
  customPackages: initialCustomPackages,
  eventTypes: initialEventTypes,
  prices: initialPrices,
  isAdmin,
}: {
  initialLeads: LeadRow[];
  customPackages: CustomPackageRow[];
  eventTypes: EventTypeRow[];
  prices: PackagePriceRow[];
  isAdmin: boolean;
}) {
  const [leads, setLeads] = useState(initialLeads);
  // Owned here (not inside AddLeadModal) so a package created via "+ חבילה מותאמת אישית חדשה"
  // shows up immediately in the lead-row label below, without waiting for a page refresh.
  const [customPackages, setCustomPackages] = useState(initialCustomPackages);
  const [eventTypes, setEventTypes] = useState(initialEventTypes);
  const [prices, setPrices] = useState(initialPrices);
  const [showAdd, setShowAdd] = useState(false);
  const [quoteFormLeadId, setQuoteFormLeadId] = useState<string | null>(null);
  const [convertLead, setConvertLead] = useState<LeadRow | null>(null);

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
        <Link href="/" className="flex items-center gap-1 text-sm tracking-wide text-ink-soft">
          ← חזרה לדף הבית
        </Link>
        <button
          onClick={() => setShowAdd(true)}
          className="h-9 w-9 rounded-full flex items-center justify-center bg-ink shadow-card text-white text-lg leading-none"
        >
          +
        </button>
      </div>
      <h1 className="text-[26px] font-bold mb-1.5 font-display">לידים ופניות</h1>
      <PageGuide
        pageKey="leads"
        blurb="כל פנייה חדשה מתחילה כאן כליד. שולחים ללקוח/ה הצעת מחיר, ואחרי שהיא מאושרת אפשר להפוך אותה לאירוע סגור בלחיצה."
      />

      {leads.length === 0 && <div className="text-center py-16 text-sm text-ink-soft">אין עדיין לידים — לחצו על + כדי להוסיף</div>}

      <div className="space-y-3">
        {leads.map((lead) => (
          <div key={lead.id} className="rounded-2xl p-4 bg-card border border-line shadow-card">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="font-semibold text-sm">{lead.name}</div>
                <div className="text-xs text-ink-soft font-data">
                  {lead.phone}
                  {lead.event_date_interest && ` · ${new Date(lead.event_date_interest).toLocaleDateString("he-IL")}`}
                  {resolveLeadPackageLabel(lead.package_interest, customPackages) && ` · ${resolveLeadPackageLabel(lead.package_interest, customPackages)}`}
                </div>
              </div>
              <select
                value={lead.status}
                onChange={(e) => setStatus(lead.id, e.target.value as LeadStatus)}
                className="text-[11px] px-2 py-1 rounded-full tracking-wide font-medium border-none"
                style={{ background: STATUS_COLORS[lead.status].bg, color: STATUS_COLORS[lead.status].text }}
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {lead.notes && <p className="text-xs text-ink-soft mb-2.5">{lead.notes}</p>}

            {lead.quoted_amount && (
              <div className="text-xs mb-2.5 text-ink-soft">
                הצעת מחיר: <span className="font-data">₪{lead.quoted_amount}</span>
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
                  ? "ההצעה אושרה ע\"י הלקוח/ה — ממתין למילוי שאלון פרטי האירוע"
                  : "ממתין לאישור ההצעה ע\"י הלקוח/ה"}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-2.5">
              {quoteFormLeadId !== lead.id && !lead.converted_event_id && (
                <button
                  onClick={() => setQuoteFormLeadId(lead.id)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-line text-ink"
                >
                  {lead.quoted_amount ? "עדכון הצעת מחיר" : "יצירת הצעת מחיר"}
                </button>
              )}
              {lead.quoted_amount && (
                <CopyQuoteLinkButton token={lead.quote_token} />
              )}
              {!lead.converted_event_id && (
                <button
                  onClick={() => setConvertLead(lead)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-ink text-white"
                >
                  המרה לאירוע
                </button>
              )}
              {lead.converted_event_id && (
                <Link
                  href={`/events/${lead.converted_event_id}`}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-sage-bg text-sage"
                >
                  הפך לאירוע ✓
                </Link>
              )}
              <button
                onClick={() => deleteLead(lead.id)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg text-rose"
              >
                מחיקה
              </button>
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

      {convertLead && (
        <NewEventModal
          onClose={() => setConvertLead(null)}
          leadId={convertLead.id}
          customPackages={customPackages}
          initial={{
            clientName: convertLead.name,
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
      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-line text-ink"
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
      }),
    });
    const data = await res.json();
    setSaving(false);
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
        background: "rgba(46,49,66,0.45)",
        backdropFilter: entered ? "blur(16px)" : "blur(0px)",
        WebkitBackdropFilter: entered ? "blur(16px)" : "blur(0px)",
        transition: "backdrop-filter 280ms ease, -webkit-backdrop-filter 280ms ease",
      }}
    >
      <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold font-display">ליד חדש</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line">
            ✕
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs block mb-1 text-ink-soft">שם</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white" />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">טלפון</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white font-data" />
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
          <button onClick={submit} disabled={!name.trim() || saving} className="w-full rounded-lg py-3 text-sm font-semibold mt-2 bg-ink text-white disabled:opacity-60">
            {saving ? "שומר..." : "הוספת ליד"}
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
