"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MagnetApprovalChip from "@/components/magnetFrame/MagnetApprovalChip";
import SendForApprovalSheet, { canSendForApproval } from "@/components/magnetFrame/SendForApprovalSheet";
import type { MagnetClientInfo } from "@/lib/magnetApproval";
import { useLang, useT } from "@/i18n/client";
import { dateLocale } from "@/i18n/config";

// The client approval in the editor's title row (stage 3): where the frame stands with the client,
// the client's comment, and "שליחה ללקוח לאישור". Nothing when the frame has no event. Re-reads
// when the event changes, when the tab comes back into view, and every 30 seconds while it's shown,
// so an approval in the portal (or an edit after it) shows without a reload.
export default function ClientApprovalBar({ designId, eventId }: { designId: string; eventId: string | null }) {
  // A new event starts the bar afresh (its client, its status).
  return eventId ? <ApprovalBar key={eventId} designId={designId} eventId={eventId} /> : null;
}

function ApprovalBar({ designId, eventId }: { designId: string; eventId: string }) {
  const t = useT();
  const locale = dateLocale(useLang());
  const [info, setInfo] = useState<MagnetClientInfo | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [noContact, setNoContact] = useState(false);
  const alive = useRef(true);

  // A changed event is saved by the editor's own PATCH, which may land after this read: read again
  // (a few times) until the answer is about the event on the screen.
  const load = useCallback(async () => {
    for (let attempt = 0; attempt < 5 && alive.current; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 700));
      try {
        const res = await fetch(`/api/magnet-frames/${designId}/client`, { cache: "no-store" });
        if (!res.ok) return;
        const data: MagnetClientInfo = await res.json();
        if (data.client?.eventId === eventId) {
          if (alive.current) setInfo(data);
          return;
        }
      } catch {
        // Offline for a moment: the next read catches up.
        return;
      }
    }
  }, [designId, eventId]);

  useEffect(() => {
    alive.current = true;
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    onVisible();
    const timer = setInterval(onVisible, 30_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  if (!info?.client) return null;

  const shared = info.status !== "not_shared";
  const showComment = info.status === "comment" && !!info.comment;
  const send = () => {
    if (canSendForApproval(info)) setSheetOpen(true);
    else setNoContact(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 min-w-0 max-w-full">
      <MagnetApprovalChip status={info.status} />
      {showComment && (
        <div className="relative min-w-0">
          <button
            type="button"
            onClick={() => setCommentOpen((v) => !v)}
            aria-expanded={commentOpen}
            title={info.comment ?? undefined}
            className="block max-w-[14rem] sm:max-w-[18rem] truncate rounded-full px-2.5 py-1 text-xs text-ink border border-line bg-card"
          >
            <span dir="auto">&quot;{info.comment}&quot;</span>
          </button>
          {commentOpen && (
            <div
              role="dialog"
              aria-label={t("הערה מהלקוח")}
              className="absolute start-0 top-full mt-1.5 z-30 w-[min(320px,80vw)] rounded-xl p-3 bg-card border border-line shadow-sheet text-xs leading-relaxed"
              onClick={() => setCommentOpen(false)}
            >
              <div className="text-ink-soft mb-1">
                {t("הערה מהלקוח")}
                {info.commentAt ? ` · ${new Date(info.commentAt).toLocaleDateString(locale, { day: "numeric", month: "numeric", year: "numeric" })}` : ""}
              </div>
              <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere] text-ink">
                {info.comment}
              </p>
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={send}
        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${shared ? "bg-white border border-line text-ink" : "bg-ink text-white"}`}
      >
        {shared ? t("שליחה שוב ללקוח") : t("שליחה ללקוח לאישור")}
      </button>
      {noContact && (
        <span role="status" className="text-[11px] text-rose">
          {t("אין טלפון או מייל ללקוח")}
        </span>
      )}
      {sheetOpen && canSendForApproval(info) && (
        <SendForApprovalSheet designId={designId} info={info} onShared={() => void load()} onClose={() => setSheetOpen(false)} />
      )}
    </div>
  );
}
