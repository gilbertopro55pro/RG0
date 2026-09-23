"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateDMYFromInput } from "@/lib/dateInputFormat";
import type { PriceQuoteItem, PriceQuoteRow, PriceQuoteTemplateRow, PricingSupplier } from "@/lib/types";
import CompactGuideModal from "@/components/CompactGuideModal";
import { IconClose } from "@/components/icons/AlbumIcons";
import { IconArrowRight } from "@/components/icons/NavIcons";

const VAT_RATE = 0.18;
const HOURS_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1);
const RATE_OPTIONS = Array.from({ length: 20 }, (_, i) => (i + 1) * 50);
const DEFAULT_EVENT_TYPES = ["חתונה", "חינה", "בר מצווה", "בת מצווה", "מגנטים", "עלייה לתורה"];
// Custom-typed event types are capped so the "remembered" list can't grow forever from one-off typos.
const MAX_CUSTOM_EVENT_TYPES = 20;

type ContactPickerContact = { tel?: string[] };
type ContactPickerNavigator = Navigator & {
  contacts?: { select: (properties: string[], options: { multiple: boolean }) => Promise<ContactPickerContact[]> };
};

type Mode = "event" | "standard" | "freelance";
type Step = "calculator" | "quoteForm" | "preview" | "savePrompt" | "leadFollowUp";
// A row in the per-quote vendor list: either a real saved supplier (supplierId matches
// PricingSupplier.id) or a free-typed one-off (supplierId === "__custom__", name in customName).
type QuoteVendorRow = { id: string; supplierId: string; customName: string; price: number };

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

function currency(n: number): string {
  return `${Math.round(n).toLocaleString("he-IL")} ₪`;
}

// The "←" glyph matches the app's own existing back-navigation convention (see the "← חזרה לדף
// הבית" link on the magnet-frames page) rather than introducing a new one just for this modal.
function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="חזרה"
      title="חזרה"
      className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 border border-line bg-white text-ink-soft"
    >
      <IconArrowRight className="h-3.5 w-3.5" />
    </button>
  );
}

