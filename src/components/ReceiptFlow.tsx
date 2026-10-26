"use client";

import { useState } from "react";
import BodyPortal from "@/components/BodyPortal";
import { openWhatsApp } from "@/lib/waLink";
import { useT } from "@/i18n/client";
import { RECEIPT_PAYMENT_METHODS, type ReceiptPaymentMethod } from "@/lib/paymentDocuments";
import type { PaymentField } from "@/lib/eventQuickActions";

// The receipt screen (owner, 2026-10-08), shared by the event page's payments and the home screen's
// quick actions (lib/eventQuickActions.ts): the photographer picks the name, how the client paid and
// types the amount; no email is needed to issue. Then a second step offers sending it: email (with
// the PDF attached), WhatsApp (to the client's chat, with the link), or the phone's share sheet (the
// PDF file itself, to any app). `fixedAmount` (the quick actions): the receipt is for exactly the
// amount marked as paid without a receipt (`suggested`), not typed.
export default function ReceiptFlow({
  eventId,
  field,
  suggested,
  clientName,
  eventType,
  clientPhone,
  clientEmail,
  fixedAmount = false,
  onIssued,
  onEmailSaved,
  onClose,
}: {
  eventId: string;
  field: PaymentField;
  suggested: number;
  clientName: string;
  eventType: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  fixedAmount?: boolean;
  // The event_payments columns the receipt changed (its link and covered amount, and the payment
  // marking when it covered more than was marked).
  onIssued: (patch: Record<string, unknown>) => void;
  onEmailSaved?: (email: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<{
    name: string;
    // What the payment was for: the receipt's item line ("צילום בר מצווה").
    details: string;
    method: ReceiptPaymentMethod;
    other: string;
    amount: string;
  }>(() => ({
    name: clientName,
    // Starts from the event's type (the receipt is in Hebrew, so is this), editable.
    details: eventType?.trim() ? `צילום ${eventType.trim()}` : "",
    method: "bit",
    other: "",
    amount: fixedAmount ? String(suggested) : "",
  }));
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    documentUrl: string;
    shareText: string;
    file: File | null;
    fileState: "loading" | "ready" | "failed";
    emailOpen: boolean;
    email: string;
    sending: boolean;
    sent: boolean;
    error: string | null;
  } | null>(null);

  const submit = async () => {
    const amount = fixedAmount ? suggested : Number(draft.amount);
    if (!draft.name.trim()) return setError(t("נא למלא שם לקוח/ה"));
    if (!draft.details.trim()) return setError(t("נא למלא על מה התשלום"));
    if (!(amount > 0)) return setError(t("יש להזין סכום גדול מ-0"));
    if (draft.method === "other" && !draft.other.trim()) return setError(t("נא לכתוב את אמצעי התשלום"));
    setIssuing(true);
    setError(null);
    const res = await fetch(`/api/events/${eventId}/issue-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field,
        customerName: draft.name.trim(),
        details: draft.details.trim(),
        amount,
        paymentMethod: draft.method,
        paymentOther: draft.other.trim(),
        receivedOnly: fixedAmount,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setIssuing(false);
    if (!res.ok) {
      setError(data.error ? t(data.error) : t("הפקת המסמך נכשלה"));
      return;
    }
    onIssued({ ...(data.patch ?? {}), [`${field}_document_url`]: data.documentUrl, [`${field}_documented_amount`]: data.documentedAmount ?? null });
    setDone({
      documentUrl: data.documentUrl,
      shareText: data.shareText ?? data.documentUrl,
      file: null,
      fileState: "loading",
      emailOpen: false,
      email: clientEmail ?? "",
      sending: false,
      sent: false,
      error: null,
    });
    // The PDF is fetched right away, so the share sheet can open with it on the tap itself.
    fetch(`/api/events/${eventId}/receipt-file?field=${field}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("no pdf");
        const blob = await r.blob();
        const file = new File([blob], `${t("קבלה")} - ${draft.name.trim()}.pdf`, { type: "application/pdf" });
        setDone((d) => (d ? { ...d, file, fileState: "ready" } : d));
      })
      .catch(() => setDone((d) => (d ? { ...d, fileState: "failed" } : d)));
  };

  const sendEmail = async () => {
    if (!done) return;
    const email = done.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setDone({ ...done, error: t("כתובת מייל לא תקינה") });
      return;
    }
    setDone({ ...done, sending: true, error: null });
    const res = await fetch(`/api/events/${eventId}/send-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDone((d) => (d ? { ...d, sending: false, error: data.error ? t(data.error) : t("שליחת המייל נכשלה") } : d));
      return;
    }
    onEmailSaved?.(email);
    setDone((d) => (d ? { ...d, sending: false, sent: true, emailOpen: false } : d));
  };

  const sendWhatsApp = () => {
    if (!done) return;
    if (clientPhone) openWhatsApp(clientPhone, done.shareText);
    else window.open(`https://wa.me/?text=${encodeURIComponent(done.shareText)}`, "_blank");
  };

  const share = async () => {
    if (!done) return;
    const { file, shareText } = done;
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText });
        return;
      }
      if (navigator.share) {
        await navigator.share({ text: shareText });
        return;
      }
      await navigator.clipboard.writeText(shareText);
      setDone({ ...done, error: t("הקישור לקבלה הועתק") });
    } catch {
      // Closed by the user.
    }
  };

  if (done) {
    return (
      <BodyPortal>
        <div className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={onClose}>
          <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 pb-8 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 mb-1">
              <span className="h-8 w-8 rounded-full flex items-center justify-center text-white" style={{ background: "var(--color-sage)" }}>✓</span>
              <h2 className="text-lg font-bold font-display">{t("הקבלה הופקה")}</h2>
            </div>
            <p className="text-xs text-ink-soft mb-4">
              {t("איך לשלוח אותה ללקוח/ה?")}{" "}
              <a href={done.documentUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-amber-deep underline underline-offset-2">
                {t("צפייה בקבלה")}
              </a>
            </p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <button
                onClick={() => setDone({ ...done, emailOpen: !done.emailOpen, error: null })}
                className={`rounded-xl border py-3 text-sm font-semibold ${done.emailOpen ? "border-ink bg-ink text-white" : "border-line bg-white"}`}
              >
                {done.sent ? `✓ ${t("מייל")}` : t("מייל")}
              </button>
              <button onClick={sendWhatsApp} className="rounded-xl border border-line bg-white py-3 text-sm font-semibold">
                {t("וואטסאפ")}
              </button>
              <button onClick={share} disabled={done.fileState === "loading"} className="rounded-xl border border-line bg-white py-3 text-sm font-semibold disabled:opacity-60">
                {done.fileState === "loading" ? t("מכין קובץ…") : t("אחר")}
              </button>
            </div>
            {done.emailOpen && (
              <div className="flex gap-2 mb-3">
                <input
                  type="email"
                  dir="ltr"
                  value={done.email}
                  onChange={(e) => setDone({ ...done, email: e.target.value })}
                  placeholder="example@gmail.com"
                  autoFocus
                  className="flex-1 min-w-0 rounded-lg px-3 py-2.5 text-sm border border-line bg-white text-start"
                />
                <button onClick={sendEmail} disabled={done.sending} className="shrink-0 rounded-lg px-4 text-sm font-semibold bg-ink text-white disabled:opacity-60">
                  {done.sending ? t("שולח...") : t("שליחה")}
                </button>
              </div>
            )}
            {done.sent && <p className="text-xs mb-2" style={{ color: "var(--color-sage)" }}>{t("הקבלה נשלחה במייל")}</p>}
            {done.error && <p className="text-xs text-rose mb-2">{done.error}</p>}
            <p className="text-[11px] text-ink-soft mb-4">
              {done.fileState === "failed"
                ? t("לא הצלחנו להכין את קובץ ה-PDF, אז הקבלה תישלח כקישור.")
                : t("במייל ובאחר הקבלה נשלחת כקובץ PDF. בוואטסאפ נשלח קישור לקבלה, ישר לצ׳אט של הלקוח/ה. לשליחת הקובץ עצמו בוואטסאפ: אחר ← וואטסאפ.")}
            </p>
            <button onClick={onClose} className="w-full rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft">
              {t("סגירה")}
            </button>
          </div>
        </div>
      </BodyPortal>
    );
  }

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={() => !issuing && onClose()}>
        <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 pb-8 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-bold mb-1 font-display">{t("הפקת קבלה")}</h2>
          <p className="text-xs text-ink-soft mb-4">{t("הפרטים כאן הם מה שיופיע בקבלה. אחרי ההפקה אפשר לשלוח אותה במייל, בוואטסאפ או בכל אפליקציה.")}</p>
          <label className="block mb-3">
            <span className="text-xs font-semibold text-ink-soft">{t("שם הלקוח/ה")}</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="w-full mt-1 rounded-lg px-3 py-2.5 text-sm border border-line bg-white"
            />
          </label>
          <label className="block mb-3">
            <span className="text-xs font-semibold text-ink-soft">{t("פרטים")}</span>
            <input
              value={draft.details}
              onChange={(e) => setDraft({ ...draft, details: e.target.value })}
              placeholder={t("למשל: צילום בר מצווה, צילום חתונה")}
              maxLength={200}
              className="w-full mt-1 rounded-lg px-3 py-2.5 text-sm border border-line bg-white"
            />
          </label>
          <div className="mb-3">
            <span className="text-xs font-semibold text-ink-soft">{t("אמצעי תשלום")}</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {RECEIPT_PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setDraft({ ...draft, method: m.id })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${draft.method === m.id ? "bg-ink text-white border-ink" : "bg-white border-line text-ink"}`}
                >
                  {t(m.label)}
                </button>
              ))}
            </div>
            {draft.method === "other" && (
              <input
                value={draft.other}
                onChange={(e) => setDraft({ ...draft, other: e.target.value })}
                placeholder={t("למשל: צ׳ק, כרטיס אשראי")}
                autoFocus
                className="w-full mt-2 rounded-lg px-3 py-2.5 text-sm border border-line bg-white"
              />
            )}
          </div>
          {fixedAmount ? (
            <div className="mb-4 rounded-xl px-3.5 py-2.5 bg-card border border-line">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold text-ink-soft">{t("סכום הקבלה")}</span>
                <span className="text-base font-bold font-data">₪{suggested.toLocaleString()}</span>
              </div>
              <p className="text-[11px] text-ink-soft mt-1">{t("הסכום שסומן כשולם ועוד לא הופקה עליו קבלה.")}</p>
            </div>
          ) : (
            <label className="block mb-4">
              <span className="text-xs font-semibold text-ink-soft">{t("סכום (₪)")}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                placeholder={suggested > 0 ? t("התקבל ועוד בלי קבלה: {amount}", { amount: `₪${suggested.toLocaleString()}` }) : t("כמה שולם?")}
                className="w-full mt-1 rounded-lg px-3 py-2.5 text-sm border border-line bg-white font-data"
              />
            </label>
          )}
          {error && <p className="text-xs text-rose mb-3">{error}</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={issuing} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60">
              {issuing ? t("מפיק...") : t("הפקת קבלה")}
            </button>
            <button onClick={onClose} disabled={issuing} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft">
              {t("ביטול")}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
