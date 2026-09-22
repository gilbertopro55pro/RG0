"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PACKAGE_LABELS, FREELANCE_VIDEO_EDIT_VARIANTS, packageLabel, type PackageType } from "@/lib/stages";
import { openWhatsApp } from "@/lib/waLink";
import { formatDateDMYFromInput } from "@/lib/dateInputFormat";
import { createClient } from "@/lib/supabase/client";
import { buildClientMessageText } from "@/lib/clientMessage";
import type { ContractTemplateRow, CustomPackageRow, EventContractRow, EventTypeRow, PackagePriceRow } from "@/lib/types";
import { CustomPackageBuilder } from "@/components/CustomPackagesSettings";
import SendUpdateButton from "@/components/SendUpdateButton";
import NativeDateTimeField from "@/components/NativeDateTimeField";
import EventTypeField from "@/components/EventTypeField";
import CompactGuideModal from "@/components/CompactGuideModal";

const CREATE_CUSTOM_PACKAGE_VALUE = "__create_custom__";
// The 4 video-editing sub-choices collapse to this one representative value in the top-level
// package <select> — see the "מה כולל העריכה" nested dropdown below it.
const VIDEO_EDIT_GROUP_VALUE: PackageType = "freelance_video_film";
const isVideoEditVariant = (v: string) => FREELANCE_VIDEO_EDIT_VARIANTS.some((o) => o.value === v);

const selectArrowStyle = {
  background:
    "var(--color-amber-bg) url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236169C4' stroke-width='1.5' fill='none' fill-rule='evenodd'/%3E%3C/svg%3E\") left 0.9rem center/10px 6px no-repeat",
};

const CLOSE_ANIMATION_MS = 220;

// The auto-provisioned default package offered first in the package dropdown — a normal custom
// package (editable/deletable in Settings) with exactly these two stages. See seedDefaultPackage.
const DEFAULT_PACKAGE_NAME = "ברירת מחדל";
const DEFAULT_PACKAGE_STAGES = [
  { name: "יום הצילום", notify_client: false, notify_text: null as string | null },
  { name: "מסירה סופית", notify_client: false, notify_text: null as string | null },
];

type Step = 1 | 2 | 3 | "contract" | "success";

