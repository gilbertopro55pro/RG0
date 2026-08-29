"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PACKAGE_LABELS, type PackageType } from "@/lib/stages";
import { openWhatsApp } from "@/lib/waLink";
import { formatDateDMYFromInput } from "@/lib/dateInputFormat";
import type { CustomPackageRow, EventTypeRow, PackagePriceRow } from "@/lib/types";
import { CustomPackageBuilder } from "@/components/CustomPackagesSettings";
import SendUpdateButton from "@/components/SendUpdateButton";

const CREATE_CUSTOM_PACKAGE_VALUE = "__create_custom__";

const selectArrowStyle = {
  background:
    "var(--color-amber-bg) url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236169C4' stroke-width='1.5' fill='none' fill-rule='evenodd'/%3E%3C/svg%3E\") left 0.9rem center/10px 6px no-repeat",
};

const CLOSE_ANIMATION_MS = 220;

type Step = 1 | 2 | 3 | "success";

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
  initial?: { clientName?: string; clientPhone?: string; eventDate?: string; pkg?: string };
  leadId?: string;
  waitlistId?: string;
  customPackages: CustomPackageRow[];
  eventTypes?: EventTypeRow[];
  prices?: PackagePriceRow[];
}) {
  const router = useRouter();
  const [clientName, setClientName] = useState(initial?.clientName ?? "");
  const [clientPhone, setClientPhone] = useState(initial?.clientPhone ?? "");
  const [pkgValue, setPkgValue] = useState<string>(initial?.pkg ?? "full");
  const [customPackages, setCustomPackages] = useState(initialCustomPackages);
  const [eventTypes, setEventTypes] = useState(initialEventTypes ?? []);
  const [prices, setPrices] = useState(initialPrices ?? []);
  const [showCustomPackageBuilder, setShowCustomPackageBuilder] = useState(false);
  const [eventDate, setEventDate] = useState(initial?.eventDate ?? "");
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [notes, setNotes] = useState("");
  const [deposit, setDeposit] = useState("");
  const [balance, setBalance] = useState("");
  const [wantsPaymentReminder, setWantsPaymentReminder] = useState(false);
  const [paymentReminderDate, setPaymentReminderDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateConflict, setDateConflict] = useState(false);
  const [addingToWaitlist, setAddingToWaitlist] = useState(false);
  const [createdEvent, setCreatedEvent] = useState<{ id: string; clientAccessToken: string } | null>(null);
  const [sendingUpdate, setSendingUpdate] = useState(false);

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
    setCreatedEvent({ id: data.id, clientAccessToken: data.clientAccessToken });
    setDirection("forward");
    setStep("success");
  };

  // Opens the photographer's own WhatsApp with the booking confirmation + portal link combined
  // into one pre-filled message — see src/lib/waLink.ts for why (no Meta Business API call, no
  // template approval, works today). Bound to the success screen's SendUpdateButton instead of
  // firing automatically on save, so it's a deliberate tap rather than a side effect the
  // photographer can't see coming or skip.
  const sendBookingUpdate = () => {
    if (!clientPhone || !createdEvent) return;
    setSendingUpdate(true);
    const formattedDate = new Date(eventDate).toLocaleDateString("he-IL");
    const portalLink = `${window.location.origin}/portal/${createdEvent.clientAccessToken}`;
    const message =
      `שלום ${clientName},\nהאירוע שלכם נסגר במערכת בהצלחה 🎉\n\n` +
      `תאריך: ${formattedDate}\n` +
      `מיקום: ${eventLocation || "יעודכן"}\n` +
      `שעת הגעה: ${arrivalTime || "יעודכן"}\n` +
      `מקדמה: ₪${Number(deposit) || 0} · יתרה: ₪${Number(balance) || 0}\n\n` +
      `הפורטל האישי שלכם לצפייה בפרטי האירוע והתשלומים:\n${portalLink}`;
    openWhatsApp(clientPhone, message);
    fetch(`/api/events/${createdEvent.id}/log-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `נשלחה הודעת וואטסאפ (אישור הזמנה + קישור פורטל) ל-${clientPhone}` }),
    })
      .catch(() => {})
      .finally(() => setSendingUpdate(false));
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
          <h2 className="text-xl font-bold font-display">אירוע חדש</h2>
          <button
            onClick={() => (step === "success" ? finishAndGoToEvent() : closeWithAnimation())}
            className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line"
          >
            ✕
          </button>
        </div>

        {step !== "success" && (
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
              <div>
                <label className="text-xs block mb-1 text-ink-soft">חבילה</label>
                <select
                  value={pkgValue}
                  onChange={(e) => {
                    if (e.target.value === CREATE_CUSTOM_PACKAGE_VALUE) {
                      setShowCustomPackageBuilder(true);
                      return;
                    }
                    setPkgValue(e.target.value);
                  }}
                  className="w-full rounded-lg px-3 py-2.5 text-sm appearance-none font-medium text-ink"
                  style={selectArrowStyle}
                >
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
                {/* The real <input type="date"> is fully invisible (opacity-0) and just an
                    interactive hit-target — this box's actual visible border/background/text is
                    entirely our own CSS on plain <div>s. Measured directly on a real iPhone: the
                    native control renders itself wider than its own declared 100% width once
                    dir="ltr" is set inside an RTL page (confirmed reproducible, and NOT something
                    any available testing engine here — including real WebKit on macOS — actually
                    reproduces, since iOS's native date/time picker chrome is OS-level UI, not
                    something WebKit-on-desktop renders the same way). Making the visible chrome a
                    plain div with overflow-hidden means that overflow gets clipped instead of
                    pushing the box wider than its siblings, regardless of what the invisible
                    native control tries to claim internally. */}
                <div className="relative w-full rounded-lg border border-line bg-white overflow-hidden">
                  <div className="pointer-events-none flex items-center justify-center px-3 py-2 text-sm" dir="ltr">
                    {eventDate ? formatDateDMYFromInput(eventDate) : <span className="text-ink-soft">בחר תאריך</span>}
                  </div>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                    dir="ltr"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                {/* min-w-0 is the fix — flex items default to min-width:auto, which lets a native
                    time input's intrinsic width push past its half of the row instead of
                    shrinking, so the two fields overlapped instead of sitting side by side. The
                    same overlap came back once a time was actually picked, though: without
                    dir="ltr" the input's OWN inline value rendered right-to-left (the browser
                    reversing "14:30" and reflowing it wider than its half of the row) — that's
                    what was actually climbing onto the neighboring field, not a sizing issue. */}
                {/* Same invisible-native-input-over-plain-div pattern as the date field above:
                    the visible box is entirely our own div (border/background/centered text),
                    the real <input> is an opacity-0 hit-target clipped by overflow-hidden — so a
                    native time control's own intrinsic width (confirmed on a real iPhone to
                    render wider than its declared width once dir="ltr" applies) can never push
                    past its half of the row, gap-2 between the two boxes stays a real gap either
                    way, and flex-1 on both means they always split the same total width as the
                    date field's own row above. */}
                <div className="flex-1 min-w-0">
                  <label className="text-xs block mb-1 text-ink-soft">שעת התחלה</label>
                  <div className="relative w-full rounded-lg border border-line bg-white overflow-hidden">
                    <div className="pointer-events-none flex items-center justify-center px-1.5 py-2 text-sm" dir="ltr">
                      {eventStartTime || <span className="text-ink-soft">--:--</span>}
                    </div>
                    <input
                      type="time"
                      value={eventStartTime}
                      onChange={(e) => setEventStartTime(e.target.value)}
                      onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                      dir="ltr"
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-xs block mb-1 text-ink-soft">שעת סיום</label>
                  <div className="relative w-full rounded-lg border border-line bg-white overflow-hidden">
                    <div className="pointer-events-none flex items-center justify-center px-1.5 py-2 text-sm" dir="ltr">
                      {eventEndTime || <span className="text-ink-soft">--:--</span>}
                    </div>
                    <input
                      type="time"
                      value={eventEndTime}
                      onChange={(e) => setEventEndTime(e.target.value)}
                      onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                      dir="ltr"
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </div>
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
                {/* Same invisible-native-input-over-plain-div pattern as the date and start/end
                    time fields above. */}
                <div className="relative w-full rounded-lg border border-line bg-white overflow-hidden">
                  <div className="pointer-events-none flex items-center justify-center px-3 py-2 text-sm" dir="ltr">
                    {arrivalTime || <span className="text-ink-soft">--:--</span>}
                  </div>
                  <input
                    type="time"
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                    onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
                    dir="ltr"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </div>
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
                  <p className="text-xs text-ink-soft mt-1">האירוע נוסף למערכת וליומן שלך.</p>
                </div>
              </div>
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
