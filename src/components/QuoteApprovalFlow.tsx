"use client";

import { useState } from "react";
import ContractSignForm from "@/components/ContractSignForm";
import type { EventContractRow } from "@/lib/types";
import {
  EVENING_PACKAGE_HOURS,
  EXTRA_HOUR_PRICE,
  extraHoursNotice,
  familyPhotosTime,
  MORNING_PACKAGE_HOURS,
  SLOT_HOURS,
  spanMinutes,
  type DaySlotKind,
  type LeadQuoteDetails,
} from "@/lib/leadQuote";
import { useLang, useT } from "@/i18n/client";
import { dateLocale, type Lang } from "@/i18n/config";
import type { TFn } from "@/i18n/translate";

// The client's quote page (/quotes/<token>), admin account for now. Designed like the quote PDF
// (lib/priceQuotePdf.ts, owner 2026-10-01: "more convenient for the client"): a navy header with
// the studio, the logo on a gold ring, a "לכבוד" card with the event, the line items, the totals and
// the notes; then "אישור ההצעה" and a short questionnaire that opens the event in the studio's
// calendar. The questionnaire starts from what's already known (the quote and the conversation)
// and the owner's hours (lib/leadQuote.ts): evening 19:00-00:00, morning 09:00-13:00, family photos
// 30 minutes before the start; hours past the package show the extra-cost notice.

type Step = "view" | "questionnaire" | "contract" | "done";

export type QuotePhotographer = {
  name: string;
  phone: string;
  email: string;
  businessId: string | null;
  taxStatus: "exempt" | "licensed" | null;
  logoUrl: string | null;
  whatsappSignature: string | null;
};

// Same palette as the PDF.
const NAVY = "#0b1220";
const TOTAL_NAVY = "#18243c";
const GOLD = "#8f6f2f";
const GOLD_DEEP = "#7c5f27";
const GOLD_LIGHT = "#c9a15a";
const PAPER = "#eef1f6";
const HAIRLINE = "#dce1ea";
const INK_SOFT = "#56607a";
const ON_NAVY_SOFT = "#aeb8cc";

// UI languages phase 2: the page follows the client's language (leads.client_lang via
// ClientLangScope in app/quotes/[token]/page.tsx). The quote's content (items, notes) stays as the
// photographer wrote it.
const money = (t: TFn, lang: Lang, n: number) => {
  const loc = dateLocale(lang);
  const amount = Math.round(n * 100) / 100 === Math.round(n) ? Math.round(n).toLocaleString(loc) : n.toLocaleString(loc);
  return t("{amount} ש״ח", { amount });
};

// The extra-hours notice as the client reads it, in their language. Same rule as
// lib/leadQuote.ts's extraHoursNotice (which stays the Hebrew text sent to the studio's event).
function hoursNoticeText(t: TFn, slot: DaySlotKind, start: string, end: string): string | null {
  const span = spanMinutes(start, end);
  if (span === null) return null;
  const packageHours = slot === "evening" ? EVENING_PACKAGE_HOURS : MORNING_PACKAGE_HOURS;
  const limit = packageHours * 60;
  if (span <= limit) return null;
  const hours = Math.ceil((span - limit) / 60);
  const extra = hours === 1 ? t("שעה נוספת") : t("{n} שעות נוספות", { n: hours });
  return slot === "evening"
    ? t("אירוע ערב הוא עד {n} שעות צילום. מעבר לזה יש תשלום נוסף של {price} ₪ לשעה לכל צלם ({extra}).", { n: EVENING_PACKAGE_HOURS, price: EXTRA_HOUR_PRICE, extra })
    : t("החבילות הן ל-{n} שעות צילום. מסגרת ארוכה יותר כרוכה בתשלום נוסף של {price} ₪ לשעה לכל צלם ({extra}).", { n: MORNING_PACKAGE_HOURS, price: EXTRA_HOUR_PRICE, extra });
}

function dmy(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : "";
}

