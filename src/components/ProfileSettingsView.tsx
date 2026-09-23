"use client";

import { useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Photographer } from "@/lib/types";
import { ADMIN_EMAIL } from "@/lib/admin";
import { GOOGLE_EVENT_COLORS, googleColorHex } from "@/lib/googleColors";
import { setHapticsEnabled, subscribeHaptics, getHapticsSnapshot, getHapticsServerSnapshot } from "@/lib/haptics";
import type { AppleCalendarOption } from "@/lib/appleCalendar";
import AppleCalendarGuideModal from "@/components/AppleCalendarGuideModal";
import { IconClose } from "@/components/icons/AlbumIcons";
import CompactGuideModal from "@/components/CompactGuideModal";
import { IndeterminateProgressCard } from "@/components/IndeterminateProgressCard";
import ScanCandidateCard, { type ScanCandidate, type ScanCandidateTextField } from "@/components/ScanCandidateCard";
import { PACKAGE_LABELS, type PackageType } from "@/lib/stages";
import { stripPhoneFormatting } from "@/lib/phone";

const SCAN_MONTH_OPTIONS: { months: number; label: string }[] = [
  { months: 1, label: "חודש" },
  { months: 3, label: "3 חודשים" },
  { months: 6, label: "חצי שנה" },
  { months: 12, label: "שנה" },
];

