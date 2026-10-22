"use client";

import { useState } from "react";
import ToneTag from "@/components/ToneTag";
import { useVivid } from "@/components/VividProvider";
import { useLang, useT } from "@/i18n/client";
import { dateLocale, type Lang } from "@/i18n/config";
import { buildWaMeLink } from "@/lib/waLink";
import { quoteLinkMessage, quoteShareCaption } from "@/lib/quoteDefaults";
import { quoteDateDMY } from "@/lib/quoteHistory";
import { shortClientUrl } from "@/lib/shortLinks";
import { SITE_URL } from "@/lib/siteUrl";
import { eventQuoteTotal, type EventQuote } from "@/lib/eventQuote";

type PdfLink = { kind: "preparing" } | { kind: "ready"; message: string } | { kind: "error" };

// The quote the event was booked from, on the event page (owner, 2026-10-22: "כל ליד שנסגר ונוצר
// אירוע אוטומטי... הצעת המחיר תיכנס לכרטיס האירוע"). What was quoted, when it was sent and approved,
// and three ways to send it to the client again:
// - the link to the quote page, in one tap (the same page the client approved);
// - the PDF downloaded, then shared straight from a phone (sharing has to start from a tap, so
//   it's a button of its own once the file is ready, as in ContractSection);
// - the PDF as a 7-day download link in WhatsApp (api/quote-history/[id]/link): the first tap
//   prepares it, the second opens WhatsApp, since a browser only opens WhatsApp straight from a tap.
export default function EventQuoteSection({
  quote,
  clientName,
  clientPhone,
  signature,
  clientLang,
}: {
  quote: EventQuote;
  clientName: string;
  clientPhone: string | null;
  signature: string | null;
  clientLang: Lang;
}) {
  const t = useT();
  const lang = useLang();
  const vivid = useVivid();
  const locale = dateLocale(lang);
  const [pdfState, setPdfState] = useState<"idle" | "busy" | "failed">("idle");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfLink, setPdfLink] = useState<PdfLink | null>(null);

  const d = quote.details;
  const total = eventQuoteTotal(quote);
  const phone = (clientPhone ?? "").trim();
  const fmt = (n: number) => `${Math.round(n).toLocaleString(locale)} ₪`;
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale, { timeZone: "Asia/Jerusalem" });

  // The site's own address, not window.location: the link is in the page from the server render on.
  const linkMessage = quote.token
    ? quoteLinkMessage(
          quoteShareCaption(clientName, d?.eventType ?? "", quoteDateDMY(d?.eventDate) ?? "", clientLang, d?.eventDate),
          shortClientUrl(SITE_URL, "quote", quote.token),
          signature,
          false,
          clientLang,
          !!quote.approvedAt
        )
      : null;

  const downloadPdf = async () => {
    if (!quote.historyId) return;
    setPdfState("busy");
    try {
      const res = await fetch(`/api/quote-history/${quote.historyId}/pdf`);
      if (!res.ok) throw new Error();
      const name = `הצעת-מחיר-${clientName.trim() || quote.historyId.slice(0, 6)}.pdf`;
      const file = new File([await res.blob()], name, { type: "application/pdf" });
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setPdfFile(typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }) ? file : null);
      setPdfState("idle");
    } catch {
      setPdfState("failed");
    }
  };

  const sharePdf = async () => {
    if (!pdfFile) return;
    try {
      await navigator.share({ files: [pdfFile], title: pdfFile.name });
    } catch {
      // Closed without sharing.
    }
  };

  const preparePdfLink = async () => {
    if (!quote.historyId) return;
    setPdfLink({ kind: "preparing" });
    try {
      const res = await fetch(`/api/quote-history/${quote.historyId}/link`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.message) throw new Error();
      setPdfLink({ kind: "ready", message: data.message });
    } catch {
      setPdfLink({ kind: "error" });
    }
  };

  const btn = "w-full flex items-center justify-center rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60";

  return (
    <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{t("הצעת המחיר")}</div>
          {quote.sentAt && <div className="text-[11px] text-ink-soft mt-0.5">{t("נשלחה {date}", { date: day(quote.sentAt) })}</div>}
        </div>
        {quote.approvedAt &&
          (vivid ? (
            <ToneTag tone="paid">{t("אושרה {date}", { date: day(quote.approvedAt) })}</ToneTag>
          ) : (
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--color-sage-bg)", color: "var(--color-sage)" }}>
              {t("אושרה {date}", { date: day(quote.approvedAt) })}
            </span>
          ))}
      </div>

      {d && d.items.length > 0 && (
        <ul className="divide-y divide-[var(--color-line)] border-y border-line mb-2">
          {d.items.map((it, i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="[overflow-wrap:anywhere]">{it.item}</div>
                {it.details?.trim() && <div className="text-[11px] text-ink-soft [overflow-wrap:anywhere]">{it.details}</div>}
              </div>
              <span className="shrink-0 font-data">{fmt(Number(it.price))}</span>
            </li>
          ))}
        </ul>
      )}
      {d?.discount && d.discount.amount > 0 && (
        <div className="flex justify-between text-xs text-ink-soft mb-1">
          <span>{d.discount.type === "percent" ? t("הנחה {n}%", { n: d.discount.value }) : t("הנחה")}</span>
          <span className="font-data" style={{ color: "var(--color-amber-deep)" }}>
            {fmt(d.discount.amount)}
          </span>
        </div>
      )}
      {d?.showVat && d.vatAmount > 0 && (
        <div className="flex justify-between text-xs text-ink-soft mb-1">
          <span>{t("מע״מ 18%")}</span>
          <span className="font-data">{fmt(d.vatAmount)}</span>
        </div>
      )}
      {total != null && (
        <div className="flex justify-between items-baseline mb-3.5">
          <span className="text-sm font-semibold">{d?.showVat ? t("סה״כ כולל מע״מ") : t("סה״כ")}</span>
          <span className="text-base font-bold font-data text-amber-deep">{fmt(total)}</span>
        </div>
      )}

      <div className="space-y-2">
        {phone && linkMessage && (
          <a href={buildWaMeLink(phone, linkMessage)} target="_blank" rel="noopener noreferrer" className={`${btn} bg-ink text-white`}>
            {t("שליחת הקישור להצעה בוואטסאפ")}
          </a>
        )}
        {quote.historyId && (
          <>
            <button onClick={() => void downloadPdf()} disabled={pdfState === "busy"} className={`${btn} bg-white border border-line text-ink`}>
              {pdfState === "busy" ? t("מכין PDF...") : pdfState === "failed" ? t("נכשל, לנסות שוב") : t("הורדת הצעת המחיר (PDF)")}
            </button>
            {pdfFile && (
              <button onClick={() => void sharePdf()} className={`${btn} text-white`} style={{ background: "var(--color-sage)" }}>
                {t("שליחת הקובץ בוואטסאפ או שיתוף")}
              </button>
            )}
            {phone &&
              (pdfLink?.kind === "ready" ? (
                <a
                  href={buildWaMeLink(phone, pdfLink.message)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setPdfLink(null)}
                  className={`${btn} text-white`}
                  style={{ background: "var(--color-sage)" }}
                >
                  {t("פתיחת וואטסאפ עם ה-PDF")}
                </a>
              ) : (
                <button
                  onClick={() => void preparePdfLink()}
                  disabled={pdfLink?.kind === "preparing"}
                  className={`${btn} bg-white border border-line text-ink`}
                >
                  {pdfLink?.kind === "preparing" ? t("מכין קישור...") : pdfLink?.kind === "error" ? t("נכשל, לנסות שוב") : t("שליחת ה-PDF ללקוח בוואטסאפ")}
                </button>
              ))}
          </>
        )}
        {!phone && <p className="text-[11px] text-ink-soft">{t("אין טלפון ללקוח באירוע, ולכן אין שליחה בוואטסאפ.")}</p>}
      </div>
    </div>
  );
}