function formatDateDMY(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

// "HH:MM" strings — an end time numerically before the start means the shoot crosses midnight
// (e.g. 20:00–01:00), not an invalid range, so that case wraps to the next day instead of
// rejecting it.
function hoursBetween(start: string, end: string): number | null {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return diff > 0 ? Math.round((diff / 60) * 10) / 10 : null;
}

export default function EventPricingCalculator({
  hourlyRate,
  suppliers,
  priceQuotes,
  templates,
  eventTypes,
  initialCustomEventTypes,
  defaultTaxStatus,
  onClose,
}: {
  hourlyRate: number;
  suppliers: PricingSupplier[];
  priceQuotes: PriceQuoteRow[];
  templates: PriceQuoteTemplateRow[];
  eventTypes: { id: string; name: string }[];
  initialCustomEventTypes: string[];
  defaultTaxStatus: "exempt" | "licensed";
  onClose: () => void;
}) {
  const supabase = createClient();

  const [step, setStep] = useState<Step>("calculator");
  const [mode, setMode] = useState<Mode>("event");
  // Starts unselected — a freshly opened builder must never look like it's already tied to
  // whatever quote happens to be most recent; loading one is an explicit choice from the dropdown.
  const [selectedQuoteId, setSelectedQuoteId] = useState("");
  // Same "starts unselected" reasoning as selectedQuoteId above — picking a template is always an
  // explicit action, never something a freshly opened builder should look like it already did.
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  // Defaults to the photographer's own business status from Settings (ProfileSettingsView.tsx),
  // but stays a per-calculation toggle — a photographer occasionally quoting for a different
  // business arrangement can still switch it for just this one quote without touching Settings.
  const [taxStatus, setTaxStatus] = useState<"exempt" | "licensed">(defaultTaxStatus);
  const isExempt = taxStatus === "exempt";
  const [hours, setHours] = useState(0);
  const [rate, setRate] = useState(hourlyRate);

  // The photographer's saved default supplier list — only read from here (to populate the picker
  // dropdown and to seed a row's starting price the moment a supplier is chosen); renaming or
  // re-pricing the account-wide defaults themselves happens in Settings (PricingSuppliersSettings),
  // not in this calculator, so this never needs its own setter.
  const supplierList: PricingSupplier[] = suppliers;
  // Starts empty — a new quote must never inherit the vendor list from whatever quote was open
  // before; the photographer explicitly builds the vendor rows relevant to this one.
  const [quoteVendorRows, setQuoteVendorRows] = useState<QuoteVendorRow[]>([]);
  // "עריכת ספקים" here means bulk-managing THIS quote's own vendor rows (multi-select + delete) —
  // every row is already directly editable (name/price) without entering this mode; it's purely a
  // faster way to remove several at once. Nothing here touches the account-wide supplier defaults.
  const [managingSuppliers, setManagingSuppliers] = useState(false);
  const [deleteSelectedIds, setDeleteSelectedIds] = useState<Set<string>>(new Set());

  // The "יצירת הצעת מחיר ללקוח" wizard
  const [quoteClientName, setQuoteClientName] = useState("");
  const [quoteClientPhone, setQuoteClientPhone] = useState("");
  const [quoteEventType, setQuoteEventType] = useState("");
  const [quoteEventDate, setQuoteEventDate] = useState("");
  const [quoteEventLocation, setQuoteEventLocation] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");
  // Only asked for (and only relevant) outside freelance mode — freelance already has its own
  // fixed hours/rate cells on the main screen, set before this wizard ever opens.
  const [quoteStartTime, setQuoteStartTime] = useState("");
  const [quoteEndTime, setQuoteEndTime] = useState("");
  const [eventTypeFocused, setEventTypeFocused] = useState(false);
  // Whatever the photographer types beyond the built-in suggestions, most-recent-first — persisted
  // on the photographer row (see rememberEventType below) so it carries over next time, on any
  // device. Deliberately separate from the DB event_types table used elsewhere in Settings, since
  // that one cascades into real configured package pricing on delete.
  const [customEventTypes, setCustomEventTypes] = useState<string[]>(initialCustomEventTypes);
  const [quoteFormError, setQuoteFormError] = useState<string | null>(null);
  const [sendingQuote, setSendingQuote] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [quoteFile, setQuoteFile] = useState<File | null>(null);
  const [savePromptStep, setSavePromptStep] = useState<"ask" | "name">("ask");
  const [saveQuoteName, setSaveQuoteName] = useState("");
  const [savingQuote, setSavingQuote] = useState(false);
  const [addingLead, setAddingLead] = useState(false);
  // "עיגול מחיר" — lets the photographer round the VAT-included total to a clean number by nudging
  // one supplier's price up or down, instead of the total landing on an odd number like 5,213 ₪.
  const [roundingOpen, setRoundingOpen] = useState(false);
  const [roundingTarget, setRoundingTarget] = useState("");
  const [roundingError, setRoundingError] = useState<string | null>(null);

  const selectQuote = (id: string) => {
    setSelectedQuoteId(id);
    const q = priceQuotes.find((pq) => pq.id === id);
    if (!q) {
      setQuoteVendorRows([]);
      return;
    }
    if (q.event_hours != null) setHours(Number(q.event_hours));
    if (q.hourly_rate_used != null) setRate(Number(q.hourly_rate_used));
    // Matches the quote's saved item names back against the current supplier list — a supplier
    // renamed or removed since this quote was built simply becomes a free-text row, which is the
    // safest fallback (no silently-wrong price tied to the wrong current supplier).
    const vendorItems = q.items.filter((it) => it.item !== "צילום אירוע");
    setQuoteVendorRows(
      vendorItems.map((it) => {
        const matched = supplierList.find((s) => s.name === it.item);
        return matched
          ? { id: makeId(), supplierId: matched.id, customName: "", price: matched.price }
          : { id: makeId(), supplierId: "__custom__", customName: it.item, price: it.price };
      })
    );
  };

  // A template (built in Settings) is a curated preset of items, not a past quote tied to hours/
  // rate — loading one only replaces the vendor rows (same item→row matching as selectQuote above),
  // leaving hours/rate/tax-status exactly as the photographer already has them set.
  const selectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const t = templates.find((tpl) => tpl.id === id);
    if (!t) return;
    setQuoteVendorRows(
      t.items
        .filter((it) => it.item !== "צילום אירוע")
        .map((it) => {
          const matched = supplierList.find((s) => s.name === it.item);
          return matched
            ? { id: makeId(), supplierId: matched.id, customName: "", price: matched.price }
            : { id: makeId(), supplierId: "__custom__", customName: it.item, price: it.price };
        })
    );
  };

  const addVendorRow = () => setQuoteVendorRows((prev) => [...prev, { id: makeId(), supplierId: "", customName: "", price: 0 }]);
  const removeVendorRow = (id: string) => setQuoteVendorRows((prev) => prev.filter((r) => r.id !== id));
  const updateVendorRow = (id: string, patch: Partial<QuoteVendorRow>) =>
    setQuoteVendorRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const selectVendorSupplier = (rowId: string, value: string) => {
    if (value === "__custom__") {
      updateVendorRow(rowId, { supplierId: value, customName: "", price: 0 });
      return;
    }
    const matched = supplierList.find((s) => s.id === value);
    updateVendorRow(rowId, { supplierId: value, customName: "", price: matched?.price ?? 0 });
  };

  const toggleDeleteSelect = (id: string) => {
    setDeleteSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAllForDelete = () => {
    setDeleteSelectedIds((prev) => (prev.size === quoteVendorRows.length ? new Set() : new Set(quoteVendorRows.map((r) => r.id))));
  };
  const deleteSelectedVendorRows = () => {
    setQuoteVendorRows((prev) => prev.filter((r) => !deleteSelectedIds.has(r.id)));
    setDeleteSelectedIds(new Set());
  };
  const finishManagingSuppliers = () => {
    setDeleteSelectedIds(new Set());
    setManagingSuppliers(false);
  };

  // Standing suggestions: the hardcoded defaults plus whatever event types the photographer has
  // configured pricing for in Settings (event_types) — deduped case-insensitively, defaults first.
  const standingEventTypes = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const name of [...DEFAULT_EVENT_TYPES, ...eventTypes.map((t) => t.name)]) {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (trimmed && !seen.has(key)) {
        seen.add(key);
        result.push(trimmed);
      }
    }
    return result;
  }, [eventTypes]);

  // Custom (photographer-typed) entries lead the list, per the request that a typed value shows up
  // "at the top" next time — standing suggestions already present as a custom entry are skipped so
  // nothing appears twice.
  const allEventTypeOptions = useMemo(() => {
    const customKeys = new Set(customEventTypes.map((c) => c.trim().toLowerCase()));
    return [...customEventTypes, ...standingEventTypes.filter((s) => !customKeys.has(s.trim().toLowerCase()))];
  }, [customEventTypes, standingEventTypes]);

  const filteredEventTypes = useMemo(() => {
    const q = quoteEventType.trim();
    return q ? allEventTypeOptions.filter((name) => name.includes(q)) : allEventTypeOptions;
  }, [allEventTypeOptions, quoteEventType]);

  const persistCustomEventTypes = async (list: string[]) => {
    setCustomEventTypes(list);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await supabase.from("photographers").update({ quote_event_type_suggestions: list }).eq("id", user.id);
  };

  // Called on blur — a value the photographer types and then moves on from (whether by clicking
  // "המשך" or just clicking elsewhere) is exactly what should be remembered for next time. Already
  // being a standing suggestion (default or configured pricing) or already remembered is a no-op,
  // so re-typing the same value repeatedly doesn't just keep bumping it or growing the list.
  const rememberEventType = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (standingEventTypes.some((s) => s.toLowerCase() === key)) return;
    if (customEventTypes.some((c) => c.trim().toLowerCase() === key)) return;
    persistCustomEventTypes([trimmed, ...customEventTypes].slice(0, MAX_CUSTOM_EVENT_TYPES));
  };
  const removeCustomEventType = (name: string) => {
    persistCustomEventTypes(customEventTypes.filter((c) => c !== name));
  };
  const clearCustomEventTypes = () => {
    persistCustomEventTypes([]);
  };

  // A row's own price is always the source of truth — seeded from the supplier's saved default the
  // moment it's picked (selectVendorSupplier), then freely editable per-quote from there, same as a
  // free-text row. This is what makes overriding a preset supplier's price for just this one quote
  // possible without touching that supplier's account-wide default.
  const vendorRowPrice = (row: QuoteVendorRow): number => Number(row.price) || 0;

  const { subtotal, vatAmount, total } = useMemo(() => {
    const shootCost = hours * rate;
    const suppliersCost = mode === "freelance" ? 0 : quoteVendorRows.reduce((sum, r) => sum + vendorRowPrice(r), 0);
    const sub = shootCost + suppliersCost;
    const vat = isExempt ? 0 : Math.round(sub * VAT_RATE * 100) / 100;
    return { subtotal: sub, vatAmount: vat, total: Math.round((sub + vat) * 100) / 100 };
  }, [hours, rate, mode, quoteVendorRows, supplierList, isExempt, vendorRowPrice]);

  const shootDetails = mode === "freelance" ? `${hours} שעות` : `${quoteStartTime}–${quoteEndTime}`;

  // Only offered when there's an actual supplier the adjustment can be absorbed into — a row under
  // 200 ₪ risks going negative or swinging by a large fraction of its own price for what should be
  // a small cosmetic tweak to the total.
  const canRoundPrice = mode !== "freelance" && quoteVendorRows.some((r) => vendorRowPrice(r) > 200);

  const openRounding = () => {
    setRoundingTarget(String(Math.round(total / 10) * 10));
    setRoundingError(null);
    setRoundingOpen(true);
  };
  const cancelRounding = () => {
    setRoundingOpen(false);
    setRoundingError(null);
  };
  // Solves for the one supplier price that makes the VAT-included total land exactly on the
  // photographer's requested round number: total = (everythingElse + newPrice) * 1.18, so
  // newPrice = desiredTotal/1.18 - everythingElse. Picks the highest-priced eligible row so the
  // absorbed adjustment is the smallest relative change and least likely to go negative.
  const applyPriceRounding = () => {
    const desiredTotal = Number(roundingTarget);
    if (!roundingTarget.trim() || !Number.isFinite(desiredTotal) || desiredTotal <= 0) {
      setRoundingError("יש להזין מחיר תקין");
      return;
    }
    const eligibleRows = quoteVendorRows.filter((r) => vendorRowPrice(r) > 200);
    if (eligibleRows.length === 0) {
      setRoundingError("אין ספק עם מחיר מעל 200 ₪ להתאמה");
      return;
    }
    const target = eligibleRows.reduce((max, r) => (vendorRowPrice(r) > vendorRowPrice(max) ? r : max));
    const everythingElse =
      hours * rate + quoteVendorRows.filter((r) => r.id !== target.id).reduce((sum, r) => sum + vendorRowPrice(r), 0);
    const newPrice = Math.round((desiredTotal / (1 + VAT_RATE) - everythingElse) * 100) / 100;
    if (newPrice < 0) {
      setRoundingError("המחיר המבוקש נמוך מדי להתאמה");
      return;
    }
    updateVendorRow(target.id, { price: newPrice });
    setRoundingOpen(false);
    setRoundingError(null);
  };

  const quoteItems = useMemo((): PriceQuoteItem[] => {
    const shootItem: PriceQuoteItem = { item: "צילום אירוע", details: shootDetails, price: hours * rate };
    if (mode === "freelance") return [shootItem];
    const supplierItems: PriceQuoteItem[] = quoteVendorRows
      .map((r) => {
        const name = r.supplierId === "__custom__" ? r.customName.trim() : supplierList.find((s) => s.id === r.supplierId)?.name ?? "";
        return name ? { item: name, details: "", price: vendorRowPrice(r) } : null;
      })
      .filter((it): it is PriceQuoteItem => it !== null);
    return [shootItem, ...supplierItems];
  }, [quoteVendorRows, supplierList, hours, rate, mode, shootDetails, vendorRowPrice]);

  const openQuoteForm = () => {
    setQuoteFormError(null);
    setStep("quoteForm");
  };

  // Contact Picker API — Android Chrome only as of now, so this is feature-detected rather than
  // device-detected: wherever it exists it already comes with its own search box built into the
  // browser's native picker UI, nothing extra to build for that. The iPhone exclusion is explicit
  // (not just relying on the feature check) — iOS Safari doesn't support this API, but the
  // photographer reported "the contacts option" being a mess there regardless, which was actually
  // Safari's own native contact-autofill suggestion bar (see autoComplete="off" on the fields
  // below) rather than this button — belt-and-suspenders against any future WebKit change too.
  const supportsContactPicker =
    typeof navigator !== "undefined" &&
    "contacts" in navigator &&
    "ContactsManager" in window &&
    !/iPhone|iPad|iPod/i.test(navigator.userAgent);
  const pickContact = async () => {
    try {
      const contacts = await (navigator as ContactPickerNavigator).contacts!.select(["tel"], { multiple: false });
      const tel = contacts[0]?.tel?.[0];
      if (tel) setQuoteClientPhone(tel);
    } catch {
      // User cancelled the picker, or the browser refused (no permission) — nothing to show.
    }
  };

  const goToPreview = () => {
    if (!quoteClientName.trim() || !quoteClientPhone.trim() || !quoteEventType.trim() || !quoteEventDate || !quoteEventLocation.trim()) {
      setQuoteFormError("יש למלא את כל השדות");
      return;
    }
    if (mode !== "freelance") {
      if (!quoteStartTime || !quoteEndTime) {
        setQuoteFormError("יש למלא את כל השדות");
        return;
      }
      const h = hoursBetween(quoteStartTime, quoteEndTime);
      if (h == null) {
        setQuoteFormError("שעת הסיום צריכה להיות אחרי שעת ההתחלה");
        return;
      }
      setHours(h);
    }
    setQuoteFormError(null);
    setSendError(null);
    setQuoteFile(null);
    setStep("preview");
    void prepareQuoteFile();
  };

  // Generates the PDF as soon as the preview screen opens, well before the person taps "שליחה" —
  // deliberately NOT part of sendQuote itself. iOS Safari only allows navigator.share() when it's
  // called with no async gap after the triggering tap; awaiting this fetch inside the click handler
  // used to eat that window by the time the PDF came back, and Safari rejected the share with a
  // generic "not allowed" error even though the person really did just tap Send. Preparing the file
  // ahead of time means the click handler below has nothing left to await before sharing.
  const prepareQuoteFile = async () => {
    setSendingQuote(true);
    setSendError(null);
    try {
      const res = await fetch("/api/price-quotes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: quoteClientName.trim(),
          items: quoteItems,
          subtotal,
          vatAmount,
          total,
          showVat: !isExempt,
          eventDetails: {
            type: quoteEventType.trim(),
            date: formatDateDMY(quoteEventDate),
            location: quoteEventLocation.trim(),
            workHours: mode !== "freelance" && quoteStartTime && quoteEndTime ? `${quoteStartTime}-${quoteEndTime}` : undefined,
          },
          notes: quoteNotes.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("יצירת הקובץ נכשלה");
      const blob = await res.blob();
      setQuoteFile(new File([blob], "הצעת-מחיר.pdf", { type: "application/pdf" }));
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "הכנת הקובץ נכשלה");
    } finally {
      setSendingQuote(false);
    }
  };

  // Bound directly to the button's onClick and stays synchronous up to the navigator.share() call
  // itself (see prepareQuoteFile above for why). If the file somehow isn't ready yet, retries
  // preparing it instead of trying to share nothing.
  const sendQuote = () => {
    if (!quoteFile) {
      if (!sendingQuote) void prepareQuoteFile();
      return;
    }
    setSendError(null);
    (async () => {
      try {
        if (navigator.canShare?.({ files: [quoteFile] })) {
          await navigator.share({ files: [quoteFile], title: "הצעת מחיר" });
        } else {
          window.open(URL.createObjectURL(quoteFile), "_blank");
        }
        setSavePromptStep("ask");
        setStep("savePrompt");
      } catch (err) {
        // AbortError = the person just closed the native share sheet — not a real failure.
        if (err instanceof Error && err.name === "AbortError") return;
        // A "not allowed" rejection from Safari/iOS still means the person tapped Send — fall back
        // to just opening the file so they can share it manually, instead of a dead-end error.
        if (err instanceof Error && err.name === "NotAllowedError") {
          window.open(URL.createObjectURL(quoteFile), "_blank");
          setSavePromptStep("ask");
          setStep("savePrompt");
          return;
        }
        setSendError(err instanceof Error ? err.message : "השיתוף נכשל");
      }
    })();
  };

  const confirmSaveQuote = async () => {
    setSavingQuote(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("price_quotes").insert({
        photographer_id: user.id,
        client_name: quoteClientName.trim(),
        client_phone: quoteClientPhone.trim(),
        items: quoteItems,
        subtotal,
        vat_amount: vatAmount,
        total,
        quote_name: saveQuoteName.trim() || null,
        event_hours: hours,
        hourly_rate_used: rate,
        event_type: quoteEventType.trim() || null,
        event_date: quoteEventDate || null,
        event_location: quoteEventLocation.trim() || null,
        work_start_time: mode !== "freelance" && quoteStartTime ? quoteStartTime : null,
        work_end_time: mode !== "freelance" && quoteEndTime ? quoteEndTime : null,
        notes: quoteNotes.trim() || null,
      });
    }
    setSavingQuote(false);
    setStep("leadFollowUp");
  };

  // Creates a lead from the quote's client details and immediately attaches this quote's amount to
  // it via the same /api/leads/[id]/quote route the leads page itself uses — that route is what
  // actually schedules the 2-day follow-up (scheduleLeadQuoteFollowUp), so this reuses the exact
  // reminder machinery already built for leads instead of inventing a second one just for quotes
  // sent from this calculator.
  const addLeadForFollowUp = async () => {
    setAddingLead(true);
    try {
      const leadRes = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: quoteClientName.trim(), phone: quoteClientPhone.trim() || undefined }),
      });
      const leadData = await leadRes.json();
      if (leadRes.ok && leadData.lead?.id) {
        await fetch(`/api/leads/${leadData.lead.id}/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: total, note: quoteNotes.trim() || undefined }),
        });
      }
    } finally {
      setAddingLead(false);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(46,49,66,0.45)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-[75vh] overflow-y-auto rounded-3xl p-5 pb-6 bg-paper shadow-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "calculator" && (
          <>
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold font-display">בונה הצעות מחיר</span>
                <CompactGuideModal pageKey="quote-builder" />
              </div>
              <button onClick={onClose} className="text-ink-soft text-sm" aria-label="סגירה">
                <IconClose className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex gap-1.5 mb-3">
              {([
                ["event", "אירוע"],
                ["standard", "סטנדרטי"],
                ["freelance", "פרילנס"],
              ] as [Mode, string][]).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="flex-1 rounded-full py-1.5 text-xs font-semibold"
                  style={{ background: mode === m ? "var(--color-ink)" : "var(--color-chip)", color: mode === m ? "var(--color-paper)" : "var(--color-ink-soft)", border: mode === m ? "none" : "1px solid var(--color-line)" }}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "event" && (
              <div className="rounded-lg border border-line bg-white p-2.5 mb-3">
                {priceQuotes.length === 0 ? (
                  <p className="text-xs text-ink-soft">אין עדיין הצעות מחיר שמורות</p>
                ) : (
                  <select
                    value={selectedQuoteId}
                    onChange={(e) => selectQuote(e.target.value)}
                    className="w-full text-xs bg-transparent outline-none"
                  >
                    <option value="">הצעה חדשה (ללא טעינה מהצעה קודמת)</option>
                    {priceQuotes.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.quote_name || q.client_name || "הצעה ללא שם"}: {new Date(q.created_at).toLocaleDateString("he-IL")}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {mode !== "freelance" && templates.length > 0 && (
              <div className="rounded-lg border border-line bg-white p-2.5 mb-3">
                <select
                  value={selectedTemplateId}
                  onChange={(e) => selectTemplate(e.target.value)}
                  className="w-full text-xs bg-transparent outline-none"
                >
                  <option value="">טעינה מתבנית (ללא)</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-1.5 mb-3.5">
              <button
                onClick={() => setTaxStatus("exempt")}
                className="flex-1 rounded-full py-1.5 text-xs font-semibold"
                style={{ background: isExempt ? "var(--color-ink)" : "var(--color-chip)", color: isExempt ? "var(--color-paper)" : "var(--color-ink-soft)", border: isExempt ? "none" : "1px solid var(--color-line)" }}
              >
                עוסק פטור
              </button>
              <button
                onClick={() => setTaxStatus("licensed")}
                className="flex-1 rounded-full py-1.5 text-xs font-semibold"
                style={{ background: !isExempt ? "var(--color-ink)" : "var(--color-chip)", color: !isExempt ? "var(--color-paper)" : "var(--color-ink-soft)", border: !isExempt ? "none" : "1px solid var(--color-line)" }}
              >
                עוסק מורשה
              </button>
            </div>

            {mode === "freelance" && (
              <div className="flex gap-2 mb-3.5">
                <div className="flex-1 rounded-lg border border-line bg-white p-2.5">
                  <div className="text-[10px] text-ink-soft mb-1">שעות</div>
                  <input
                    value={hours || ""}
                    onChange={(e) => setHours(Number(e.target.value) || 0)}
                    type="number"
                    min={1}
                    max={20}
                    step={1}
                    list="calc-hours-options"
                    placeholder="0"
                    className="w-full text-sm font-semibold font-data bg-transparent outline-none"
                  />
                  <datalist id="calc-hours-options">
                    {HOURS_OPTIONS.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </div>
                <div className="flex-1 rounded-lg border border-line bg-white p-2.5">
                  <div className="text-[10px] text-ink-soft mb-1">מחיר שעת צילום</div>
                  <input
                    value={rate || ""}
                    onChange={(e) => setRate(Number(e.target.value) || 0)}
                    type="number"
                    min={0}
                    step={50}
                    list="calc-rate-options"
                    placeholder="0"
                    className="w-full text-sm font-semibold font-data bg-transparent outline-none"
                  />
                  <datalist id="calc-rate-options">
                    {RATE_OPTIONS.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </div>
              </div>
            )}

            {mode !== "freelance" && (
              <>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-ink-soft">ספקים לאירוע זה</span>
                  {quoteVendorRows.length > 0 && (
                    <button
                      onClick={() => (managingSuppliers ? finishManagingSuppliers() : setManagingSuppliers(true))}
                      className="text-[11px] font-semibold text-ink-soft"
                    >
                      {managingSuppliers ? "סיום" : "עריכת ספקים"}
                    </button>
                  )}
                </div>

                {managingSuppliers && quoteVendorRows.length > 0 && (
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                      <input
                        type="checkbox"
                        checked={deleteSelectedIds.size === quoteVendorRows.length && quoteVendorRows.length > 0}
                        onChange={toggleSelectAllForDelete}
                      />
                      בחר הכל
                    </label>
                    <button
                      onClick={deleteSelectedVendorRows}
                      disabled={deleteSelectedIds.size === 0}
                      className="text-[11px] font-semibold text-rose disabled:opacity-40"
                    >
                      מחיקת הנבחרים ({deleteSelectedIds.size})
                    </button>
                  </div>
                )}

                <div className="space-y-1.5 mb-1.5">
                  {quoteVendorRows.length === 0 ? (
                    <p className="text-xs text-ink-soft">אין עדיין ספקים בהצעה זו</p>
                  ) : (
                    quoteVendorRows.map((row) => (
                      <div key={row.id} className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1.5">
                        {managingSuppliers && (
                          <input type="checkbox" checked={deleteSelectedIds.has(row.id)} onChange={() => toggleDeleteSelect(row.id)} className="shrink-0" />
                        )}
                        <select
                          value={row.supplierId}
                          onChange={(e) => selectVendorSupplier(row.id, e.target.value)}
                          className="flex-1 min-w-0 text-xs bg-transparent outline-none"
                        >
                          <option value="" disabled>
                            בחירת ספק
                          </option>
                          {supplierList.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                          <option value="__custom__">טקסט חופשי...</option>
                        </select>
                        {row.supplierId === "__custom__" && (
                          <input
                            value={row.customName}
                            onChange={(e) => updateVendorRow(row.id, { customName: e.target.value })}
                            placeholder="שם הספק"
                            className="flex-1 min-w-0 text-xs bg-transparent outline-none"
                          />
                        )}
                        {/* Editable for every row, preset suppliers included — this is a per-quote price,
                            seeded from the supplier's saved default on selection but freely overridable
                            from here without touching that default (see vendorRowPrice above). */}
                        <input
                          value={row.price || ""}
                          onChange={(e) => updateVendorRow(row.id, { price: Number(e.target.value) || 0 })}
                          type="number"
                          min={0}
                          placeholder="0"
                          className="w-20 shrink-0 text-xs font-data bg-transparent outline-none text-left"
                        />
                        {!managingSuppliers && (
                          <button onClick={() => removeVendorRow(row.id)} className="text-ink-soft text-xs shrink-0" aria-label="הסרת ספק">
                            <IconClose className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
                {!managingSuppliers && (
                  <button
                    onClick={addVendorRow}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold mb-3.5 border-2 border-dashed transition hover:opacity-80"
                    style={{ borderColor: "var(--color-amber-deep)", color: "var(--color-amber-deep)", background: "var(--color-amber-bg)" }}
                  >
                    <span className="text-sm leading-none">+</span> הוספת ספק
                  </button>
                )}
              </>
            )}

            <div className="rounded-lg border border-line bg-white p-2.5 space-y-1">
              {isExempt ? (
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>סה&quot;כ לתשלום</span>
                  <span className="font-data text-amber-deep">{currency(total)}</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-ink-soft">
                    <span>סה&quot;כ לא כולל מע&quot;מ</span>
                    <span className="font-data">{currency(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-ink-soft">
                    <span>מע&quot;מ (18%)</span>
                    <span className="font-data">{currency(vatAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm font-semibold pt-1 border-t border-line">
                    <span>סה&quot;כ כולל מע&quot;מ</span>
                    <span className="font-data text-amber-deep">{currency(total)}</span>
                  </div>
                  {canRoundPrice && !roundingOpen && (
                    <button onClick={openRounding} className="w-full text-[11px] font-semibold text-ink-soft pt-1 text-center">
                      עיגול מחיר
                    </button>
                  )}
                  {canRoundPrice && roundingOpen && (
                    <div className="pt-1.5 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          value={roundingTarget}
                          onChange={(e) => setRoundingTarget(e.target.value)}
                          type="number"
                          min={0}
                          placeholder="מחיר עגול רצוי"
                          className="flex-1 min-w-0 rounded-lg px-2 py-1 text-xs border border-line bg-white font-data"
                        />
                        <button onClick={applyPriceRounding} className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-ink text-white">
                          עדכון
                        </button>
                        <button onClick={cancelRounding} className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold border border-line text-ink-soft">
                          ביטול
                        </button>
                      </div>
                      {roundingError && <p className="text-[11px] text-rose">{roundingError}</p>}
                    </div>
                  )}
                </>
              )}
            </div>

            <button onClick={openQuoteForm} className="w-full mt-3 rounded-lg py-2.5 text-sm font-semibold bg-ink text-white">
              יצירת הצעת מחיר ללקוח
            </button>
          </>
        )}

        {step === "quoteForm" && (
          <>
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-base font-bold font-display">פרטי הלקוח/ה והאירוע</span>
              <div className="flex items-center gap-2">
                <BackButton onClick={() => setStep("calculator")} />
                <button onClick={onClose} className="text-ink-soft text-sm" aria-label="סגירה">
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="space-y-2.5">
              <input
                value={quoteClientName}
                onChange={(e) => setQuoteClientName(e.target.value)}
                placeholder="שם מלא"
                autoComplete="off"
                className="w-full rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white"
              />
              <div className="relative">
                <input
                  value={quoteClientPhone}
                  onChange={(e) => setQuoteClientPhone(e.target.value)}
                  placeholder="050-0000000"
                  dir="ltr"
                  // Safari's own native contact-autofill suggestion (a QuickType bar that fills
                  // this AND the name field from a picked contact) was the actual "mess" reported
                  // on iPhone — autoComplete="off" is what suppresses that, independent of and in
                  // addition to the Android-only Contact Picker button below.
                  autoComplete="off"
                  className={`w-full rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white text-left font-data ${supportsContactPicker ? "pl-9" : ""}`}
                />
                {supportsContactPicker && (
                  <button
                    type="button"
                    onClick={pickContact}
                    aria-label="בחירה מאנשי הקשר"
                    title="בחירה מאנשי הקשר"
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-ink-soft"
                  >
                    <ContactIcon />
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  value={quoteEventType}
                  onChange={(e) => setQuoteEventType(e.target.value)}
                  onFocus={() => setEventTypeFocused(true)}
                  onBlur={() => {
                    rememberEventType(quoteEventType);
                    setTimeout(() => setEventTypeFocused(false), 150);
                  }}
                  placeholder="סוג האירוע (חתונה, חינה, עלייה לתורה...)"
                  className="w-full rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white text-ink"
                />
                {/* Custom suggestion list instead of a native <datalist> — a native datalist
                    popup's colors are entirely browser/OS-controlled and were rendering as
                    unreadable white-on-white for some users, with no CSS able to reach it. */}
                {eventTypeFocused && (filteredEventTypes.length > 0 || customEventTypes.length > 0) && (
                  <div className="absolute z-10 top-full right-0 left-0 mt-1 rounded-lg border border-line bg-white shadow-card max-h-48 overflow-y-auto">
                    {filteredEventTypes.map((name) => {
                      const isCustom = customEventTypes.includes(name);
                      return (
                        <div key={name} className="flex items-center">
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setQuoteEventType(name);
                              setEventTypeFocused(false);
                            }}
                            className="flex-1 min-w-0 text-right px-2.5 py-1.5 text-sm text-ink hover:bg-chip truncate"
                          >
                            {name}
                          </button>
                          {isCustom && (
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => removeCustomEventType(name)}
                              aria-label={`הסרת ${name} מהרשימה`}
                              className="shrink-0 px-2 text-ink-soft text-xs"
                            >
                              <IconClose className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {customEventTypes.length > 0 && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={clearCustomEventTypes}
                        className="w-full text-right px-2.5 py-1.5 text-xs font-semibold text-rose border-t border-line"
                      >
                        ניקוי האפשרויות שהוספתי
                      </button>
                    )}
                  </div>
                )}
              </div>
              {/* Same box recipe (flex-1 min-w-0, same padding/border, same gap-2 row) as the
                  start/end time cells below — matching them exactly is what keeps this row from
                  overlapping or spilling past the form's own width the way two plain px-2.5 py-1.5
                  inputs did. */}
              <div className="flex gap-2">
                <div className="flex-1 min-w-0 rounded-lg border border-line bg-white p-2.5 cursor-pointer">
                  <div className="text-[10px] text-ink-soft mb-1">תאריך האירוע</div>
                  <div className="relative">
                    <input
                      value={quoteEventDate}
                      onChange={(e) => setQuoteEventDate(e.target.value)}
                      onClick={(e) => {
                        // Wrapped in try/catch — a confirmed WebKit bug (showPicker() doesn't work
                        // on iOS, webkit.org bug 261703) makes this throw on some iOS Safari
                        // versions, particularly for type="time". Harmless no-op on affected
                        // devices; the input's own native default tap-to-open doesn't need this.
                        try {
                          (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
                        } catch {}
                      }}
                      type="date"
                      dir="ltr"
                      className={`w-full text-sm font-semibold font-data bg-transparent outline-none cursor-pointer ${quoteEventDate ? "text-transparent" : ""}`}
                    />
                    {/* A native date input's inline (unfocused) display always uses the browser/OS
                        locale format with no override, which was showing YYYY / MM / DD (and, on
                        mobile, the same before its native picker sheet opens) — this sits on top
                        of the real input (kept fully interactive underneath, just with its own
                        text made transparent) instead of replacing it, so the native calendar
                        popup keeps working exactly as before. */}
                    {quoteEventDate && (
                      <div className="pointer-events-none absolute inset-0 flex items-center text-sm font-semibold font-data" dir="ltr">
                        {formatDateDMYFromInput(quoteEventDate)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0 rounded-lg border border-line bg-white p-2.5">
                  <div className="text-[10px] text-ink-soft mb-1">מיקום האירוע</div>
                  <input
                    value={quoteEventLocation}
                    onChange={(e) => setQuoteEventLocation(e.target.value)}
                    placeholder="לדוגמה: אולם וגן אירועים"
                    className="w-full text-sm font-semibold bg-transparent outline-none"
                  />
                </div>
              </div>
              {mode !== "freelance" && (
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0 rounded-lg border border-line bg-white p-2.5 cursor-pointer">
                    <div className="text-[10px] text-ink-soft mb-1">שעת התחלה</div>
                    <input
                      value={quoteStartTime}
                      onChange={(e) => setQuoteStartTime(e.target.value)}
                      onClick={(e) => {
                        // Wrapped in try/catch — a confirmed WebKit bug (showPicker() doesn't work
                        // on iOS, webkit.org bug 261703) makes this throw on some iOS Safari
                        // versions, particularly for type="time". Harmless no-op on affected
                        // devices; the input's own native default tap-to-open doesn't need this.
                        try {
                          (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
                        } catch {}
                      }}
                      type="time"
                      dir="ltr"
                      className="w-full text-sm font-semibold font-data bg-transparent outline-none cursor-pointer"
                    />
                  </div>
                  <div className="flex-1 min-w-0 rounded-lg border border-line bg-white p-2.5 cursor-pointer">
                    <div className="text-[10px] text-ink-soft mb-1">שעת סיום</div>
                    <input
                      value={quoteEndTime}
                      onChange={(e) => setQuoteEndTime(e.target.value)}
                      onClick={(e) => {
                        // Wrapped in try/catch — a confirmed WebKit bug (showPicker() doesn't work
                        // on iOS, webkit.org bug 261703) makes this throw on some iOS Safari
                        // versions, particularly for type="time". Harmless no-op on affected
                        // devices; the input's own native default tap-to-open doesn't need this.
                        try {
                          (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
                        } catch {}
                      }}
                      type="time"
                      dir="ltr"
                      className="w-full text-sm font-semibold font-data bg-transparent outline-none cursor-pointer"
                    />
                  </div>
                </div>
              )}
              <div className="rounded-lg border border-line bg-white p-2.5">
                <div className="text-[10px] text-ink-soft mb-1">הערות (אופציונלי)</div>
                <textarea
                  value={quoteNotes}
                  onChange={(e) => setQuoteNotes(e.target.value)}
                  rows={4}
                  placeholder="הערות חופשיות שיופיעו בהצעת המחיר..."
                  className="w-full text-sm bg-transparent outline-none resize-none"
                />
              </div>
            </div>
            {quoteFormError && <p className="text-xs text-rose mt-2">{quoteFormError}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={goToPreview} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-ink text-white">
                המשך לתצוגה מקדימה
              </button>
              <button onClick={() => setStep("calculator")} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft">
                ביטול
              </button>
            </div>
          </>
        )}

        {step === "preview" && (
          <>
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-base font-bold font-display">תצוגה מקדימה</span>
              <div className="flex items-center gap-2">
                <BackButton onClick={() => setStep("quoteForm")} />
                <button onClick={onClose} className="text-ink-soft text-sm" aria-label="סגירה">
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="rounded-lg border border-line bg-white p-3 mb-3">
              <div className="text-sm font-semibold mb-2">{quoteClientName}</div>
              <div className="space-y-1 text-xs mb-2">
                <div>
                  <span className="text-ink-soft">סוג האירוע: </span>
                  <span>{quoteEventType}</span>
                </div>
                <div>
                  <span className="text-ink-soft">מקום: </span>
                  <span>{quoteEventLocation}</span>
                </div>
                <div>
                  <span className="text-ink-soft">תאריך: </span>
                  <span className="font-data">{formatDateDMY(quoteEventDate)}</span>
                </div>
                <div>
                  <span className="text-ink-soft">שעות: </span>
                  <span className="font-data" dir="ltr">
                    {mode === "freelance" ? `${hours} שעות` : `${quoteStartTime} - ${quoteEndTime}`}
                  </span>
                </div>
                <div>
                  <span className="text-ink-soft">איש קשר: </span>
                  <span className="font-data" dir="ltr">
                    {quoteClientPhone}
                  </span>
                </div>
              </div>
              <div className="space-y-1 border-t border-line pt-2">
                {quoteItems.filter((it) => it.item !== "צילום אירוע").map((it, i) => (
                  <div key={i} className="flex items-center justify-between text-xs gap-2">
                    <span className="truncate flex-1">
                      {it.item}
                      {it.details ? ` (${it.details})` : ""}
                    </span>
                    <span className="font-data font-semibold shrink-0">{currency(it.price)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-white p-2.5 space-y-1 mb-3">
              {isExempt ? (
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>סה&quot;כ לתשלום</span>
                  <span className="font-data text-amber-deep">{currency(total)}</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-ink-soft">
                    <span>סה&quot;כ לא כולל מע&quot;מ</span>
                    <span className="font-data">{currency(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-ink-soft">
                    <span>מע&quot;מ (18%)</span>
                    <span className="font-data">{currency(vatAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm font-semibold pt-1 border-t border-line">
                    <span>סה&quot;כ כולל מע&quot;מ</span>
                    <span className="font-data text-amber-deep">{currency(total)}</span>
                  </div>
                </>
              )}
            </div>
            {sendError && <p className="text-xs text-rose mb-2">{sendError}</p>}
            <div className="flex gap-2">
              <button onClick={sendQuote} disabled={sendingQuote} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60">
                {sendingQuote ? "מכין..." : "שליחה ללקוח/ה"}
              </button>
              <button
                onClick={() => setStep("quoteForm")}
                disabled={sendingQuote}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60"
              >
                ביטול
              </button>
            </div>
          </>
        )}

        {step === "savePrompt" && (
          <>
            <div className="mb-3.5">
              <span className="text-base font-bold font-display">נשלח בהצלחה</span>
            </div>
            <p className="text-sm text-ink-soft mb-3.5">לשמור את ההצעה גם ברשימת הצעות המחיר?</p>
            {savePromptStep === "ask" ? (
              <div className="flex gap-2">
                <button onClick={() => setSavePromptStep("name")} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-ink text-white">
                  כן, לשמור
                </button>
                <button onClick={() => setStep("leadFollowUp")} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft">
                  לא
                </button>
              </div>
            ) : (
              <>
                <input
                  value={saveQuoteName}
                  onChange={(e) => setSaveQuoteName(e.target.value)}
                  placeholder="שם להצעת המחיר"
                  className="w-full rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white mb-3"
                />
                <div className="flex gap-2">
                  <button onClick={confirmSaveQuote} disabled={savingQuote} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60">
                    {savingQuote ? "שומר..." : "שמירה"}
                  </button>
                  <button onClick={() => setStep("leadFollowUp")} disabled={savingQuote} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60">
                    ביטול
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === "leadFollowUp" && (
          <>
            <div className="mb-3.5">
              <span className="text-base font-bold font-display">מעקב אחרי ההצעה</span>
            </div>
            <p className="text-sm text-ink-soft mb-3.5">להוסיף את {quoteClientName || "הלקוח/ה"} לרשימת הלידים כדי לקבל תזכורת מעקב אם לא תחזרו אליה תוך יומיים?</p>
            <div className="flex gap-2">
              <button onClick={addLeadForFollowUp} disabled={addingLead} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60">
                {addingLead ? "מוסיף..." : "כן, להוסיף"}
              </button>
              <button onClick={onClose} disabled={addingLead} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60">
                לא
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ContactIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="8.5" r="3.2" />
      <path d="M5.5 19.5c1.2-3.3 3.8-5 6.5-5s5.3 1.7 6.5 5" />
    </svg>
  );
}