export default function QuoteApprovalFlow({
  token,
  clientName,
  clientPhone,
  eventDateInterest,
  eventTypeName,
  photographer,
  quotedAmount,
  quoteNote,
  details,
  slot,
  knownLocation,
  initialApprovedAt,
  initialConvertedEventId,
  initialClientAccessToken,
  initialContract = null,
  businessRules = false,
  packageLabel = null,
}: {
  token: string;
  clientName: string;
  clientPhone: string | null;
  eventDateInterest: string | null;
  eventTypeName: string | null;
  photographer: QuotePhotographer;
  quotedAmount: number;
  quoteNote: string | null;
  details: LeadQuoteDetails | null;
  slot: DaySlotKind;
  knownLocation: string | null;
  initialApprovedAt: string | null;
  initialConvertedEventId: string | null;
  initialClientAccessToken: string | null;
  // Sent with a contract (details.withContract): the contract the questionnaire opened, if any yet.
  initialContract?: EventContractRow | null;
  // The owner's own hours rules (lib/leadQuote.ts: default evening/morning hours, family photos 30
  // minutes before, the extra-hours notice). Other photographers' clients get the plain times.
  businessRules?: boolean;
  // An amount-only quote (the leads page's quick form, no builder details): its package as one line.
  packageLabel?: string | null;
}) {
  const t = useT();
  const lang = useLang();
  const withContract = !!details?.withContract;
  const [contract, setContract] = useState<EventContractRow | null>(initialContract);
  const [step, setStep] = useState<Step>(
    initialConvertedEventId ? (initialContract && initialContract.status !== "signed" ? "contract" : "done") : initialApprovedAt ? "questionnaire" : "view"
  );
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientAccessToken, setClientAccessToken] = useState<string | null>(initialClientAccessToken);

  const eventDate = details?.eventDate || eventDateInterest || "";
  const rawEventType = details?.eventType || eventTypeName || "";
  // Standard event type names are in the dictionary; a name the photographer typed stays as is.
  const eventType = rawEventType ? t(rawEventType) : "";
  const location = details?.eventLocation || knownLocation || "";
  const notes = details?.notes ?? quoteNote ?? "";

  const [formName, setFormName] = useState(clientName);
  const [formPhone, setFormPhone] = useState(clientPhone ?? "");
  const [formDate, setFormDate] = useState(eventDate);
  const [formStartTime, setFormStartTime] = useState(details?.startTime || (businessRules ? SLOT_HOURS[slot].start : ""));
  const [formEndTime, setFormEndTime] = useState(details?.endTime || (businessRules ? SLOT_HOURS[slot].end : ""));
  const [formLocation, setFormLocation] = useState(location);
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const familyTime = businessRules ? familyPhotosTime(formStartTime) : null;
  // Hebrew, sent to the studio's event notes; the client sees hoursNoticeShown in their language.
  const hoursNotice = businessRules ? extraHoursNotice(slot, formStartTime, formEndTime) : null;
  const hoursNoticeShown = businessRules ? hoursNoticeText(t, slot, formStartTime, formEndTime) : null;

  const approve = async () => {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${token}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(t(data.error ?? "האישור נכשל"));
      setStep("questionnaire");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("האישור נכשל"));
    } finally {
      setApproving(false);
    }
  };

  const submitQuestionnaire = async () => {
    if (!formName.trim() || !formDate) {
      setError(t("יש למלא שם מלא ותאריך אירוע"));
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
          arrivalTime: familyTime,
          notes: formNotes.trim(),
          // What the client was told about the hours, so the studio sees it on the event.
          hoursNotice: hoursNotice ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(t(data.error ?? "שליחת הפרטים נכשלה"));
      setClientAccessToken(data.clientAccessToken ?? null);
      const next: EventContractRow | null = data.contract ?? null;
      setContract(next);
      setStep(next && next.status !== "signed" ? "contract" : "done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("שליחת הפרטים נכשלה"));
    } finally {
      setSubmitting(false);
    }
  };

  // qf-input: iOS Safari gives date/time fields a native minimum width that ignores w-full (the
  // date overflowed and the two time fields overlapped, owner's screenshot 2026-10-01); see the
  // <style> below.
  const inputClass = "qf-input block w-full min-w-0 rounded-lg px-3 py-2.5 text-base border bg-white outline-none focus:border-[#8f6f2f]";
  const label = "text-xs block mb-1";
  const taxLine = photographer.businessId
    ? photographer.taxStatus === "exempt"
      ? t("עוסק פטור {id}", { id: photographer.businessId })
      : t("עוסק מורשה {id}", { id: photographer.businessId })
    : null;
  const items = details?.items ?? (packageLabel ? [{ item: packageLabel, details: "", price: quotedAmount }] : []);

  return (
    <div className="min-h-screen w-full" style={{ background: "#f3f4f7" }}>
      <style>{`
        .qf-input[type="date"], .qf-input[type="time"] { -webkit-appearance: none; appearance: none; min-width: 0; max-width: 100%; min-height: 46px; }
        .qf-input::-webkit-date-and-time-value { text-align: ${lang === "he" ? "right" : "left"}; margin: 0; }
        .qf-input::-webkit-datetime-edit { padding: 0; }
      `}</style>
      <div className="max-w-[640px] mx-auto bg-white min-h-screen shadow-[0_0_40px_rgba(11,18,32,0.08)]">
        {/* Header, like the PDF */}
        <header className="relative px-6 sm:px-10 pt-8 pb-14" style={{ background: NAVY, borderBottom: `3px solid ${GOLD}` }}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-bold" style={{ color: GOLD_LIGHT }}>
                {t("הצעת מחיר")}
              </div>
              <div className="text-[26px] sm:text-[30px] font-bold text-white leading-tight mt-1 font-display">{photographer.name}</div>
              <div className="mt-2 space-y-0.5 text-[13px]" style={{ color: ON_NAVY_SOFT }}>
                {taxLine && <div>{taxLine}</div>}
                {photographer.phone && <div dir="ltr" className="text-start">{photographer.phone}</div>}
                {photographer.email && <div dir="ltr" className="text-start">{photographer.email}</div>}
              </div>
            </div>
            {details?.createdAt && (
              <div className="text-[13px] shrink-0" style={{ color: ON_NAVY_SOFT }}>
                {new Date(details.createdAt).toLocaleDateString(dateLocale(lang), { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, ".")}
              </div>
            )}
          </div>
          {/* Logo on a gold ring, overlapping the header's bottom edge */}
          <div
            className="absolute end-6 sm:end-10 -bottom-12 h-24 w-24 rounded-full bg-white flex items-center justify-center overflow-hidden"
            style={{ border: `3px solid ${GOLD}` }}
          >
            {photographer.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photographer.logoUrl} alt="" className="h-full w-full object-contain p-2" />
            ) : null}
          </div>
        </header>

        <main className="px-6 sm:px-10 pt-16 pb-10">
          {withContract && <StepsBar current={step === "view" ? 0 : step === "questionnaire" ? 1 : step === "contract" ? 2 : 3} />}
          {step === "view" && (
            <>
              {/* "לכבוד" card */}
              <section className="rounded-xl p-4 sm:p-5" style={{ background: PAPER, borderInlineStart: `4px solid ${GOLD}` }}>
                <div className="text-xs" style={{ color: INK_SOFT }}>
                  {t("לכבוד")}
                </div>
                <div className="text-xl font-bold mt-0.5" style={{ color: NAVY }}>
                  {clientName}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4">
                  {eventType && <Field labelText={t("סוג האירוע")} value={eventType} />}
                  {eventDate && <Field labelText={t("תאריך")} value={dmy(eventDate)} ltr />}
                  {location && <Field labelText={t("מיקום")} value={location} />}
                  {details?.startTime && details?.endTime && <Field labelText={t("שעות העבודה")} value={`${details.startTime}-${details.endTime}`} ltr />}
                </div>
              </section>

              {/* Line items */}
              {items.length > 0 && (
                <section className="mt-8">
                  <h2 className="text-base font-bold inline-block pb-1" style={{ color: GOLD_DEEP, borderBottom: `2px solid ${GOLD}` }}>
                    {t("פירוט ההצעה")}
                  </h2>
                  <div className="mt-3">
                    <div className="flex items-center text-xs font-semibold pb-2" style={{ color: INK_SOFT, borderBottom: `1.5px solid ${NAVY}` }}>
                      <span className="flex-1">{t("פריט")}</span>
                      <span className="w-24 text-end">{t("מחיר")}</span>
                    </div>
                    {items.map((it, i) => (
                      <div key={i} className="flex items-start py-3 text-[15px]" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
                        <span className="flex-1 min-w-0">
                          <span className="font-semibold" style={{ color: NAVY }}>
                            {it.item}
                          </span>
                          {it.details && it.details !== "1" && (
                            <span className="block text-xs mt-0.5" style={{ color: INK_SOFT }}>
                              {it.details}
                            </span>
                          )}
                        </span>
                        <span className="w-24 text-end shrink-0" style={{ color: NAVY }}>
                          {money(t, lang, it.price)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Totals */}
              <section className="mt-6 rounded-xl p-3 sm:max-w-[300px]" style={{ background: PAPER }}>
                {details?.showVat !== false && details && (
                  <>
                    <div className="flex justify-between px-2 py-1.5 text-sm" style={{ color: INK_SOFT }}>
                      <span>{t("סה״כ לפני מע״מ")}</span>
                      <span style={{ color: NAVY }}>{money(t, lang, details.subtotal)}</span>
                    </div>
                    <div className="flex justify-between px-2 py-1.5 text-sm" style={{ color: INK_SOFT }}>
                      <span>{t("מע״מ 18%")}</span>
                      <span style={{ color: NAVY }}>{money(t, lang, details.vatAmount)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between items-center rounded-lg px-4 py-3 mt-1.5" style={{ background: TOTAL_NAVY }}>
                  <span className="text-sm font-bold text-white">{!details || details.showVat === false ? t("לתשלום") : t("לתשלום, כולל מע״מ")}</span>
                  <span className="text-xl font-bold" style={{ color: GOLD_LIGHT }}>
                    {money(t, lang, details?.total ?? quotedAmount)}
                  </span>
                </div>
              </section>

              {notes && (
                <section className="mt-8">
                  <h2 className="text-base font-bold inline-block pb-1" style={{ color: GOLD_DEEP, borderBottom: `2px solid ${GOLD}` }}>
                    {t("הערות")}
                  </h2>
                  <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: NAVY }}>
                    {notes}
                  </p>
                </section>
              )}

              {error && <p className="text-sm text-rose mt-6">{error}</p>}
              <button
                onClick={approve}
                disabled={approving}
                className="w-full rounded-xl py-4 mt-8 text-base font-bold text-white disabled:opacity-60"
                style={{ background: NAVY }}
              >
                {approving ? t("מאשר...") : t("אישור ההצעה")}
              </button>
              <p className="mt-4 text-sm text-center leading-relaxed" style={{ color: INK_SOFT }}>
                {t("שאלות לפני שמאשרים?")} {photographer.name}, <span dir="ltr">{photographer.phone}</span>
                {photographer.whatsappSignature && <span className="block text-xs mt-1">{photographer.whatsappSignature}</span>}
              </p>
            </>
          )}

          {step === "questionnaire" && (
            <>
              <h2 className="text-xl font-bold font-display" style={{ color: NAVY }}>
                {t("ההצעה אושרה, תודה!")}
              </h2>
              <p className="text-[15px] mt-1 mb-5" style={{ color: INK_SOFT }}>
                {t("עוד רגע אחד: נבדוק יחד את פרטי האירוע, והוא ייכנס ליומן של {name}.", { name: photographer.name })}
              </p>
              <div className="space-y-3.5">
                <div>
                  <label className={label} style={{ color: INK_SOFT }}>
                    {t("שם מלא")}
                  </label>
                  <input value={formName} onChange={(e) => setFormName(e.target.value)} className={inputClass} style={{ borderColor: HAIRLINE }} />
                </div>
                <div>
                  <label className={label} style={{ color: INK_SOFT }}>
                    {t("טלפון")}
                  </label>
                  <input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} dir="ltr" className={`${inputClass} text-left`} style={{ borderColor: HAIRLINE }} />
                </div>
                <div>
                  <label className={label} style={{ color: INK_SOFT }}>
                    {t("תאריך האירוע")}
                  </label>
                  <input value={formDate} onChange={(e) => setFormDate(e.target.value)} type="date" dir="ltr" className={inputClass} style={{ borderColor: HAIRLINE }} />
                </div>
                <div>
                  <label className={label} style={{ color: INK_SOFT }}>
                    {t("מיקום האירוע")}
                  </label>
                  <input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder={t("לדוגמה: אולם וגן אירועים")} className={inputClass} style={{ borderColor: HAIRLINE }} />
                </div>

                <div className="rounded-xl p-4" style={{ background: PAPER }}>
                  <div className="text-sm font-bold mb-0.5" style={{ color: NAVY }}>
                    {t("שעות הצילום")}
                    {businessRules ? ` (${slot === "evening" ? t("אירוע ערב") : t("אירוע בוקר")})` : ""}
                  </div>
                  <p className="text-xs mb-3" style={{ color: INK_SOFT }}>
                    {t("אפשר לשנות לפי מה שמתאים לכם.")}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <label className={label} style={{ color: INK_SOFT }}>
                        {t("תחילת האירוע")}
                      </label>
                      <input value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} type="time" dir="ltr" className={inputClass} style={{ borderColor: HAIRLINE }} />
                    </div>
                    <div className="min-w-0">
                      <label className={label} style={{ color: INK_SOFT }}>
                        {t("סיום")}
                      </label>
                      <input value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} type="time" dir="ltr" className={inputClass} style={{ borderColor: HAIRLINE }} />
                    </div>
                  </div>
                  {familyTime && (
                    <p className="text-sm mt-3" style={{ color: NAVY }}>
                      {t("צילומי משפחה:")} <span dir="ltr" className="font-bold">{familyTime}</span>
                      <span className="text-xs" style={{ color: INK_SOFT }}>
                        {" "}
                        {t("(30 דקות לפני תחילת האירוע)")}
                      </span>
                    </p>
                  )}
                  {hoursNoticeShown && (
                    <p className="text-sm mt-3 rounded-lg px-3 py-2.5 leading-relaxed" style={{ background: "#fbf3e2", color: GOLD_DEEP, border: `1px solid #ead9b5` }}>
                      {hoursNoticeShown}
                    </p>
                  )}
                </div>

                <div>
                  <label className={label} style={{ color: INK_SOFT }}>
                    {t("הערות נוספות (אופציונלי)")}
                  </label>
                  <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3} className={inputClass} style={{ borderColor: HAIRLINE }} />
                </div>

                {error && <p className="text-sm text-rose">{error}</p>}
                <button onClick={submitQuestionnaire} disabled={submitting} className="w-full rounded-xl py-4 text-base font-bold text-white disabled:opacity-60" style={{ background: NAVY }}>
                  {submitting ? t("שולח...") : t("שליחת הפרטים")}
                </button>
              </div>
            </>
          )}

          {step === "contract" && contract && (
            <>
              <h2 className="text-xl font-bold font-display" style={{ color: NAVY }}>
                {t("שלב אחרון: חתימה על החוזה")}
              </h2>
              <p className="text-[15px] mt-1 mb-5" style={{ color: INK_SOFT }}>
                {t("האירוע נכנס ליומן של {name}. נשאר רק לקרוא את החוזה ולחתום עליו.", { name: photographer.name })}
              </p>
              <ContractSignForm
                contract={contract}
                onSigned={(signed) => {
                  setContract(signed);
                  setTimeout(() => {
                    setStep("done");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }, 1200);
                }}
              />
            </>
          )}

          {step === "done" && (
            <div className="text-center py-6">
              <div className="text-2xl font-bold font-display" style={{ color: NAVY }}>
                {t("תודה, האירוע נקבע!")}
              </div>
              <p className="text-[15px] mt-2 mb-6" style={{ color: INK_SOFT }}>
                {t("{name} קיבל את הפרטים, והאירוע נכנס ליומן.", { name: photographer.name })}
                {contract?.status === "signed" ? ` ${t("החוזה נחתם.")}` : ""}
              </p>
              {clientAccessToken && (
                <a href={`/portal/${clientAccessToken}`} className="inline-block rounded-xl px-6 py-3 text-base font-bold text-white" style={{ background: NAVY }}>
                  {t("מעבר לעמוד האירוע שלכם")}
                </a>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Field({ labelText, value, ltr }: { labelText: string; value: string; ltr?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-xs" style={{ color: INK_SOFT }}>
        {labelText}
      </div>
      <div className="text-[15px] font-bold mt-0.5 break-words" style={{ color: NAVY }}>
        <span dir={ltr ? "ltr" : undefined}>{value}</span>
      </div>
    </div>
  );
}

// Approve, details, contract: shown only when the quote was sent with a contract.
function StepsBar({ current }: { current: number }) {
  const t = useT();
  const steps = [t("אישור ההצעה"), t("פרטי האירוע"), t("חתימה")];
  return (
    <ol className="flex items-center gap-1.5 mb-6 text-xs" aria-label={t("שלבים")}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-1.5 flex-1 min-w-0">
            <span
              className="h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold"
              style={{ background: done || active ? NAVY : HAIRLINE, color: done || active ? "#fff" : INK_SOFT }}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className="truncate font-semibold" style={{ color: active ? NAVY : INK_SOFT }}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