export default function ProfileSettingsView({
  photographer,
  googleConnectedNotice,
  googleErrorNotice,
}: {
  photographer: Photographer;
  googleConnectedNotice: boolean;
  googleErrorNotice: boolean;
}) {
  const supabase = createClient();
  const [name, setName] = useState(photographer.name);
  const [phone, setPhone] = useState(photographer.phone);
  const [signature, setSignature] = useState(photographer.whatsapp_signature ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connected, setConnected] = useState(photographer.google_calendar_connected);
  const [disconnecting, setDisconnecting] = useState(false);
  const [colorId, setColorId] = useState(photographer.google_calendar_color_id);
  const [savingColor, setSavingColor] = useState<string | null>(null);
  const [importColorId, setImportColorId] = useState(photographer.google_calendar_import_color_id);
  const [savingImportColor, setSavingImportColor] = useState<string | null>(null);
  const isAdmin = photographer.email === ADMIN_EMAIL;
  const [appleConnected, setAppleConnected] = useState(photographer.apple_calendar_connected);
  const [appleDisplayName, setAppleDisplayName] = useState(photographer.apple_calendar_display_name);
  const [appleEmail, setAppleEmail] = useState("");
  const [applePassword, setApplePassword] = useState("");
  const [appleCalendars, setAppleCalendars] = useState<AppleCalendarOption[] | null>(null);
  const [appleDiscovering, setAppleDiscovering] = useState(false);
  const [appleSelecting, setAppleSelecting] = useState(false);
  const [appleDisconnecting, setAppleDisconnecting] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);
  const [showAppleGuide, setShowAppleGuide] = useState(false);
  const [leadFollowUpEnabled, setLeadFollowUpEnabled] = useState(photographer.lead_follow_up_enabled);
  const [savingLeadFollowUp, setSavingLeadFollowUp] = useState(false);
  const [invoiceProvider, setInvoiceProvider] = useState(photographer.invoice_provider);
  const [finbotConnected, setFinbotConnected] = useState(!!photographer.finbot_api_key);
  const [finbotApiKey, setFinbotApiKey] = useState("");
  const [greenInvoiceConnected, setGreenInvoiceConnected] = useState(
    !!(photographer.green_invoice_api_id && photographer.green_invoice_api_secret)
  );
  const [greenInvoiceApiId, setGreenInvoiceApiId] = useState("");
  const [greenInvoiceApiSecret, setGreenInvoiceApiSecret] = useState("");
  const [taxStatus, setTaxStatus] = useState(photographer.business_tax_status);
  const [savingInvoicing, setSavingInvoicing] = useState(false);
  const [disconnectingFinbot, setDisconnectingFinbot] = useState(false);
  const [disconnectingGreenInvoice, setDisconnectingGreenInvoice] = useState(false);
  const invoiceProviderConnected = invoiceProvider === "green_invoice" ? greenInvoiceConnected : finbotConnected;
  const hapticsOn = useSyncExternalStore(subscribeHaptics, getHapticsSnapshot, getHapticsServerSnapshot);

  const toggleHaptics = () => {
    setHapticsEnabled(!hapticsOn);
  };

  const saveProfile = async () => {
    setSaving(true);
    // A phone pasted from Contacts/Messages can carry invisible bidi-formatting marks that later
    // broke a Finbot API call (see src/lib/phone.ts) — stripped here so a re-save also cleans up
    // an already-corrupted value, not just new ones.
    const cleanPhone = stripPhoneFormatting(phone);
    await supabase
      .from("photographers")
      .update({ name, phone: cleanPhone, whatsapp_signature: signature || null })
      .eq("id", photographer.id);
    setPhone(cleanPhone);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const disconnectGoogle = async () => {
    setDisconnecting(true);
    await supabase
      .from("photographers")
      .update({
        google_calendar_connected: false,
        google_access_token: null,
        google_refresh_token: null,
        google_token_expiry: null,
      })
      .eq("id", photographer.id);
    setConnected(false);
    setDisconnecting(false);
  };

  const discoverAppleCalendars = async () => {
    setAppleDiscovering(true);
    setAppleError(null);
    const res = await fetch("/api/apple-calendar/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: appleEmail, appPassword: applePassword }),
    });
    const data = await res.json();
    setAppleDiscovering(false);
    if (!res.ok) {
      setAppleError(data.error ?? "החיבור ל-iCloud נכשל");
      return;
    }
    setAppleCalendars(data.calendars);
  };

  const selectAppleCalendar = async (calendar: AppleCalendarOption) => {
    setAppleSelecting(true);
    setAppleError(null);
    const res = await fetch("/api/apple-calendar/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarUrl: calendar.url, displayName: calendar.displayName }),
    });
    const data = await res.json();
    setAppleSelecting(false);
    if (!res.ok) {
      setAppleError(data.error ?? "החיבור נכשל");
      return;
    }
    setAppleConnected(true);
    setAppleDisplayName(calendar.displayName);
    setAppleCalendars(null);
  };

  const disconnectApple = async () => {
    setAppleDisconnecting(true);
    await supabase
      .from("photographers")
      .update({
        apple_calendar_connected: false,
        apple_calendar_email: null,
        apple_calendar_app_password: null,
        apple_calendar_url: null,
        apple_calendar_display_name: null,
      })
      .eq("id", photographer.id);
    setAppleConnected(false);
    setAppleDisplayName(null);
    setAppleEmail("");
    setApplePassword("");
    setAppleDisconnecting(false);
  };

  const chooseInvoiceProvider = async (provider: typeof invoiceProvider) => {
    setInvoiceProvider(provider);
    await supabase.from("photographers").update({ invoice_provider: provider }).eq("id", photographer.id);
  };

  const connectFinbot = async () => {
    if (!finbotApiKey.trim()) return;
    setSavingInvoicing(true);
    await supabase
      .from("photographers")
      .update({ finbot_api_key: finbotApiKey.trim(), business_tax_status: taxStatus, invoice_provider: "finbot" })
      .eq("id", photographer.id);
    setFinbotConnected(true);
    setFinbotApiKey("");
    setSavingInvoicing(false);
  };

  const disconnectFinbot = async () => {
    setDisconnectingFinbot(true);
    await supabase.from("photographers").update({ finbot_api_key: null }).eq("id", photographer.id);
    setFinbotConnected(false);
    setDisconnectingFinbot(false);
  };

  const connectGreenInvoice = async () => {
    if (!greenInvoiceApiId.trim() || !greenInvoiceApiSecret.trim()) return;
    setSavingInvoicing(true);
    await supabase
      .from("photographers")
      .update({
        green_invoice_api_id: greenInvoiceApiId.trim(),
        green_invoice_api_secret: greenInvoiceApiSecret.trim(),
        business_tax_status: taxStatus,
        invoice_provider: "green_invoice",
      })
      .eq("id", photographer.id);
    setGreenInvoiceConnected(true);
    setGreenInvoiceApiId("");
    setGreenInvoiceApiSecret("");
    setSavingInvoicing(false);
  };

  const disconnectGreenInvoice = async () => {
    setDisconnectingGreenInvoice(true);
    await supabase
      .from("photographers")
      .update({ green_invoice_api_id: null, green_invoice_api_secret: null })
      .eq("id", photographer.id);
    setGreenInvoiceConnected(false);
    setDisconnectingGreenInvoice(false);
  };

  // Always persists, regardless of invoiceProviderConnected — a real, confirmed bug until this
  // fix: the DB write used to be skipped entirely for anyone with no invoice provider connected
  // (this button only updated local state in that case), so the toggle visually looked selected
  // but silently reverted to whatever business_tax_status already was on the very next page load.
  // That mattered less back when this value only affected which invoice-provider document type
  // got issued — now it's also EventPricingCalculator's own default tax status, a standalone
  // business fact that has nothing to do with whether an invoice provider is connected at all.
  const saveTaxStatus = async (status: "exempt" | "licensed") => {
    setTaxStatus(status);
    setSavingInvoicing(true);
    await supabase.from("photographers").update({ business_tax_status: status }).eq("id", photographer.id);
    setSavingInvoicing(false);
  };

  const toggleLeadFollowUp = async () => {
    const next = !leadFollowUpEnabled;
    setSavingLeadFollowUp(true);
    await supabase.from("photographers").update({ lead_follow_up_enabled: next }).eq("id", photographer.id);
    setLeadFollowUpEnabled(next);
    setSavingLeadFollowUp(false);
  };

  const chooseColor = async (id: string) => {
    setSavingColor(id);
    await supabase.from("photographers").update({ google_calendar_color_id: id }).eq("id", photographer.id);
    setColorId(id);
    setSavingColor(null);
  };

  const chooseImportColor = async (id: string) => {
    setSavingImportColor(id);
    await supabase.from("photographers").update({ google_calendar_import_color_id: id }).eq("id", photographer.id);
    setImportColorId(id);
    setSavingImportColor(null);
  };

  // Admin-only for now — see the "עדכון אדמין" staged-rollout process. Four phases: pick how far
  // ahead to scan (a small blurred-backdrop window), a full-screen indeterminate spinner while that
  // one fetch is in flight (same visual language as the upload/export screens — nothing to report a
  // real percentage for here, it's a single request), select which of the results to add and
  // confirm, then a second indeterminate spinner while they're created — no per-event review form;
  // each created event is flagged needs_review so it's easy to find and complete on the events list.
  const [scanOpen, setScanOpen] = useState(false);
  const [scanStep, setScanStep] = useState<"pickMonths" | "results" | "confirm" | "done">("pickMonths");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanCandidates, setScanCandidates] = useState<ScanCandidate[] | null>(null);
  const [selectedCalendarEventIds, setSelectedCalendarEventIds] = useState<Set<string>>(new Set());
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ created: number; failed: { summary: string; error: string }[] } | null>(null);
  // For the results screen's package <select> — fetched once per sheet-open rather than kept in
  // sync live, since these rarely change mid-session and the sheet is short-lived.
  const [scanCustomPackages, setScanCustomPackages] = useState<{ id: string; name: string }[]>([]);

  const openScan = () => {
    setScanOpen(true);
    setScanStep("pickMonths");
    setScanError(null);
    setScanCandidates(null);
    setSelectedCalendarEventIds(new Set());
    setBulkResult(null);
    supabase
      .from("custom_packages")
      .select("id, name")
      .order("sort_order", { ascending: true })
      .then(({ data }) => setScanCustomPackages(data ?? []));
  };

  const runScan = async (months: number) => {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch(`/api/calendar/scan-import?months=${months}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "הסריקה נכשלה");
      const candidates: ScanCandidate[] = data.candidates ?? [];
      setScanCandidates(candidates);
      setSelectedCalendarEventIds(new Set(candidates.map((c) => c.calendarEventId)));
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "הסריקה נכשלה");
    } finally {
      setScanStep("results");
      setScanning(false);
    }
  };

  const toggleCandidate = (id: string) => {
    setSelectedCalendarEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!scanCandidates) return;
    setSelectedCalendarEventIds((prev) =>
      prev.size === scanCandidates.length ? new Set() : new Set(scanCandidates.map((c) => c.calendarEventId))
    );
  };

  // Lets the photographer correct the auto-parsed (often missing/wrong) deposit/balance before
  // any event is actually created — the values edited here are exactly what gets sent to the
  // create endpoint in confirmBulkAdd below, no separate "apply edits" step.
  const updateCandidateAmount = (id: string, field: "deposit" | "balance", raw: string) => {
    setScanCandidates((prev) =>
      prev ? prev.map((c) => (c.calendarEventId === id ? { ...c, [field]: raw === "" ? null : Number(raw) } : c)) : prev
    );
  };

  // Same idea for the text/time cells (location, start/end time, arrival time) — Google Calendar's
  // own data is often missing or wrong for these, so they're editable right here before anything
  // is actually created, and whatever's typed under each cell's own name is exactly what that field
  // gets sent to the create endpoint (see confirmBulkAdd, which just forwards selectedCandidates
  // as-is).
  const updateCandidateField = (id: string, field: ScanCandidateTextField, value: string) => {
    setScanCandidates((prev) => (prev ? prev.map((c) => (c.calendarEventId === id ? { ...c, [field]: value } : c)) : prev));
  };

  // Only ever shown/toggleable on a candidate flagged hasScheduleCollision — see the "same date +
  // time as something else already on the books" check on the API route.
  const toggleCandidateFreelance = (id: string) => {
    setScanCandidates((prev) =>
      prev ? prev.map((c) => (c.calendarEventId === id ? { ...c, isFreelance: !c.isFreelance } : c)) : prev
    );
  };

  const scanPackageLabel = (pkg: string) =>
    pkg.startsWith("custom:")
      ? (scanCustomPackages.find((cp) => cp.id === pkg.slice(7))?.name ?? "חבילה מותאמת אישית")
      : PACKAGE_LABELS[pkg as PackageType];

  const selectedCandidates = (scanCandidates ?? []).filter((c) => selectedCalendarEventIds.has(c.calendarEventId));

  const confirmBulkAdd = async () => {
    setBulkCreating(true);
    try {
      const res = await fetch("/api/calendar/scan-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: selectedCandidates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ההוספה נכשלה");
      setBulkResult({ created: data.created ?? 0, failed: data.failed ?? [] });
    } catch (e) {
      setBulkResult({ created: 0, failed: selectedCandidates.map((c) => ({ summary: c.summary || "אירוע ללא כותרת", error: e instanceof Error ? e.message : "ההוספה נכשלה" })) });
    } finally {
      setBulkCreating(false);
      setScanStep("done");
    }
  };

  return (
    <div>
      {googleConnectedNotice && (
        <div className="rounded-xl px-3.5 py-2.5 mb-4 text-xs bg-sage-bg text-sage">
          יומן Google חובר בהצלחה
        </div>
      )}
      {googleErrorNotice && (
        <div className="rounded-xl px-3.5 py-2.5 mb-4 text-xs bg-white border border-rose text-rose">
          החיבור ליומן Google נכשל, נסה/י שוב
        </div>
      )}

      <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
        <div className="text-sm font-semibold tracking-wide mb-3.5">פרופיל הצלם</div>
        <div className="space-y-3">
          <div>
            <label className="text-xs block mb-1 text-ink-soft">שם הצלם</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
            />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">
              מספר הטלפון שלך (ממנו יישלחו העדכונים ללקוחות)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white font-data"
            />
          </div>
          <div>
            <label className="text-xs block mb-1 text-ink-soft">
              חתימה אישית (מופיעה בסוף חוזים, הצעות מחיר, ובעתיד גם בהודעות וואטסאפ)
            </label>
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="לדוגמה: בברכה, רועי גלברט, סטודיו רועי גלברט"
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
            />
          </div>
          <button
            onClick={saveProfile}
            disabled={saving}
            className="w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60"
          >
            {saving ? "שומר..." : saved ? "נשמר ✓" : "שמירה"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
        <div className="flex items-center gap-2 mb-3.5">
          <span className="text-sm font-semibold tracking-wide">יומן Google</span>
          {isAdmin && <CompactGuideModal pageKey="calendar-scan" />}
        </div>
        {connected ? (
          <div className="space-y-3">
            <div className="rounded-xl px-3.5 py-2.5 text-sm bg-sage-bg text-sage font-medium">
              היומן מחובר ✓
            </div>

            <div>
              <label className="text-xs mb-1.5 block text-ink-soft">צבע האירועים ביומן</label>
              <div className="flex items-center gap-2">
                <span
                  className="h-8 w-8 rounded-full shrink-0 border border-line"
                  style={{ background: colorId ? (googleColorHex(colorId) ?? "transparent") : "transparent" }}
                />
                <select
                  value={colorId ?? ""}
                  onChange={(e) => chooseColor(e.target.value)}
                  disabled={savingColor !== null}
                  className="flex-1 min-w-0 rounded-lg px-2.5 py-2 text-sm border border-line bg-white disabled:opacity-60"
                >
                  <option value="" disabled>
                    בחירת צבע
                  </option>
                  {GOOGLE_EVENT_COLORS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isAdmin && (
              <div>
                <label className="text-xs mb-1.5 block text-ink-soft">צבע לזיהוי אירועים לייבוא (סריקת יומן)</label>
                <div className="flex items-center gap-2">
                  <span
                    className="h-8 w-8 rounded-full shrink-0 border border-line"
                    style={{ background: importColorId ? (googleColorHex(importColorId) ?? "transparent") : "transparent" }}
                  />
                  <select
                    value={importColorId ?? ""}
                    onChange={(e) => chooseImportColor(e.target.value)}
                    disabled={savingImportColor !== null}
                    className="flex-1 min-w-0 rounded-lg px-2.5 py-2 text-sm border border-line bg-white disabled:opacity-60"
                  >
                    <option value="" disabled>
                      בחירת צבע
                    </option>
                    {GOOGLE_EVENT_COLORS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] mt-1.5 text-ink-soft">
                  צבעו כך ביומן אירועי לקוחות חדשים שעדיין לא הוזנו למערכת, סריקת היומן תאתר אותם ותציע לפתוח להם כרטיס אירוע.
                </p>
                <button
                  onClick={openScan}
                  disabled={!importColorId}
                  className="w-full mt-2.5 rounded-lg py-2.5 text-sm font-semibold bg-amber-deep text-white disabled:opacity-40"
                >
                  סריקת יומן לאירועים חדשים
                </button>
              </div>
            )}

            <button
              onClick={disconnectGoogle}
              disabled={disconnecting}
              className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-rose disabled:opacity-60"
            >
              {disconnecting ? "מתנתק..." : "ניתוק היומן"}
            </button>
          </div>
        ) : (
          <a
            href="/api/google/connect"
            className="w-full flex items-center justify-center rounded-lg py-2.5 text-sm font-semibold bg-amber-deep text-white"
          >
            התחברות ליומן Google
          </a>
        )}
      </div>

      {scanOpen && scanning && <IndeterminateProgressCard label="סורק את היומן..." />}
      {scanOpen && bulkCreating && <IndeterminateProgressCard label="מוסיף אירועים..." />}

      {scanOpen && !scanning && !bulkCreating && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          style={{ background: "rgba(46,49,66,0.45)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
          onClick={() => setScanOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="text-lg font-bold font-display">
                {scanStep === "pickMonths"
                  ? "סריקת יומן לאירועים חדשים"
                  : scanStep === "results"
                    ? "אירועים חדשים ביומן"
                    : scanStep === "confirm"
                      ? "אישור הוספה"
                      : "הוספת אירועים"}
              </h2>
              <button onClick={() => setScanOpen(false)} className="text-ink-soft text-sm" aria-label="סגירה">
                <IconClose className="h-3.5 w-3.5" />
              </button>
            </div>

            {scanStep === "pickMonths" && (
              <div className="space-y-2">
                <p className="text-xs text-ink-soft mb-1">כמה קדימה בזמן לסרוק?</p>
                {SCAN_MONTH_OPTIONS.map((o) => (
                  <button
                    key={o.months}
                    onClick={() => runScan(o.months)}
                    className="w-full text-right rounded-xl p-3 bg-chip text-sm font-semibold"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}

            {scanStep === "results" &&
              (scanError ? (
                <p className="text-sm text-rose">{scanError}</p>
              ) : scanCandidates && scanCandidates.length === 0 ? (
                <p className="text-sm text-ink-soft">לא נמצאו אירועים חדשים בצבע שהוגדר.</p>
              ) : (
                <div>
                  <label className="flex items-center gap-1.5 text-xs text-ink-soft mb-2.5">
                    <input
                      type="checkbox"
                      checked={!!scanCandidates && selectedCalendarEventIds.size === scanCandidates.length}
                      onChange={toggleSelectAll}
                    />
                    בחירת הכל ({scanCandidates?.length ?? 0})
                  </label>
                  <div className="space-y-2 mb-3.5">
                    {scanCandidates?.map((c) => (
                      <ScanCandidateCard
                        key={c.calendarEventId}
                        candidate={c}
                        selected={selectedCalendarEventIds.has(c.calendarEventId)}
                        onToggle={() => toggleCandidate(c.calendarEventId)}
                        onUpdateField={(field, value) => updateCandidateField(c.calendarEventId, field, value)}
                        onUpdateAmount={(field, value) => updateCandidateAmount(c.calendarEventId, field, value)}
                        onToggleFreelance={() => toggleCandidateFreelance(c.calendarEventId)}
                        customPackages={scanCustomPackages}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => setScanStep("confirm")}
                    disabled={selectedCalendarEventIds.size === 0}
                    className="w-full rounded-lg py-2.5 text-sm font-semibold bg-amber-deep text-white disabled:opacity-40"
                  >
                    המשך עם {selectedCalendarEventIds.size} אירועים נבחרים
                  </button>
                </div>
              ))}

            {scanStep === "confirm" && (
              <div>
                <p className="text-sm mb-3">
                  להוסיף {selectedCandidates.length} אירועים לדף האירועים? כל אירוע ייפתח ישירות, בלי שאלות נוספות. אפשר להשלים
                  ולתקן פרטים בכל אירוע לאחר מכן.
                </p>
                <div className="space-y-1.5 mb-3.5 max-h-48 overflow-y-auto">
                  {selectedCandidates.map((c) => (
                    <div key={c.calendarEventId} className="text-xs rounded-lg px-2.5 py-1.5 bg-chip">
                      <span className="font-semibold">{c.summary || "אירוע ללא כותרת"}</span>
                      <span className="text-ink-soft font-data"> · {new Date(c.eventDate).toLocaleDateString("he-IL")}</span>
                      <span className="text-ink-soft"> · {scanPackageLabel(c.pkg)}</span>
                      {c.eventStartTime && (
                        <span className="text-ink-soft font-data">
                          {" · "}
                          {c.eventStartTime}
                          {c.eventEndTime ? `-${c.eventEndTime}` : ""}
                        </span>
                      )}
                      {c.location && <span className="text-ink-soft"> · {c.location}</span>}
                      {c.clientPhone && <span className="text-ink-soft font-data"> · {c.clientPhone}</span>}
                      {(c.deposit || c.balance) && (
                        <span className="text-ink-soft font-data">
                          {" · "}
                          {c.deposit ? `מקדמה ₪${c.deposit}` : ""}
                          {c.deposit && c.balance ? " / " : ""}
                          {c.balance ? `יתרה ₪${c.balance}` : ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={confirmBulkAdd} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-amber-deep text-white">
                    אישור, הוספה
                  </button>
                  <button
                    onClick={() => setScanStep("results")}
                    className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft"
                  >
                    חזרה
                  </button>
                </div>
              </div>
            )}

            {scanStep === "done" && bulkResult && (
              <div>
                {bulkResult.created > 0 && (
                  <p className="text-sm text-sage font-semibold mb-2">נוספו {bulkResult.created} אירועים לדף האירועים</p>
                )}
                {bulkResult.failed.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm text-rose font-semibold mb-1.5">{bulkResult.failed.length} אירועים לא נוספו:</p>
                    <div className="space-y-1">
                      {bulkResult.failed.map((f, i) => (
                        <div key={i} className="text-xs rounded-lg px-2.5 py-1.5 bg-chip">
                          <span className="font-semibold">{f.summary}</span>
                          <span className="text-ink-soft"> — {f.error}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button onClick={() => setScanOpen(false)} className="w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white">
                  סגירה
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-2xl p-4 mt-5 bg-card border border-line shadow-card">
        <div className="text-sm font-semibold tracking-wide mb-3.5">יומן Apple (iCloud)</div>
        {appleConnected ? (
          <div className="space-y-3">
            <div className="rounded-xl px-3.5 py-2.5 text-sm bg-sage-bg text-sage font-medium">
              מחובר ליומן &quot;{appleDisplayName}&quot; ✓
            </div>
            <button
              onClick={disconnectApple}
              disabled={appleDisconnecting}
              className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-rose disabled:opacity-60"
            >
              {appleDisconnecting ? "מתנתק..." : "ניתוק היומן"}
            </button>
          </div>
        ) : appleCalendars ? (
          <div className="space-y-2">
            <p className="text-xs text-ink-soft mb-1">באיזה יומן ב-iCloud לשמור את האירועים?</p>
            {appleCalendars.map((cal) => (
              <button
                key={cal.url}
                onClick={() => selectAppleCalendar(cal)}
                disabled={appleSelecting}
                className="w-full text-right rounded-lg px-3.5 py-2.5 text-sm border border-line bg-white disabled:opacity-60"
              >
                {cal.displayName}
              </button>
            ))}
            {appleError && <p className="text-xs text-rose">{appleError}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg px-3 py-2.5 bg-white border border-line">
              <p className="text-xs text-ink-soft mb-2">
                נדרשת סיסמה ייעודית לאפליקציה (App-Specific Password) מ-Apple. לא הסיסמה הרגילה של Apple ID.
                לוקח כדקה ליצור, ויש מדריך מלא עם כל שלב בנפרד.
              </p>
              <button
                type="button"
                onClick={() => setShowAppleGuide(true)}
                className="inline-block text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-bg text-amber-deep"
              >
                מדריך מלא לחיבור יומן Apple ←
              </button>
            </div>
            <div>
              <label className="text-xs block mb-1 text-ink-soft">Apple ID (כתובת מייל)</label>
              <input
                type="email"
                value={appleEmail}
                onChange={(e) => setAppleEmail(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
              />
            </div>
            <div>
              <label className="text-xs block mb-1 text-ink-soft">App-Specific Password</label>
              <input
                type="password"
                value={applePassword}
                onChange={(e) => setApplePassword(e.target.value)}
                placeholder="xxxx-xxxx-xxxx-xxxx"
                className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white font-data"
              />
            </div>
            {appleError && <p className="text-xs text-rose">{appleError}</p>}
            <button
              onClick={discoverAppleCalendars}
              disabled={appleDiscovering || !appleEmail || !applePassword}
              className="w-full rounded-lg py-2.5 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60"
            >
              {appleDiscovering ? "מתחבר..." : "גילוי יומנים"}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl p-4 mt-5 bg-card border border-line shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold tracking-wide">רטט במגע (בטלפון בלבד)</div>
            <div className="text-xs text-ink-soft mt-0.5">רטט קצר בכל לחיצה על כפתור</div>
          </div>
          <button
            onClick={toggleHaptics}
            role="switch"
            aria-checked={hapticsOn}
            aria-label="הפעלת רטט במגע"
            className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5"
            style={{
              background: hapticsOn ? "var(--color-amber-deep)" : "var(--color-line)",
              justifyContent: hapticsOn ? "flex-start" : "flex-end",
            }}
          >
            <span className="h-5 w-5 rounded-full shadow" style={{ background: "#fff" }} />
          </button>
        </div>
      </div>

      <div className="rounded-2xl p-4 mt-5 bg-card border border-line shadow-card">
        <div className="text-sm font-semibold tracking-wide mb-1">חשבוניות ללקוחות</div>
        <p className="text-xs text-ink-soft mb-3.5">
          כדי להפיק ללקוחות שלך קבלות/חשבוניות אמיתיות (לא של המערכת אלא של העסק שלך), יש לבחור
          ספק ולחבר את החשבון שלך אצלו. המסמך יוצא תחת הפרטים העסקיים שרשומים באותו חשבון.
        </p>

        <div className="mb-3.5">
          <label className="text-xs block mb-1 text-ink-soft">ספק חשבוניות</label>
          <select
            value={invoiceProvider}
            onChange={(e) => chooseInvoiceProvider(e.target.value as typeof invoiceProvider)}
            className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
          >
            <option value="finbot">Finbot</option>
            <option value="green_invoice">חשבונית ירוקה (מורנינג)</option>
          </select>
        </div>

        <div>
          <p className="text-xs mb-2 text-ink-soft">
            סטטוס עוסק: קובע אם מונפקת קבלה או חשבונית מס (כשמחוברים לספק חשבוניות), וגם ברירת המחדל בבונה הצעות המחיר
          </p>
          <div className="flex gap-1.5 mb-3.5">
            <button
              onClick={() => saveTaxStatus("exempt")}
              disabled={savingInvoicing}
              className="flex-1 rounded-full py-2 text-xs font-semibold disabled:opacity-60"
              style={{
                background: taxStatus === "exempt" ? "var(--color-amber-deep)" : "var(--color-chip)",
                color: taxStatus === "exempt" ? "#fff" : "var(--color-ink-soft)",
              }}
            >
              עוסק פטור
            </button>
            <button
              onClick={() => saveTaxStatus("licensed")}
              disabled={savingInvoicing}
              className="flex-1 rounded-full py-2 text-xs font-semibold disabled:opacity-60"
              style={{
                background: taxStatus === "licensed" ? "var(--color-amber-deep)" : "var(--color-chip)",
                color: taxStatus === "licensed" ? "#fff" : "var(--color-ink-soft)",
              }}
            >
              עוסק מורשה
            </button>
          </div>
        </div>

        {invoiceProvider === "finbot" ? (
          finbotConnected ? (
            <div className="space-y-3">
              <div className="rounded-xl px-3.5 py-2.5 text-sm bg-sage-bg text-sage font-medium">
                חשבון Finbot מחובר ✓
              </div>
              <button
                onClick={disconnectFinbot}
                disabled={disconnectingFinbot}
                className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-rose disabled:opacity-60"
              >
                {disconnectingFinbot ? "מנתק..." : "ניתוק חשבון Finbot"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs block mb-1 text-ink-soft">מפתח API של Finbot</label>
                <input
                  type="password"
                  value={finbotApiKey}
                  onChange={(e) => setFinbotApiKey(e.target.value)}
                  placeholder="secret key"
                  className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white font-data"
                />
              </div>
              <button
                onClick={connectFinbot}
                disabled={savingInvoicing || !finbotApiKey.trim()}
                className="w-full rounded-lg py-2.5 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60"
              >
                {savingInvoicing ? "מחבר..." : "חיבור חשבון"}
              </button>
            </div>
          )
        ) : greenInvoiceConnected ? (
          <div className="space-y-3">
            <div className="rounded-xl px-3.5 py-2.5 text-sm bg-sage-bg text-sage font-medium">
              חשבון חשבונית ירוקה מחובר ✓
            </div>
            <button
              onClick={disconnectGreenInvoice}
              disabled={disconnectingGreenInvoice}
              className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-rose disabled:opacity-60"
            >
              {disconnectingGreenInvoice ? "מנתק..." : "ניתוק חשבון חשבונית ירוקה"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-ink-soft">
              את ה-Client ID וה-Secret מוציאים מ: הגדרות ← כלי פיתוח ← מפתחות API, בחשבון חשבונית
              ירוקה שלך.
            </p>
            <div>
              <label className="text-xs block mb-1 text-ink-soft">Client ID</label>
              <input
                type="text"
                value={greenInvoiceApiId}
                onChange={(e) => setGreenInvoiceApiId(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white font-data"
              />
            </div>
            <div>
              <label className="text-xs block mb-1 text-ink-soft">Secret</label>
              <input
                type="password"
                value={greenInvoiceApiSecret}
                onChange={(e) => setGreenInvoiceApiSecret(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white font-data"
              />
            </div>
            <button
              onClick={connectGreenInvoice}
              disabled={savingInvoicing || !greenInvoiceApiId.trim() || !greenInvoiceApiSecret.trim()}
              className="w-full rounded-lg py-2.5 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60"
            >
              {savingInvoicing ? "מחבר..." : "חיבור חשבון"}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl p-4 mt-5 bg-card border border-line shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold tracking-wide">מעקב אוטומטי אחר לידים</div>
            <div className="text-xs text-ink-soft mt-0.5">
              כשליד לא הופך ללקוח/מתעניין שאבד, נשלחות אוטומטית עד 3 הודעות מעקב בוואטסאפ (אחרי יומיים, 5 ימים ו-10 ימים)
            </div>
          </div>
          <button
            onClick={toggleLeadFollowUp}
            disabled={savingLeadFollowUp}
            role="switch"
            aria-checked={leadFollowUpEnabled}
            aria-label="הפעלת מעקב אוטומטי אחר לידים"
            className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5 disabled:opacity-60"
            style={{
              background: leadFollowUpEnabled ? "var(--color-amber-deep)" : "var(--color-line)",
              justifyContent: leadFollowUpEnabled ? "flex-start" : "flex-end",
            }}
          >
            <span className="h-5 w-5 rounded-full shadow" style={{ background: "#fff" }} />
          </button>
        </div>
      </div>

      {showAppleGuide && <AppleCalendarGuideModal onClose={() => setShowAppleGuide(false)} />}
    </div>
  );
}