export default function NewEventModal({
  onClose,
  initial,
  leadId,
  waitlistId,
  customPackages: initialCustomPackages,
  eventTypes: initialEventTypes,
  prices: initialPrices,
}: {
  onClose: () => void;
  // pkg accepts a built-in PackageType key or a `custom:<id>` value (e.g. pre-filled from a lead's
  // package_interest, which uses that same convention — see resolveLeadPackageLabel in @/lib/stages).
  initial?: {
    clientName?: string;
    eventType?: string;
    clientPhone?: string;
    eventDate?: string;
    pkg?: string;
    eventStartTime?: string;
    eventEndTime?: string;
    eventLocation?: string;
    notes?: string;
    deposit?: number;
    balance?: number;
    // Set only by the calendar-import scan (admin-only for now) — see createEvent.ts's own doc
    // comment for why this makes event creation UPDATE that calendar event in place instead of
    // creating a new, duplicate one.
    sourceGoogleCalendarEventId?: string;
  };
  leadId?: string;
  waitlistId?: string;
  customPackages: CustomPackageRow[];
  eventTypes?: EventTypeRow[];
  prices?: PackagePriceRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [clientName, setClientName] = useState(initial?.clientName ?? "");
  const [eventType, setEventType] = useState(initial?.eventType ?? "");
  const [clientPhone, setClientPhone] = useState(initial?.clientPhone ?? "");
  const [customPackages, setCustomPackages] = useState(initialCustomPackages);
  const [pkgValue, setPkgValue] = useState<string>(() => {
    if (initial?.pkg) return initial.pkg;
    const existingDefault = initialCustomPackages.find((cp) => cp.name === DEFAULT_PACKAGE_NAME);
    return existingDefault ? `custom:${existingDefault.id}` : "full";
  });
  // Set the moment the photographer touches the package dropdown themselves — the async default-
  // package provisioning below must never overwrite a choice they already made.
  const pkgTouchedRef = useRef(false);
  const [eventTypes, setEventTypes] = useState(initialEventTypes ?? []);
  const [prices, setPrices] = useState(initialPrices ?? []);
  const [showCustomPackageBuilder, setShowCustomPackageBuilder] = useState(false);
  const [eventDate, setEventDate] = useState(initial?.eventDate ?? "");
  const [eventStartTime, setEventStartTime] = useState(initial?.eventStartTime ?? "");
  const [eventEndTime, setEventEndTime] = useState(initial?.eventEndTime ?? "");
  const [eventLocation, setEventLocation] = useState(initial?.eventLocation ?? "");
  const [arrivalTime, setArrivalTime] = useState("");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [deposit, setDeposit] = useState(initial?.deposit ? String(initial.deposit) : "");
  const [balance, setBalance] = useState(initial?.balance ? String(initial.balance) : "");
  const [wantsPaymentReminder, setWantsPaymentReminder] = useState(false);
  const [paymentReminderDate, setPaymentReminderDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateConflict, setDateConflict] = useState(false);
  const [addingToWaitlist, setAddingToWaitlist] = useState(false);
  const [createdEvent, setCreatedEvent] = useState<{ id: string; clientAccessToken: string; googleCalendarSynced: boolean } | null>(null);
  const [sendingUpdate, setSendingUpdate] = useState(false);
  // Booking-confirmation message: the photographer's own saved "event_closing" template (Settings
  // → הודעות ללקוח/ה) instead of a hardcoded, non-customizable message. Fetched once on open, same
  // as the rest of this modal's one-shot data loads.
  const [eventClosingTemplate, setEventClosingTemplate] = useState<string | undefined>(undefined);
  const [whatsappSignature, setWhatsappSignature] = useState<string | null>(null);

  // Contract-selection step inserted between "event saved" and the existing success/WhatsApp
  // screen — promoted to every photographer (was admin-only while this flow was being tested,
  // per the standing "עדכון אדמין" staged-rollout process) — see the "contract" Step branch below.
  const [contractTemplates, setContractTemplates] = useState<ContractTemplateRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [contractTermsDraft, setContractTermsDraft] = useState("");
  const [contract, setContract] = useState<EventContractRow | null>(null);
  const [creatingContract, setCreatingContract] = useState(false);
  const [contractError, setContractError] = useState<string | null>(null);
  const [copiedContractLink, setCopiedContractLink] = useState(false);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  const [skippingContract, setSkippingContract] = useState(false);

  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);

  // Backdrop blur ramps in right after mount (needs a tick so the transition actually plays
  // instead of starting already-blurred) and ramps back out during the close animation.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const [{ data: photographer }, { data: templateRow }, { data: templates }] = await Promise.all([
        supabase.from("photographers").select("whatsapp_signature").eq("id", user.id).maybeSingle<{ whatsapp_signature: string | null }>(),
        supabase.from("client_message_templates").select("body").eq("photographer_id", user.id).eq("stage_key", "event_closing").maybeSingle<{ body: string }>(),
        supabase.from("contract_templates").select("*").eq("photographer_id", user.id).order("created_at", { ascending: true }).returns<ContractTemplateRow[]>(),
      ]);
      if (cancelled) return;
      setWhatsappSignature(photographer?.whatsapp_signature ?? null);
      setEventClosingTemplate(templateRow?.body);
      setContractTemplates(templates ?? []);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First-ever open for this photographer: creates the "ברירת מחדל" package (two stages) and, if
  // nothing was picked yet, selects it. The claim is an atomic conditional update on
  // photographers.default_package_seeded, so two open tabs can't both create it, and a
  // photographer who later deletes the package isn't given a fresh one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (initialCustomPackages.some((cp) => cp.name === DEFAULT_PACKAGE_NAME)) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: claimed } = await supabase
        .from("photographers")
        .update({ default_package_seeded: true })
        .eq("id", user.id)
        .eq("default_package_seeded", false)
        .select("id")
        .returns<{ id: string }[]>();
      if (!claimed || claimed.length === 0) return;
      const { data: pkg } = await supabase
        .from("custom_packages")
        .insert({ photographer_id: user.id, name: DEFAULT_PACKAGE_NAME, price: null })
        .select()
        .single<CustomPackageRow>();
      if (!pkg) return;
      await supabase.from("custom_package_stages").insert(
        DEFAULT_PACKAGE_STAGES.map((st, i) => ({
          package_id: pkg.id,
          photographer_id: user.id,
          name: st.name,
          sort_order: i,
          notify_client: st.notify_client,
          notify_text: st.notify_text,
          requires_album_pdf: false,
        }))
      );
      if (cancelled) return;
      setCustomPackages((prev) => [...prev, pkg]);
      if (!initial?.pkg) setPkgValue((prev) => (pkgTouchedRef.current ? prev : `custom:${pkg.id}`));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCustomPkg = pkgValue.startsWith("custom:");

  // Delays the real onClose (or a follow-up action like navigating to the new event) until the
  // zoom-out close animation actually finishes, instead of yanking the modal away instantly.
  const closeWithAnimation = (after?: () => void) => {
    setClosing(true);
    setTimeout(() => {
      if (after) after();
      else onClose();
    }, CLOSE_ANIMATION_MS);
  };

  const goNext = () => {
    setDirection("forward");
    setStep((s) => (s === 1 ? 2 : 3) as Step);
  };
  const goBack = () => {
    setDirection("backward");
    setStep((s) => (s === 3 ? 2 : 1) as Step);
  };

  const submit = async () => {
    if (!clientName || !eventDate) return;
    setSaving(true);
    setError(null);
    setDateConflict(false);

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName,
        eventType: eventType.trim() || null,
        clientPhone,
        pkg: isCustomPkg ? null : pkgValue,
        customPackageId: isCustomPkg ? pkgValue.slice(7) : null,
        eventDate,
        eventStartTime: eventStartTime || null,
        eventEndTime: eventEndTime || null,
        eventLocation,
        arrivalTime,
        notes,
        deposit: Number(deposit) || 0,
        balance: Number(balance) || 0,
        paymentReminderDate: wantsPaymentReminder ? paymentReminderDate : null,
        sourceGoogleCalendarEventId: initial?.sourceGoogleCalendarEventId ?? null,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "שגיאה ביצירת האירוע");
      setDateConflict(!!data.conflict);
      setSaving(false);
      return;
    }

    if (leadId) {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "won", converted_event_id: data.id }),
      });
    }
    if (waitlistId) {
      await fetch(`/api/waitlist/${waitlistId}`, { method: "DELETE" });
    }

    setSaving(false);
    setCreatedEvent({ id: data.id, clientAccessToken: data.clientAccessToken, googleCalendarSynced: !!data.googleCalendarSynced });
    setDirection("forward");
    setStep("contract");
  };

  // Opens the photographer's own WhatsApp with the booking confirmation + portal link combined
  // into one pre-filled message — see src/lib/waLink.ts for why (no Meta Business API call, no
  // template approval, works today). Bound to the success screen's SendUpdateButton instead of
  // firing automatically on save, so it's a deliberate tap rather than a side effect the
  // photographer can't see coming or skip.
  //
  // Uses the same buildClientMessageText shared builder as EventDetailView.tsx, resolving the
  // photographer's own saved "event_closing" template instead of a hardcoded message.
  const sendBookingUpdate = () => {
    if (!clientPhone || !createdEvent) return;
    setSendingUpdate(true);
    const portalLink = `${window.location.origin}/portal/${createdEvent.clientAccessToken}`;
    const message = buildClientMessageText({
      stageKey: "event_closing",
      stageLabel: "סגירת האירוע",
      savedTemplate: eventClosingTemplate,
      clientName,
      eventDateIso: eventDate,
      eventLocation: eventLocation || null,
      packageLabelText: isCustomPkg
        ? (customPackages.find((p) => p.id === pkgValue.slice(7))?.name ?? "חבילה מותאמת אישית")
        : packageLabel(pkgValue as PackageType, null),
      eventStartTime: eventStartTime || null,
      eventEndTime: eventEndTime || null,
      arrivalTime: arrivalTime || null,
      depositAmount: Number(deposit) || 0,
      balanceAmount: Number(balance) || 0,
      linkUrl: portalLink,
      whatsappSignature,
    });
    openWhatsApp(clientPhone, message);
    fetch(`/api/events/${createdEvent.id}/log-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `נשלחה הודעת וואטסאפ (אישור הזמנה + קישור פורטל) ל-${clientPhone}` }),
    })
      .catch(() => {})
      .finally(() => setSendingUpdate(false));
  };

  // The "contract" step's own actions. Picking a saved template fills the draft textarea with
  // it, still freely editable before creating — the edited text (not a re-fetch of the original
  // template) is what actually gets used, via customTermsOverride.
  const [savingNewTemplate, setSavingNewTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  const onTemplateSelect = (id: string) => {
    setSelectedTemplateId(id);
    const t = contractTemplates.find((ct) => ct.id === id);
    setContractTermsDraft(t?.terms ?? "");
  };

  const saveAsNewTemplate = async () => {
    if (!newTemplateName.trim() || !contractTermsDraft.trim()) return;
    setSavingNewTemplate(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSavingNewTemplate(false);
      return;
    }
    const { data } = await supabase
      .from("contract_templates")
      .insert({ photographer_id: user.id, name: newTemplateName.trim(), terms: contractTermsDraft.trim() })
      .select()
      .single<ContractTemplateRow>();
    setSavingNewTemplate(false);
    if (data) {
      setContractTemplates((prev) => [...prev, data]);
      setSelectedTemplateId(data.id);
      setNewTemplateName("");
    }
  };

  const createContractForEvent = async () => {
    if (!createdEvent) return;
    setCreatingContract(true);
    setContractError(null);
    const res = await fetch(`/api/events/${createdEvent.id}/contract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: selectedTemplateId || undefined, customTermsOverride: contractTermsDraft || undefined }),
    });
    const data = await res.json();
    setCreatingContract(false);
    if (!res.ok) {
      setContractError(data.error ?? "שגיאה ביצירת החוזה");
      return;
    }
    setContract(data.contract);
  };

  const copyContractLink = async () => {
    if (!contract) return;
    await navigator.clipboard.writeText(`${window.location.origin}/contracts/${contract.sign_token}`);
    setCopiedContractLink(true);
    setTimeout(() => setCopiedContractLink(false), 2000);
  };

  const skipContract = async () => {
    if (!createdEvent) return;
    setSkippingContract(true);
    await fetch(`/api/events/${createdEvent.id}/skip-contract`, { method: "POST" }).catch(() => {});
    setSkippingContract(false);
    setSkipConfirmOpen(false);
    setDirection("forward");
    setStep("success");
  };

  const finishAndGoToEvent = () => {
    if (!createdEvent) return;
    closeWithAnimation(() => {
      router.push(`/events/${createdEvent.id}`);
      router.refresh();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: "rgba(46,49,66,0.45)",
        backdropFilter: entered && !closing ? "blur(16px)" : "blur(0px)",
        WebkitBackdropFilter: entered && !closing ? "blur(16px)" : "blur(0px)",
        transition: `backdrop-filter ${CLOSE_ANIMATION_MS + 60}ms ease, -webkit-backdrop-filter ${CLOSE_ANIMATION_MS + 60}ms ease`,
      }}
    >
      <style>{`
        @keyframes newEventStepForward { from { transform: translateX(32px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes newEventStepBackward { from { transform: translateX(-32px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes newEventZoomOut { from { transform: scale(1); opacity: 1; } to { transform: scale(0.85); opacity: 0; } }
        .new-event-step-forward { animation: newEventStepForward 220ms ease; }
        .new-event-step-backward { animation: newEventStepBackward 220ms ease; }
        .new-event-closing { animation: newEventZoomOut ${CLOSE_ANIMATION_MS}ms ease forwards; }
      `}</style>
      <div
        className={`w-[85%] max-w-md rounded-3xl p-5 pb-6 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto ${closing ? "new-event-closing" : ""}`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold font-display">אירוע חדש</h2>
            <CompactGuideModal pageKey="new-event" />
          </div>
          <button
            onClick={() => (step === "success" || step === "contract" ? finishAndGoToEvent() : closeWithAnimation())}
            className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line"
          >
            ✕
          </button>
        </div>

        {step !== "success" && step !== "contract" && (
          <div className="flex items-center gap-1.5 mb-5">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className="h-1 flex-1 rounded-full"
                style={{ background: s <= step ? "var(--color-amber-deep)" : "var(--color-line)" }}
              />
            ))}
          </div>
        )}

        <div key={`${step}-${direction}`} className={direction === "forward" ? "new-event-step-forward" : "new-event-step-backward"}>
          {step === 1 && (
            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold tracking-wide text-ink-soft">פרטי הלקוח/ה</div>
                <p className="text-xs text-ink-soft mt-0.5">מי הלקוח/ה ואיך ליצור איתם קשר בהמשך התהליך</p>
              </div>
              <EventTypeField value={eventType} onChange={setEventType} />
              <div>
                <label className="text-xs block mb-1 text-ink-soft">שם הלקוח</label>
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
                  placeholder="לדוגמה: משפחת לוי"
                />
              </div>
              <div>
                <label className="text-xs block mb-1 text-ink-soft">טלפון הלקוח (לתזכורות בוואטסאפ)</label>
                <input
                  type="tel"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white font-data"
                  placeholder="050-1234567"
                />
              </div>
              <div className="rounded-xl p-3 bg-white border-2" style={{ borderColor: "var(--color-amber-deep)" }}>
                <label className="text-sm font-bold block text-ink">חבילה</label>
                <p className="text-[11px] text-ink-soft mt-0.5 mb-2">החבילה קובעת אילו שלבי עבודה יופיעו באירוע — כדאי לבחור אותה בכוונה</p>
                <select
                  value={isVideoEditVariant(pkgValue) ? VIDEO_EDIT_GROUP_VALUE : pkgValue}
                  onChange={(e) => {
                    pkgTouchedRef.current = true;
                    if (e.target.value === CREATE_CUSTOM_PACKAGE_VALUE) {
                      setShowCustomPackageBuilder(true);
                      return;
                    }
                    if (e.target.value === VIDEO_EDIT_GROUP_VALUE) {
                      // Re-entering the group keeps whatever sub-choice was already picked
                      // instead of silently resetting it back to the plain "סרט" default.
                      setPkgValue((prev) => (isVideoEditVariant(prev) ? prev : VIDEO_EDIT_GROUP_VALUE));
                      return;
                    }
                    setPkgValue(e.target.value);
                  }}
                  className="w-full rounded-lg px-3 py-2.5 text-sm appearance-none font-medium text-ink"
                  style={selectArrowStyle}
                >
                  {customPackages
                    .filter((cp) => cp.name === DEFAULT_PACKAGE_NAME)
                    .map((cp) => (
                      <option key={cp.id} value={`custom:${cp.id}`}>
                        {cp.name}
                      </option>
                    ))}
                  {Object.keys(PACKAGE_LABELS)
                    .filter((p) => !isVideoEditVariant(p) || p === VIDEO_EDIT_GROUP_VALUE)
                    .map((p) => (
                      <option key={p} value={p}>
                        {p === VIDEO_EDIT_GROUP_VALUE ? "פרילנס וידאו כולל עריכה" : PACKAGE_LABELS[p as PackageType]}
                      </option>
                    ))}
                  {customPackages
                    .filter((cp) => cp.name !== DEFAULT_PACKAGE_NAME)
                    .map((cp) => (
                      <option key={cp.id} value={`custom:${cp.id}`}>
                        {cp.name}
                      </option>
                    ))}
                  <option value={CREATE_CUSTOM_PACKAGE_VALUE}>+ חבילה מותאמת אישית חדשה</option>
                </select>
              </div>

              {isVideoEditVariant(pkgValue) && (
                <div>
                  <label className="text-xs block mb-1 text-ink-soft">מה כולל העריכה</label>
                  <select
                    value={pkgValue}
                    onChange={(e) => setPkgValue(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5 text-sm appearance-none font-medium text-ink"
                    style={selectArrowStyle}
                  >
                    {FREELANCE_VIDEO_EDIT_VARIANTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={goNext}
                disabled={!clientName}
                className="w-full rounded-lg py-3 text-sm font-semibold mt-2 bg-ink text-white disabled:opacity-60"
              >
                המשך
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold tracking-wide text-ink-soft">מתי ואיפה</div>
                <p className="text-xs text-ink-soft mt-0.5">תאריך, שעות ומיקום — ישמשו גם לסנכרון עם יומן Google ולאיתור כפילויות</p>
              </div>
              <div>
                <label className="text-xs block mb-1 text-ink-soft">תאריך האירוע</label>
                <NativeDateTimeField
                  type="date"
                  value={eventDate}
                  onChange={setEventDate}
                  display={eventDate ? formatDateDMYFromInput(eventDate) : <span className="text-ink-soft">בחר תאריך</span>}
                />
              </div>
              <div className="flex gap-2">
                {/* min-w-0 is the fix — flex items default to min-width:auto, which lets a native
                    time input's intrinsic width push past its half of the row instead of
                    shrinking, so the two fields overlapped instead of sitting side by side. */}
                <div className="flex-1 min-w-0">
                  <label className="text-xs block mb-1 text-ink-soft">שעת התחלה</label>
                  <NativeDateTimeField
                    type="time"
                    compact
                    value={eventStartTime}
                    onChange={setEventStartTime}
                    display={eventStartTime || <span className="text-ink-soft">--:--</span>}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-xs block mb-1 text-ink-soft">שעת סיום</label>
                  <NativeDateTimeField
                    type="time"
                    compact
                    value={eventEndTime}
                    onChange={setEventEndTime}
                    display={eventEndTime || <span className="text-ink-soft">--:--</span>}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs block mb-1 text-ink-soft">מיקום האירוע</label>
                <input
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm text-center border border-line bg-white"
                  placeholder="לדוגמה: אולמי הגן, ראשון לציון"
                />
              </div>
              <div>
                <label className="text-xs block mb-1 text-ink-soft">שעת הגעה לצילומי משפחה</label>
                <NativeDateTimeField
                  type="time"
                  value={arrivalTime}
                  onChange={setArrivalTime}
                  display={arrivalTime || <span className="text-ink-soft">--:--</span>}
                />
              </div>
              <div>
                <label className="text-xs block mb-1 text-ink-soft">הערות</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white resize-none"
                  placeholder="כל מידע נוסף שכדאי לזכור על האירוע"
                />
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  onClick={goBack}
                  className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft"
                >
                  חזרה
                </button>
                <button
                  onClick={goNext}
                  disabled={!eventDate}
                  className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
                >
                  המשך
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold tracking-wide text-ink-soft">תשלום</div>
                <p className="text-xs text-ink-soft mt-0.5">סכומי המקדמה והיתרה, ואפשרות לתזכורת תשלום אוטומטית ללקוח</p>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs block mb-1 text-ink-soft">מקדמה (₪)</label>
                  <input
                    type="number"
                    value={deposit}
                    onChange={(e) => setDeposit(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs block mb-1 text-ink-soft">יתרה (₪)</label>
                  <input
                    type="number"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
                  />
                </div>
              </div>
              <div className="rounded-lg border border-line px-3 py-2.5 bg-white">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wantsPaymentReminder}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setWantsPaymentReminder(checked);
                      if (checked && !paymentReminderDate && eventDate) {
                        const d = new Date(eventDate);
                        d.setDate(d.getDate() + 1);
                        setPaymentReminderDate(d.toISOString().slice(0, 10));
                      }
                    }}
                  />
                  תזכורת תשלום אוטומטית ליתרה
                </label>
                {wantsPaymentReminder && (
                  <input
                    type="date"
                    value={paymentReminderDate}
                    onChange={(e) => setPaymentReminderDate(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white mt-2"
                  />
                )}
              </div>

              {error && <p className="text-xs text-rose">{error}</p>}

              <div className="flex gap-2 mt-2">
                <button
                  onClick={goBack}
                  className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft"
                >
                  חזרה
                </button>
                <button
                  onClick={() => setConfirmSaveOpen(true)}
                  disabled={saving}
                  className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
                >
                  {saving ? "שומר..." : "שמירת האירוע"}
                </button>
              </div>
            </div>
          )}

          {step === "contract" && (
            <div className="space-y-3.5">
              <div className="flex flex-col items-center text-center gap-2 py-2">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                  style={{ background: "var(--color-sage-bg)", color: "var(--color-sage)" }}
                >
                  ✓
                </span>
                <div>
                  <div className="text-base font-bold font-display">האירוע נשמר בהצלחה</div>
                  <p className="text-xs text-ink-soft mt-1">רוצים לשלוח ללקוח/ה חוזה לחתימה דיגיטלית לפני הודעת הפתיחה?</p>
                </div>
              </div>

              {!contract ? (
                <>
                  <div>
                    <label className="text-xs block mb-1 text-ink-soft">תבנית חוזה</label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => onTemplateSelect(e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
                    >
                      <option value="">ברירת המחדל שלי</option>
                      {contractTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs block mb-1 text-ink-soft">תנאים כלליים (אפשר לערוך רק עבור החוזה הזה)</label>
                    <textarea
                      value={contractTermsDraft}
                      onChange={(e) => setContractTermsDraft(e.target.value)}
                      rows={6}
                      placeholder="השאירו ריק כדי להשתמש בברירת המחדל שלכם"
                      className="w-full rounded-lg px-2.5 py-2 text-sm border border-line bg-white leading-relaxed"
                    />
                  </div>
                  {contractTermsDraft.trim() && (
                    <div className="flex gap-2">
                      <input
                        value={newTemplateName}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                        placeholder="שם לשמירה כתבנית חדשה"
                        className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-xs border border-line bg-white"
                      />
                      <button
                        onClick={saveAsNewTemplate}
                        disabled={savingNewTemplate || !newTemplateName.trim()}
                        className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold bg-white border border-line text-ink disabled:opacity-50"
                      >
                        {savingNewTemplate ? "שומר..." : "שמירה כתבנית חדשה"}
                      </button>
                    </div>
                  )}
                  {contractError && <p className="text-xs text-rose">{contractError}</p>}
                  <button
                    onClick={createContractForEvent}
                    disabled={creatingContract}
                    className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
                  >
                    {creatingContract ? "יוצר..." : "יצירת חוזה לחתימה"}
                  </button>
                  <button
                    onClick={() => setSkipConfirmOpen(true)}
                    className="w-full text-xs text-ink-soft underline"
                  >
                    דילוג — לא לעבוד עם חוזה באירוע הזה
                  </button>
                </>
              ) : (
                <div className="space-y-2.5">
                  <div className="rounded-xl px-3.5 py-2.5 text-sm bg-chip-tint text-amber-deep font-medium text-center">
                    החוזה נוצר — ממתין לשליחה וחתימת הלקוח/ה
                  </div>
                  <button
                    onClick={copyContractLink}
                    className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink"
                  >
                    {copiedContractLink ? "הקישור הועתק ✓" : "העתקת קישור לחתימה"}
                  </button>
                  <p className="text-xs text-ink-soft text-center">
                    שלחו את הקישור ללקוח/ה (בוואטסאפ למשל). כשיחתמו, תקבלו מייל ותוכלו לשלוח את הודעת הפתיחה מעמוד האירוע.
                  </p>
                  <button
                    onClick={() => {
                      setDirection("forward");
                      setStep("success");
                    }}
                    className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white"
                  >
                    המשך
                  </button>
                </div>
              )}
            </div>
          )}

          {skipConfirmOpen && (
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center p-4"
              style={{ background: "rgba(46,49,66,0.45)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
              onClick={() => setSkipConfirmOpen(false)}
            >
              <div className="w-[85%] max-w-md rounded-3xl p-5 pb-6 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-lg font-bold mb-2 font-display">לדלג על שלב החוזה?</h2>
                <p className="text-sm text-ink-soft mb-5">האירוע ימשיך בלי חוזה — אפשר תמיד ליצור אחד מאוחר יותר מעמוד האירוע.</p>
                <div className="flex gap-2">
                  <button
                    onClick={skipContract}
                    disabled={skippingContract}
                    className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
                  >
                    {skippingContract ? "מדלג..." : "כן, דילוג"}
                  </button>
                  <button
                    onClick={() => setSkipConfirmOpen(false)}
                    className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center text-center gap-2 py-2">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                  style={{ background: "var(--color-sage-bg)", color: "var(--color-sage)" }}
                >
                  ✓
                </span>
                <div>
                  <div className="text-base font-bold font-display">האירוע נשמר בהצלחה</div>
                  <p className="text-xs text-ink-soft mt-1">
                    {createdEvent?.googleCalendarSynced ? "האירוע נוסף למערכת וליומן שלך." : "האירוע נוסף למערכת."}
                  </p>
                </div>
              </div>
              {createdEvent && !createdEvent.googleCalendarSynced && (
                <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--color-amber-bg)" }}>
                  <p className="text-xs text-amber-deep">
                    האירוע לא נוסף ליומן Google — החיבור פג תוקף. יש להתחבר מחדש כדי להוסיף אותו.
                  </p>
                  <a
                    href={`/api/google/connect?redirect=${encodeURIComponent(`/events/${createdEvent.id}?calendarRetry=1`)}`}
                    className="block w-full text-center rounded-lg py-2.5 text-xs font-semibold bg-amber-deep text-white"
                  >
                    חיבור מחדש ליומן Google
                  </a>
                </div>
              )}
              {clientPhone ? (
                <>
                  <p className="text-xs text-ink-soft text-center mb-1">
                    לחיצה תפתח את הוואטסאפ שלך עם הודעה מוכנה ללקוח/ה — פרטי האירוע, המקדמה והיתרה, וקישור
                    לפורטל האישי שלהם למעקב אחר האירוע והתשלומים. תישאר/י לבדוק ולשלוח בעצמך.
                  </p>
                  <SendUpdateButton onSend={sendBookingUpdate} pending={sendingUpdate} label="שליחת עדכון ללקוח בוואטסאפ" />
                </>
              ) : (
                <p className="text-xs text-ink-soft text-center">לא הוזן טלפון לקוח — לא ניתן לשלוח עדכון.</p>
              )}
              <button
                onClick={finishAndGoToEvent}
                className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white"
              >
                מעבר לעמוד האירוע
              </button>
            </div>
          )}
        </div>
      </div>

      {confirmSaveOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(46,49,66,0.45)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
          onClick={() => setConfirmSaveOpen(false)}
        >
          <div
            className="w-[85%] max-w-md rounded-3xl p-5 pb-6 bg-paper shadow-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-2 font-display">לשמור את האירוע?</h2>
            <p className="text-sm text-ink-soft mb-5">האירוע ייסגר במערכת ויתווסף ליומן שלך.</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setConfirmSaveOpen(false);
                  submit();
                }}
                disabled={saving}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
              >
                {saving ? "שומר..." : "כן, שמירה"}
              </button>
              <button
                onClick={() => setConfirmSaveOpen(false)}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {dateConflict && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(46,49,66,0.45)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
          onClick={() => setDateConflict(false)}
        >
          <div
            className="w-[85%] max-w-md rounded-3xl p-5 pb-6 bg-paper shadow-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-2 font-display">קיים אירוע נוסף בתאריך זה</h2>
            {error && <p className="text-sm text-rose mb-2">{error}</p>}
            <p className="text-sm text-ink-soft mb-5">האם להכניס את האירוע לרשימת המתנה?</p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setAddingToWaitlist(true);
                  await fetch("/api/waitlist", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ clientName, clientPhone, requestedDate: eventDate }),
                  });
                  setAddingToWaitlist(false);
                  closeWithAnimation();
                }}
                disabled={addingToWaitlist}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
              >
                {addingToWaitlist ? "מוסיף..." : "אישור"}
              </button>
              <button
                onClick={() => setDateConflict(false)}
                disabled={addingToWaitlist}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {showCustomPackageBuilder && (
        <CustomPackageBuilder
          pkg={null}
          initialStages={[]}
          eventTypes={eventTypes}
          prices={prices}
          onClose={() => setShowCustomPackageBuilder(false)}
          onSaved={(pkg, _stages, updatedEventTypes, updatedPrices) => {
            setCustomPackages((prev) => [...prev, pkg]);
            setEventTypes(updatedEventTypes);
            setPrices(updatedPrices);
            setPkgValue(`custom:${pkg.id}`);
            setShowCustomPackageBuilder(false);
          }}
          onEventTypeDeleted={(eventTypeId) => {
            setEventTypes((prev) => prev.filter((t) => t.id !== eventTypeId));
            setPrices((prev) => prev.filter((p) => p.event_type_id !== eventTypeId));
          }}
        />
      )}
    </div>
  );
}
