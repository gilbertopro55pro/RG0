"use client";

import { useCallback, useEffect, useState } from "react";
import type { PrintSend } from "@/app/api/galleries/[id]/album/print-sends/route";
import { formatPrintDate, formatPrintDay } from "@/lib/printHouseLinks";
import { useT } from "@/i18n/client";

// Previous print-house sends for one gallery, with whether the print house downloaded the files
// (tracked through /print/<token>, migration 0140). Renews an expired link while the file still
// exists, or sends the album again once the file was deleted.
export default function PrintHouseSendsHistory({ galleryId, refreshKey = 0 }: { galleryId: string; refreshKey?: number }) {
  const t = useT();
  const [sends, setSends] = useState<PrintSend[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // When the list was loaded — what "expired" is measured against.
  const [loadedAt, setLoadedAt] = useState(0);

  const fetchSends = useCallback(
    () =>
      fetch(`/api/galleries/${galleryId}/album/print-sends`)
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null)
        .then((data: { sends?: PrintSend[] } | null) => ({ sends: data?.sends ?? [], at: Date.now() })),
    [galleryId]
  );
  const load = useCallback(() => {
    fetchSends().then((r) => {
      setSends(r.sends);
      setLoadedAt(r.at);
    });
  }, [fetchSends]);

  useEffect(() => {
    let cancelled = false;
    fetchSends().then((r) => {
      if (cancelled) return;
      setSends(r.sends);
      setLoadedAt(r.at);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchSends, refreshKey]);

  if (!sends || sends.length === 0) return null;

  const renew = async (s: PrintSend) => {
    setBusyId(s.id);
    setMessage(null);
    const res = await fetch(`/api/galleries/${galleryId}/album/print-sends/${s.id}/renew`, { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setBusyId(null);
    if (!res?.ok) {
      setMessage(data?.error ?? t("חידוש הקישור נכשל"));
      return;
    }
    setMessage(t("הקישור חודש עד {date}. אותו קישור מהמייל עובד שוב.", { date: formatPrintDay(data.linkExpiresAt) }));
    load();
  };

  const resend = async (s: PrintSend) => {
    setBusyId(s.id);
    setMessage(null);
    const res = await fetch(`/api/galleries/${galleryId}/album/send-to-print-house`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: s.email, from: s.fromPage, to: s.toPage, notes: s.notes ?? undefined }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setBusyId(null);
    if (!res?.ok) {
      setMessage(data?.error ?? t("השליחה נכשלה"));
      return;
    }
    setMessage(t("הקבצים מוכנים מחדש ויישלחו במייל לבית הדפוס בעוד כמה דקות."));
    load();
  };

  const copy = async (s: PrintSend) => {
    if (!s.linkUrl) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${s.linkUrl}`);
      setMessage(t("הקישור הועתק"));
    } catch {
      setMessage(`${window.location.origin}${s.linkUrl}`);
    }
  };

  return (
    <div className="mt-4">
      <div className="text-xs font-semibold text-ink-soft mb-2">{t("שליחות קודמות")}</div>
      <div className="space-y-2">
        {sends.map((s) => {
          const expired = !!s.linkExpiresAt && new Date(s.linkExpiresAt).getTime() < loadedAt;
          const preparing = s.status === "pending" || s.status === "processing";
          const failed = s.status === "failed" || s.status === "cancelled";
          let status: string;
          let tone = "text-ink-soft";
          if (preparing) status = t("הקבצים בהכנה, המייל יישלח בסיום");
          else if (failed) {
            status = t("השליחה נכשלה");
            tone = "text-rose";
          } else if (s.downloadCount > 0) {
            status =
              t("✓ בית הדפוס הוריד את הקבצים ב-{date}", { date: formatPrintDate(s.firstDownloadedAt!) }) +
              (s.downloadCount > 1 ? t(" ({n} הורדות)", { n: s.downloadCount }) : "");
            tone = "text-sage font-semibold";
          } else status = s.linkUrl ? t("נשלח, עוד לא הורד") : t("נשלח (שליחה ישנה, בלי מעקב הורדה)");

          return (
            <div key={s.id} className="rounded-lg border border-line bg-white p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold truncate" dir="auto">
                  {s.label || s.email}
                </span>
                <span className="text-[11px] text-ink-soft shrink-0">{formatPrintDate(s.createdAt)}</span>
              </div>
              <div className={`text-xs mt-1 ${tone}`}>{status}</div>
              {!preparing && !failed && s.linkExpiresAt && (
                <div className="text-[11px] text-ink-soft mt-0.5">
                  {expired
                    ? t("הקישור פג תוקף ב-{date}", { date: formatPrintDay(s.linkExpiresAt) })
                    : t("הקישור בתוקף עד {date}", { date: formatPrintDay(s.linkExpiresAt) })}
                  {!s.fileAvailable && t(" · הקבצים כבר נמחקו מהשרת")}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {s.linkUrl && s.fileAvailable && !preparing && !failed && (
                  <>
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => renew(s)}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-line bg-chip disabled:opacity-50"
                    >
                      {expired ? t("חידוש הקישור לשבוע") : t("הארכת הקישור בשבוע")}
                    </button>
                    {!expired && (
                      <button type="button" onClick={() => copy(s)} className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-line bg-chip">
                        {t("העתקת הקישור")}
                      </button>
                    )}
                  </>
                )}
                {!preparing && (failed || !s.fileAvailable || (expired && !s.linkUrl)) && (
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => resend(s)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-line bg-chip disabled:opacity-50"
                  >
                    {t("שליחה מחדש")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {message && <p className="text-xs text-ink-soft mt-2">{message}</p>}
    </div>
  );
}
