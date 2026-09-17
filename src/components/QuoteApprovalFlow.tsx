"use client";

import { useState } from "react";

type Step = "view" | "questionnaire" | "done";

export default function QuoteApprovalFlow({
  token,
  clientName,
  clientPhone,
  eventDateInterest,
  photographerName,
  photographerPhone,
  whatsappSignature,
  quotedAmount,
  quoteNote,
  packageLabelText,
  initialApprovedAt,
  initialConvertedEventId,
  initialClientAccessToken,
}: {
  token: string;
  clientName: string;
  clientPhone: string | null;
  eventDateInterest: string | null;
  photographerName: string;
  photographerPhone: string;
  whatsappSignature: string | null;
  quotedAmount: number;
  quoteNote: string | null;
  packageLabelText: string | null;
  initialApprovedAt: string | null;
  initialConvertedEventId: string | null;
  initialClientAccessToken: string | null;
}) {
  const [step, setStep] = useState<Step>(initialConvertedEventId ? "done" : initialApprovedAt ? "questionnaire" : "view");
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientAccessToken, setClientAccessToken] = useState<string | null>(initialClientAccessToken);

  const [formName, setFormName] = useState(clientName);
  const [formPhone, setFormPhone] = useState(clientPhone ?? "");
  const [formDate, setFormDate] = useState(eventDateInterest ?? "");
  const [formStartTime, setFormStartTime] = useState("");
  const [formEndTime, setFormEndTime] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formArrivalTime, setFormArrivalTime] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const approve = async () => {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${token}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "האישור נכשל");
      setStep("questionnaire");
    } catch (e) {
      setError(e instanceof Error ? e.message : "האישור נכשל");
    } finally {
      setApproving(false);
    }
  };

  const submitQuestionnaire = async () => {
    if (!formName.trim() || !formDate) {
      setError("יש למלא שם מלא ותאריך אירוע");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${token}/submit-questionnaire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: formName.trim(),
          clientPhone: formPhone.trim(),
          eventDate: formDate,
          eventStartTime: formStartTime || null,
          eventEndTime: formEndTime || null,
          eventLocation: formLocation.trim(),
          arrivalTime: formArrivalTime.trim(),
          notes: formNotes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שליחת הפרטים נכשלה");
      setClientAccessToken(data.clientAccessToken ?? null);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "שליחת הפרטים נכשלה");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white";

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <h1 className="text-[22px] font-bold mb-1 font-display">הצעת מחיר לצילום</h1>
      <p className="text-xs mb-5 text-ink-soft">מאת {photographerName}</p>

      {step === "view" && (
        <>
          <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
            <div className="text-xs text-ink-soft mb-1">עבור</div>
            <div className="text-sm font-semibold mb-3.5">{clientName}</div>

            {eventDateInterest && (
              <>
                <div className="text-xs text-ink-soft mb-1">תאריך משוער</div>
                <div className="text-sm mb-3.5">{new Date(eventDateInterest).toLocaleDateString("he-IL")}</div>
              </>
            )}

            {packageLabelText && (
              <>
                <div className="text-xs text-ink-soft mb-1">חבילה</div>
                <div className="text-sm mb-3.5">{packageLabelText}</div>
              </>
            )}

            <div className="text-xs text-ink-soft mb-1">מחיר</div>
            <div className="text-xl font-bold font-display mb-3.5">₪{quotedAmount.toLocaleString("he-IL")}</div>

            {quoteNote && (
              <>
                <div className="text-xs text-ink-soft mb-1">הערות</div>
                <div className="text-sm whitespace-pre-wrap">{quoteNote}</div>
              </>
            )}
          </div>

          {error && <p className="text-xs text-rose mb-3">{error}</p>}

          <button
            onClick={approve}
            disabled={approving}
            className="w-full rounded-xl py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60 mb-3"
          >
            {approving ? "מאשר..." : "אישור ההצעה"}
          </button>

          <div className="rounded-2xl p-4 bg-card border border-line shadow-card text-sm">
            שאלות לפני שמאשרים? צרו קשר עם {photographerName} בטלפון <span dir="ltr">{photographerPhone}</span>.
            {whatsappSignature && <div className="mt-2 text-xs text-ink-soft">{whatsappSignature}</div>}
          </div>
        </>
      )}

      {step === "questionnaire" && (
        <>
          <p className="text-sm mb-5 text-ink-soft">
            ההצעה אושרה 🎉 עוד רגע אחד — כמה פרטים על האירוע כדי שנפתח אותו במערכת.
          </p>
          <div className="rounded-2xl p-4 bg-card border border-line shadow-card space-y-2.5">
            <div>
              <label className="text-xs text-ink-soft block mb-1">שם מלא</label>
              <input value={formName} onChange={(e) => setFormName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-ink-soft block mb-1">טלפון</label>
              <input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} dir="ltr" className={`${inputClass} text-left font-data`} />
            </div>
            <div>
              <label className="text-xs text-ink-soft block mb-1">תאריך האירוע</label>
              <input value={formDate} onChange={(e) => setFormDate(e.target.value)} type="date" dir="ltr" className={`${inputClass} font-data`} />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <label className="text-xs text-ink-soft block mb-1">שעת התחלה</label>
                <input value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} type="time" dir="ltr" className={`${inputClass} font-data`} />
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-xs text-ink-soft block mb-1">שעת סיום</label>
                <input value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} type="time" dir="ltr" className={`${inputClass} font-data`} />
              </div>
            </div>
            <div>
              <label className="text-xs text-ink-soft block mb-1">מיקום האירוע</label>
              <input
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                placeholder="לדוגמה: אולם וגן אירועים"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-ink-soft block mb-1">שעת הגעה לצילומי משפחה (אופציונלי)</label>
              <input value={formArrivalTime} onChange={(e) => setFormArrivalTime(e.target.value)} type="time" dir="ltr" className={`${inputClass} font-data`} />
            </div>
            <div>
              <label className="text-xs text-ink-soft block mb-1">הערות נוספות (אופציונלי)</label>
              <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3} className={inputClass} />
            </div>

            {error && <p className="text-xs text-rose">{error}</p>}

            <button
              onClick={submitQuestionnaire}
              disabled={submitting}
              className="w-full rounded-xl py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
            >
              {submitting ? "שולח..." : "שליחת הפרטים"}
            </button>
          </div>
        </>
      )}

      {step === "done" && (
        <div className="rounded-2xl p-4 bg-card border border-line shadow-card text-center">
          <div className="text-lg font-bold font-display mb-2">תודה, האירוע נקבע! ✓</div>
          <p className="text-sm text-ink-soft mb-4">{photographerName} קיבל/ה את הפרטים והאירוע נכנס ליומן.</p>
          {clientAccessToken && (
            <a href={`/portal/${clientAccessToken}`} className="inline-block rounded-xl px-5 py-2.5 text-sm font-semibold bg-ink text-white">
              מעבר לעמוד האירוע שלכם
            </a>
          )}
        </div>
      )}
    </div>
  );
}
