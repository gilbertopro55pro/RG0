"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildWaMeLink } from "@/lib/waLink";
import { quoteLinkMessage, quoteShareCaption } from "@/lib/quoteDefaults";
import { shortClientUrl } from "@/lib/shortLinks";
import { quoteDateDMY, type QuoteHistoryRow } from "@/lib/quoteHistory";
import { useLang, useT } from "@/i18n/client";
import { dateLocale, isLang } from "@/i18n/config";

type LeadLink = { id: string; quote_token: string | null; quote_approved_at: string | null; quote_details: { createdAt?: string } | null };
type SendState = { kind: "preparing" } | { kind: "ready"; message: string } | { kind: "error" };

const MAX_ROWS = 300;

function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  const next = { ...map };
  delete next[key];
  return next;
}

// The quote builder's "היסטוריה" tab (owner, 2026-10-17): every quote that went out, newest first
// (quote_history, migration 0183), each with a PDF download and a WhatsApp send to the phone on it.
// A quote whose client link still shows it (its lead's latest quote) is sent with that link, in one
// tap. Otherwise the link would show another quote or nothing, so the PDF goes as a download link:
// the first tap prepares it, the second opens WhatsApp (a browser only opens WhatsApp straight from
// a tap, not after waiting on the server).
export default function QuoteHistoryList({ signature }: { signature: string | null }) {
  const t = useT();
  const lang = useLang();
  const locale = dateLocale(lang);
  const [rows, setRows] = useState<QuoteHistoryRow[] | null>(null);
  const [leads, setLeads] = useState<Map<string, LeadLink>>(new Map());
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [pdfState, setPdfState] = useState<Record<string, "busy" | "failed">>({});
  const [sendState, setSendState] = useState<Record<string, SendState>>({});
  // Bumped by "נסו שוב" to load again.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("quote_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(MAX_ROWS)
        .returns<QuoteHistoryRow[]>();
      if (!alive) return;
      if (error || !data) {
        setLoadError(true);
        return;
      }
      // Each row's lead, to know whether its client link still shows that quote.
      const leadIds = [...new Set(data.map((r) => r.lead_id).filter((id): id is string => !!id))];
      const map = new Map<string, LeadLink>();
      if (leadIds.length > 0) {
        const { data: leadRows } = await supabase.from("leads").select("id, quote_token, quote_approved_at, quote_details").in("id", leadIds).returns<LeadLink[]>();
        for (const l of leadRows ?? []) map.set(l.id, l);
      }
      if (!alive) return;
      setLeads(map);
      setRows(data);
    })();
    return () => {
      alive = false;
    };
  }, [reload]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    if (!rows || !q) return rows ?? [];
    return rows.filter(
      (r) =>
        r.client_name.toLowerCase().includes(q) ||
        (r.details.eventType ?? "").toLowerCase().includes(q) ||
        (digits.length >= 3 && (r.client_phone ?? "").replace(/\D/g, "").includes(digits))
    );
  }, [rows, query]);

  // The lead whose client link still shows this exact quote (its latest one), if any.
  const liveLead = (r: QuoteHistoryRow): LeadLink | null => {
    const lead = r.lead_id ? leads.get(r.lead_id) : undefined;
    return lead?.quote_token && lead.quote_details?.createdAt && lead.quote_details.createdAt === r.details.createdAt ? lead : null;
  };

  const downloadPdf = async (r: QuoteHistoryRow) => {
    setPdfState((s) => ({ ...s, [r.id]: "busy" }));
    try {
      const res = await fetch(`/api/quote-history/${r.id}/pdf`);
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `הצעת-מחיר-${r.client_name || r.id.slice(0, 6)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setPdfState((s) => without(s, r.id));
    } catch {
      setPdfState((s) => ({ ...s, [r.id]: "failed" }));
    }
  };

  const preparePdfLink = async (r: QuoteHistoryRow) => {
    setSendState((s) => ({ ...s, [r.id]: { kind: "preparing" } }));
    try {
      const res = await fetch(`/api/quote-history/${r.id}/link`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.message) throw new Error();
      setSendState((s) => ({ ...s, [r.id]: { kind: "ready", message: data.message } }));
    } catch {
      setSendState((s) => ({ ...s, [r.id]: { kind: "error" } }));
    }
  };

  if (loadError) {
    return (
      <div className="rounded-lg border border-line bg-white p-4 text-center text-xs text-ink-soft">
        {t("טעינת ההיסטוריה נכשלה")}
        <button
          onClick={() => {
            setLoadError(false);
            setReload((n) => n + 1);
          }}
          className="block mx-auto mt-2 font-semibold text-ink underline"
        >
          {t("נסו שוב")}
        </button>
      </div>
    );
  }
  if (!rows) return <p className="text-xs text-ink-soft text-center py-6">{t("טוען...")}</p>;
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-white p-4 text-center text-xs text-ink-soft leading-relaxed">
        {t("עוד לא נשלחו הצעות מחיר. כל הצעה שתשלחו מכאן תופיע ברשימה הזו.")}
      </div>
    );
  }

  const btn = "flex-1 flex items-center justify-center rounded-lg py-1.5 text-xs font-semibold border disabled:opacity-60";

  return (
    <div>
      {rows.length > 5 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("חיפוש לפי שם, טלפון או סוג אירוע")}
          className="w-full rounded-lg px-2.5 py-1.5 mb-2.5 text-sm border border-line bg-white"
        />
      )}
      {shown.length === 0 && <p className="text-xs text-ink-soft text-center py-4">{t("לא נמצאו הצעות")}</p>}
      <ul className="space-y-2">
        {shown.map((r) => {
          const d = r.details;
          const lead = liveLead(r);
          const phone = (r.client_phone ?? "").trim();
          const clientLang = isLang(r.client_lang) ? r.client_lang : "he";
          const eventDate = quoteDateDMY(d.eventDate);
          const send = sendState[r.id];
          const pdf = pdfState[r.id];
          const linkMessage = lead
            ? quoteLinkMessage(
                quoteShareCaption(r.client_name, d.eventType ?? "", eventDate ?? "", clientLang, d.eventDate),
                shortClientUrl(window.location.origin, "quote", lead.quote_token!),
                signature,
                !!d.withContract,
                clientLang
              )
            : null;
          return (
            <li key={r.id} className="rounded-lg border border-line bg-white p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{r.client_name || t("לקוח/ה ללא שם")}</div>
                  <div className="text-[11px] text-ink-soft mt-0.5 [overflow-wrap:anywhere]">
                    {[d.eventType, eventDate, t("נשלחה {date}", { date: new Date(r.created_at).toLocaleDateString(locale) })].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="text-end shrink-0">
                  <div className="text-sm font-semibold font-data text-amber-deep">{`${Math.round(Number(r.total)).toLocaleString(locale)} ₪`}</div>
                  {lead?.quote_approved_at && (
                    <span className="inline-block mt-0.5 rounded-full px-1.5 py-px text-[10px] font-semibold" style={{ background: "var(--color-sage-bg)", color: "var(--color-sage)" }}>
                      {t("אושרה")}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => void downloadPdf(r)} disabled={pdf === "busy"} className={`${btn} bg-white border-line text-ink`}>
                  {pdf === "busy" ? t("מכין PDF...") : pdf === "failed" ? t("נכשל, לנסות שוב") : t("הורדת PDF")}
                </button>
                {!phone ? (
                  <span className={`${btn} border-line text-ink-soft opacity-60`} title={t("אין מספר טלפון בהצעה")}>
                    {t("אין טלפון")}
                  </span>
                ) : linkMessage ? (
                  <a href={buildWaMeLink(phone, linkMessage)} target="_blank" rel="noopener noreferrer" className={`${btn} bg-ink border-ink text-white`}>
                    {t("שליחה בוואטסאפ")}
                  </a>
                ) : send?.kind === "ready" ? (
                  <a
                    href={buildWaMeLink(phone, send.message)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setSendState((s) => without(s, r.id))}
                    className={`${btn} border-transparent text-white`}
                    style={{ background: "var(--color-sage)" }}
                  >
                    {t("פתיחת וואטסאפ")}
                  </a>
                ) : (
                  <button onClick={() => void preparePdfLink(r)} disabled={send?.kind === "preparing"} className={`${btn} bg-ink border-ink text-white`}>
                    {send?.kind === "preparing" ? t("מכין קישור...") : send?.kind === "error" ? t("נכשל, לנסות שוב") : t("שליחה בוואטסאפ")}
                  </button>
                )}
              </div>
              {!lead && phone && send?.kind === "ready" && (
                <p className="text-[11px] text-ink-soft mt-1.5 leading-relaxed">{t("ההצעה תישלח כקובץ PDF, כי הקישור הקודם של הלקוח כבר לא מציג אותה.")}</p>
              )}
            </li>
          );
        })}
      </ul>
      {rows.length >= MAX_ROWS && <p className="text-[11px] text-ink-soft text-center mt-2">{t("מוצגות {n} ההצעות האחרונות", { n: MAX_ROWS })}</p>}
    </div>
  );
}
