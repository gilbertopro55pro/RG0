"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateDMYFromInput } from "@/lib/dateInputFormat";
import type { PriceQuoteItem, PriceQuoteRow, PricingSupplier } from "@/lib/types";

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
type Step = "calculator" | "quoteForm" | "preview" | "savePrompt";

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

function currency(n: number): string {
  return `${Math.round(n).toLocaleString("he-IL")} ₪`;
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
  eventTypes,
  initialCustomEventTypes,
  onClose,
}: {
  hourlyRate: number;
  suppliers: PricingSupplier[];
  priceQuotes: PriceQuoteRow[];
  eventTypes: { id: string; name: string }[];
  initialCustomEventTypes: string[];
  onClose: () => void;
}) {
  const supabase = createClient();

  const [step, setStep] = useState<Step>("calculator");
  const [mode, setMode] = useState<Mode>("event");
  const [selectedQuoteId, setSelectedQuoteId] = useState(priceQuotes[0]?.id ?? "");
  // Manual per-calculation toggle, independent of whatever the photographer's own account is set
  // to — always starts on "licensed" (the common case) regardless of the account's real status.
  const [taxStatus, setTaxStatus] = useState<"exempt" | "licensed">("licensed");
  const isExempt = taxStatus === "exempt";
  const [hours, setHours] = useState(0);
  const [rate, setRate] = useState(hourlyRate);

  // A local, editable copy of the saved supplier list — persisted back to the photographer's row
  // only when "סיום ושמירה" is pressed, so the delete/rename/re-price actions below can be batched
  // instead of firing a write per keystroke.
  const [supplierList, setSupplierList] = useState<PricingSupplier[]>(suppliers);
  const [includedIds, setIncludedIds] = useState<Set<string>>(() => new Set(suppliers.map((s) => s.id)));
  const [extraSuppliers, setExtraSuppliers] = useState<PricingSupplier[]>([]);
  const [managingSuppliers, setManagingSuppliers] = useState(false);
  const [deleteSelectedIds, setDeleteSelectedIds] = useState<Set<string>>(new Set());
  const [savingSuppliers, setSavingSuppliers] = useState(false);

  // The "יצירת הצעת מחיר ללקוח" wizard
  const [quoteClientName, setQuoteClientName] = useState("");
  const [quoteClientPhone, setQuoteClientPhone] = useState("");
  const [quoteEventType, setQuoteEventType] = useState("");
  const [quoteEventDate, setQuoteEventDate] = useState("");
  const [quoteEventLocation, setQuoteEventLocation] = useState("");
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

  const selectQuote = (id: string) => {
    setSelectedQuoteId(id);
    const q = priceQuotes.find((pq) => pq.id === id);
    if (!q) return;
    if (q.event_hours != null) setHours(Number(q.event_hours));
    if (q.hourly_rate_used != null) setRate(Number(q.hourly_rate_used));
    // Matches the quote's saved item names back against the current supplier list — a supplier
    // renamed or removed since this quote was built simply won't be checked, which is the safest
    // fallback (no silently-wrong price).
    const itemNames = new Set(q.items.map((it) => it.item));
    setIncludedIds(new Set(supplierList.filter((s) => itemNames.has(s.name)).map((s) => s.id)));
    setExtraSuppliers([]);
  };

  const toggleSupplier = (id: string) => {
    setIncludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addExtraSupplier = () => {
    const s = { id: makeId(), name: "", price: 0 };
    setExtraSuppliers((prev) => [...prev, s]);
    setIncludedIds((prev) => new Set(prev).add(s.id));
  };
  const updateExtraSupplier = (id: string, patch: Partial<PricingSupplier>) => {
    setExtraSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const removeExtraSupplier = (id: string) => {
    setExtraSuppliers((prev) => prev.filter((s) => s.id !== id));
    setIncludedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const updateSupplierField = (id: string, patch: Partial<PricingSupplier>) => {
    setSupplierList((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
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
    setDeleteSelectedIds((prev) => (prev.size === supplierList.length ? new Set() : new Set(supplierList.map((s) => s.id))));
  };
  const deleteSelectedSuppliers = () => {
    setSupplierList((prev) => prev.filter((s) => !deleteSelectedIds.has(s.id)));
    setDeleteSelectedIds(new Set());
  };
  const finishManagingSuppliers = async () => {
    setSavingSuppliers(true);
    const cleaned = supplierList.filter((s) => s.name.trim());
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await supabase.from("photographers").update({ pricing_suppliers: cleaned }).eq("id", user.id);
    setSupplierList(cleaned);
    setIncludedIds((prev) => new Set([...prev].filter((id) => cleaned.some((s) => s.id === id))));
    setDeleteSelectedIds(new Set());
    setManagingSuppliers(false);
    setSavingSuppliers(false);
  };

  const allSuppliers = useMemo(() => [...supplierList, ...extraSuppliers], [supplierList, extraSuppliers]);

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

  const { subtotal, vatAmount, total } = useMemo(() => {
    const shootCost = hours * rate;
    const suppliersCost =
      mode === "freelance" ? 0 : allSuppliers.filter((s) => includedIds.has(s.id)).reduce((sum, s) => sum + (Number(s.price) || 0), 0);
    const sub = shootCost + suppliersCost;
    const vat = isExempt ? 0 : Math.round(sub * VAT_RATE * 100) / 100;
    return { subtotal: sub, vatAmount: vat, total: Math.round((sub + vat) * 100) / 100 };
  }, [hours, rate, mode, allSuppliers, includedIds, isExempt]);

  const shootDetails = mode === "freelance" ? `${hours} שעות` : `${quoteStartTime}–${quoteEndTime}`;

  const quoteItems = useMemo((): PriceQuoteItem[] => {
    const shootItem: PriceQuoteItem = { item: "צילום אירוע", details: shootDetails, price: hours * rate };
    if (mode === "freelance") return [shootItem];
    const supplierItems = allSuppliers
      .filter((s) => includedIds.has(s.id))
      .map((s) => ({ item: s.name, details: "", price: Number(s.price) || 0 }));
    return [shootItem, ...supplierItems];
  }, [allSuppliers, includedIds, hours, rate, mode, shootDetails]);

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
      });
    }
    setSavingQuote(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(46,49,66,0.45)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-3xl p-5 pb-6 bg-paper shadow-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "calculator" && (
          <>
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-base font-bold font-display">בונה הצעות מחיר</span>
              <button onClick={onClose} className="text-ink-soft text-sm" aria-label="סגירה">
                ✕
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
                  style={{ background: mode === m ? "var(--color-ink)" : "#fff", color: mode === m ? "#fff" : "var(--color-ink-soft)", border: mode === m ? "none" : "1px solid var(--color-line)" }}
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
                    {priceQuotes.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.quote_name || q.client_name || "הצעה ללא שם"} — {new Date(q.created_at).toLocaleDateString("he-IL")}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="flex gap-1.5 mb-3.5">
              <button
                onClick={() => setTaxStatus("exempt")}
                className="flex-1 rounded-full py-1.5 text-xs font-semibold"
                style={{ background: isExempt ? "var(--color-ink)" : "#fff", color: isExempt ? "#fff" : "var(--color-ink-soft)", border: isExempt ? "none" : "1px solid var(--color-line)" }}
              >
                עוסק פטור
              </button>
              <button
                onClick={() => setTaxStatus("licensed")}
                className="flex-1 rounded-full py-1.5 text-xs font-semibold"
                style={{ background: !isExempt ? "var(--color-ink)" : "#fff", color: !isExempt ? "#fff" : "var(--color-ink-soft)", border: !isExempt ? "none" : "1px solid var(--color-line)" }}
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
                  <button
                    onClick={() => (managingSuppliers ? finishManagingSuppliers() : setManagingSuppliers(true))}
                    disabled={savingSuppliers}
                    className="text-[11px] font-semibold text-ink-soft disabled:opacity-60"
                  >
                    {managingSuppliers ? (savingSuppliers ? "שומר..." : "סיום ושמירה") : "עריכת ספקים"}
                  </button>
                </div>

                {managingSuppliers && supplierList.length > 0 && (
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                      <input
                        type="checkbox"
                        checked={deleteSelectedIds.size === supplierList.length && supplierList.length > 0}
                        onChange={toggleSelectAllForDelete}
                      />
                      בחר הכל
                    </label>
                    <button
                      onClick={deleteSelectedSuppliers}
                      disabled={deleteSelectedIds.size === 0}
                      className="text-[11px] font-semibold text-rose disabled:opacity-40"
                    >
                      מחיקת הנבחרים ({deleteSelectedIds.size})
                    </button>
                  </div>
                )}

                <div className="space-y-1.5 mb-1.5">
                  {supplierList.map((s) =>
                    managingSuppliers ? (
                      <div key={s.id} className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1.5">
                        <input type="checkbox" checked={deleteSelectedIds.has(s.id)} onChange={() => toggleDeleteSelect(s.id)} className="shrink-0" />
                        <input
                          value={s.name}
                          onChange={(e) => updateSupplierField(s.id, { name: e.target.value })}
                          placeholder="שם ספק"
                          className="flex-1 min-w-0 text-xs bg-transparent outline-none"
                        />
                        <input
                          value={s.price || ""}
                          onChange={(e) => updateSupplierField(s.id, { price: Number(e.target.value) || 0 })}
                          type="number"
                          min={0}
                          placeholder="0"
                          className="w-16 text-xs font-data bg-transparent outline-none text-left"
                        />
                      </div>
                    ) : (
                      <label key={s.id} className="flex items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-1.5 cursor-pointer">
                        <input type="checkbox" checked={includedIds.has(s.id)} onChange={() => toggleSupplier(s.id)} className="shrink-0" />
                        <span className="flex-1 text-xs truncate">{s.name}</span>
                        <span className="text-xs font-data font-semibold">{currency(s.price)}</span>
                      </label>
                    )
                  )}
                  {!managingSuppliers &&
                    extraSuppliers.map((s) => (
                      <div key={s.id} className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1.5">
                        <input type="checkbox" checked={includedIds.has(s.id)} onChange={() => toggleSupplier(s.id)} className="shrink-0" />
                        <input
                          value={s.name}
                          onChange={(e) => updateExtraSupplier(s.id, { name: e.target.value })}
                          placeholder="שם ספק"
                          className="flex-1 min-w-0 text-xs bg-transparent outline-none"
                        />
                        <input
                          value={s.price || ""}
                          onChange={(e) => updateExtraSupplier(s.id, { price: Number(e.target.value) || 0 })}
                          type="number"
                          min={0}
                          placeholder="0"
                          className="w-16 text-xs font-data bg-transparent outline-none"
                        />
                        <button onClick={() => removeExtraSupplier(s.id)} className="text-ink-soft text-xs" aria-label="הסרה">
                          ✕
                        </button>
                      </div>
                    ))}
                </div>
                {!managingSuppliers && (
                  <button onClick={addExtraSupplier} className="text-[11px] text-ink-soft font-semibold mb-3.5">
                    + הוספת ספק מותאם אישית
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
              <button onClick={onClose} className="text-ink-soft text-sm" aria-label="סגירה">
                ✕
              </button>
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
                              ✕
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
                      onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
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
                      onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
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
                      onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                      type="time"
                      dir="ltr"
                      className="w-full text-sm font-semibold font-data bg-transparent outline-none cursor-pointer"
                    />
                  </div>
                </div>
              )}
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
              <button onClick={onClose} className="text-ink-soft text-sm" aria-label="סגירה">
                ✕
              </button>
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
              <span className="text-base font-bold font-display">נשלח בהצלחה ✓</span>
            </div>
            <p className="text-sm text-ink-soft mb-3.5">לשמור את ההצעה גם ברשימת הצעות המחיר?</p>
            {savePromptStep === "ask" ? (
              <div className="flex gap-2">
                <button onClick={() => setSavePromptStep("name")} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-ink text-white">
                  כן, לשמור
                </button>
                <button onClick={onClose} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft">
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
                  <button onClick={onClose} disabled={savingQuote} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60">
                    ביטול
                  </button>
                </div>
              </>
            )}
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
