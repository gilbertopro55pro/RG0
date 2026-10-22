"use client";

import { useEffect, useState } from "react";
import BodyPortal from "@/components/BodyPortal";
import MagnetFramePreview from "@/components/magnetFrame/MagnetFramePreview";
import { ALBUM_FONT_CLASS_NAMES } from "@/lib/albumFonts";
import { isSquareMagnetSize, magnetDesignDimensions, magnetSizeLabel } from "@/lib/magnetFrameShared";
import { MAGNET_COMMENT_MAX, PORTAL_MAGNETS_ANCHOR, type MagnetApprovalStatus } from "@/lib/magnetApproval";
import type { PortalMagnetFrame, PortalMagnetQrContext } from "@/lib/portalMagnetFrames";
import type { FrameOrientation } from "@/lib/types";
import { useLang, useT } from "@/i18n/client";
import { dateLocale } from "@/i18n/config";

// The magnet frames of the event in the client's portal (stage 3, owner 2026-10-22), like the album
// design approval: each frame as it will be printed (landscape and portrait, or the one square
// frame), tap to see it large, then approve it or write a comment. Shown only when the
// photographer shared a frame. Answers go to api/portal/<token>/magnet-frames/<id>.

type FrameState = Pick<PortalMagnetFrame, "status" | "approvedAt" | "comment" | "commentAt">;

// A size like "20×15" inside right-to-left text reads "15×20"; isolated left-to-right it stays in order.
function Dim({ children }: { children: string }) {
  return (
    <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
      {children}
    </span>
  );
}

function CloseGlyph() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function FrameView({ frame, orientation, qrContext }: { frame: PortalMagnetFrame; orientation: FrameOrientation; qrContext: PortalMagnetQrContext }) {
  return (
    <div style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.12), 0 4px 14px rgba(0,0,0,0.14)" }}>
      <MagnetFramePreview
        orientation={orientation}
        settings={frame.frameSettings}
        elements={orientation === "portrait" ? frame.portraitElements : frame.landscapeElements}
        customTextureUrl={frame.customTextureUrl}
        customElementUrls={frame.customElementUrls}
        qrContext={qrContext}
      />
    </div>
  );
}

// One frame large, on a dark layer (BodyPortal: the card is a glass layer that would trap it).
function Lightbox({
  frame,
  orientation: initial,
  qrContext,
  onClose,
}: {
  frame: PortalMagnetFrame;
  orientation: FrameOrientation;
  qrContext: PortalMagnetQrContext;
  onClose: () => void;
}) {
  const t = useT();
  const [orientation, setOrientation] = useState(initial);
  const square = isSquareMagnetSize(frame.frameSettings.sizeKey);
  const { widthPx, heightPx } = magnetDesignDimensions(orientation, frame.frameSettings.sizeKey);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <BodyPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("המגנטים לאירוע")}
        className={`fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 p-4 ${ALBUM_FONT_CLASS_NAMES}`}
        style={{ background: "rgba(20, 19, 17, 0.88)" }}
        onClick={onClose}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("סגירה")}
          className="absolute top-3 end-3 h-10 w-10 rounded-full flex items-center justify-center text-white"
          style={{ background: "rgba(255,255,255,0.14)" }}
        >
          <CloseGlyph />
        </button>
        {/* As large as the screen allows, keeping the frame's shape. */}
        <div onClick={(e) => e.stopPropagation()} style={{ width: `min(100%, calc((100dvh - ${square ? 96 : 150}px) * ${widthPx / heightPx}))` }}>
          <FrameView frame={frame} orientation={orientation} qrContext={qrContext} />
        </div>
        {!square && (
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            {(["landscape", "portrait"] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOrientation(o)}
                aria-pressed={orientation === o}
                className="rounded-full px-4 py-2 text-sm font-semibold"
                style={orientation === o ? { background: "#fff", color: "#1c1b19" } : { background: "rgba(255,255,255,0.14)", color: "#fff" }}
              >
                {o === "landscape" ? t("לרוחב") : t("לאורך")} · <Dim>{magnetSizeLabel(frame.frameSettings.sizeKey, o)}</Dim>
              </button>
            ))}
          </div>
        )}
      </div>
    </BodyPortal>
  );
}

function FrameCard({
  eventToken,
  frame,
  index,
  count,
  qrContext,
}: {
  eventToken: string;
  frame: PortalMagnetFrame;
  index: number;
  count: number;
  qrContext: PortalMagnetQrContext;
}) {
  const t = useT();
  const locale = dateLocale(useLang());
  const [state, setState] = useState<FrameState>({ status: frame.status, approvedAt: frame.approvedAt, comment: frame.comment, commentAt: frame.commentAt });
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"approve" | "comment" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState<FrameOrientation | null>(null);
  const sizeKey = frame.frameSettings.sizeKey;
  const square = isSquareMagnetSize(sizeKey);
  const orientations: FrameOrientation[] = square ? ["landscape"] : ["landscape", "portrait"];
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "numeric", year: "numeric" }) : "");

  const send = async (body: { action: "approve" } | { action: "comment"; text: string }) => {
    if (busy) return;
    setBusy(body.action);
    setError(null);
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(eventToken)}/magnet-frames/${frame.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: (Omit<FrameState, "status"> & { ok?: boolean; status: MagnetApprovalStatus }) | null = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error();
      setState({ status: data.status === "not_shared" ? "waiting" : data.status, approvedAt: data.approvedAt, comment: data.comment, commentAt: data.commentAt });
      setWriting(false);
      setText("");
    } catch {
      setError(t("לא הצלחנו לשמור. נסו שוב."));
    } finally {
      setBusy(null);
    }
  };

  const approveButton = (label: string) => (
    <button
      type="button"
      onClick={() => send({ action: "approve" })}
      disabled={!!busy}
      className="flex-1 min-w-[9rem] rounded-lg px-3.5 py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60"
    >
      {busy === "approve" ? t("מאשרים...") : label}
    </button>
  );
  const writeButton = (label: string) => (
    <button
      type="button"
      onClick={() => {
        setWriting(true);
        setError(null);
      }}
      className="flex-1 min-w-[9rem] rounded-lg px-3.5 py-2.5 text-sm font-semibold bg-white border border-line text-ink"
    >
      {label}
    </button>
  );

  return (
    <div className={index > 0 ? "pt-5 mt-5 border-t border-line" : ""}>
      {count > 1 && <div className="text-xs font-semibold text-ink-soft mb-2">{t("עיצוב {n}", { n: index + 1 })}</div>}

      {/* Side by side at the same height (each takes width by its shape); the square one alone. */}
      <div className={`flex items-end gap-3 sm:max-w-[38rem] ${square ? "justify-center sm:justify-start" : ""}`}>
        {orientations.map((o) => {
          const { widthPx, heightPx } = magnetDesignDimensions(o, sizeKey);
          return (
            <button
              key={o}
              type="button"
              onClick={() => setEnlarged(o)}
              aria-label={t("הגדלת המסגרת")}
              className="min-w-0 text-start"
              style={square ? { width: "min(70%, 15rem)" } : { flex: `${widthPx / heightPx} 1 0%` }}
            >
              <FrameView frame={frame} orientation={o} qrContext={qrContext} />
              <div className="text-[11px] text-ink-soft mt-1.5">
                {square ? null : <>{o === "landscape" ? t("לרוחב") : t("לאורך")} · </>}
                <Dim>{magnetSizeLabel(sizeKey, o)}</Dim>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-3.5 space-y-2.5 sm:max-w-[38rem]">
        {state.status === "approved" && (
          <div className="rounded-xl px-3.5 py-2.5 text-sm font-semibold" style={{ background: "var(--color-sage-bg)", color: "var(--color-sage)" }}>
            ✓ {t("אישרתם את העיצוב ב-{date}", { date: date(state.approvedAt) })}
          </div>
        )}
        {state.status === "changed_after_approval" && (
          <div className="rounded-xl px-3.5 py-2.5 text-sm" style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}>
            {t("העיצוב עודכן אחרי שאישרתם אותו. אפשר לאשר אותו שוב.")}
          </div>
        )}
        {state.status === "comment" && state.comment && (
          <div className="rounded-xl px-3.5 py-2.5 text-sm bg-chip">
            <div className="text-xs text-ink-soft mb-1">{t("ההערה שלכם נשלחה ב-{date}:", { date: date(state.commentAt) })}</div>
            <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              {state.comment}
            </p>
            <div className="text-xs text-ink-soft mt-1.5">{t("נעדכן את העיצוב ונשלח לכם הודעה.")}</div>
          </div>
        )}

        {writing ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) void send({ action: "comment", text });
            }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAGNET_COMMENT_MAX}
              rows={3}
              autoFocus
              dir="auto"
              placeholder={t("מה תרצו לשנות?")}
              aria-label={t("מה תרצו לשנות?")}
              className="w-full min-w-0 rounded-xl px-3.5 py-2.5 text-base sm:text-sm border border-line resize-y"
              style={{ background: "var(--color-input-bg)" }}
            />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={!!busy || !text.trim()} className="flex-1 min-w-[9rem] rounded-lg px-3.5 py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60">
                {busy === "comment" ? t("שולח...") : t("שליחת ההערה")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setWriting(false);
                  setError(null);
                }}
                className="flex-1 min-w-[9rem] rounded-lg px-3.5 py-2.5 text-sm font-semibold bg-white border border-line text-ink"
              >
                {t("ביטול")}
              </button>
            </div>
          </form>
        ) : state.status === "approved" ? (
          <button type="button" onClick={() => setWriting(true)} className="text-xs font-semibold text-ink-soft underline">
            {t("רוצים לשנות משהו? כתבו הערה")}
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            {approveButton(t("אישור העיצוב"))}
            {writeButton(state.status === "comment" ? t("הערה נוספת") : t("יש לי הערה"))}
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-rose">
            {error}
          </p>
        )}
      </div>

      {enlarged && <Lightbox frame={frame} orientation={enlarged} qrContext={qrContext} onClose={() => setEnlarged(null)} />}
    </div>
  );
}

export default function PortalMagnetFrames({
  eventToken,
  frames,
  qrContext,
}: {
  eventToken: string;
  frames: PortalMagnetFrame[];
  qrContext: PortalMagnetQrContext;
}) {
  const t = useT();
  if (frames.length === 0) return null;
  return (
    <section id={PORTAL_MAGNETS_ANCHOR} className={`rounded-2xl p-4 mb-5 bg-card border border-line shadow-card scroll-mt-4 ${ALBUM_FONT_CLASS_NAMES}`}>
      <div className="text-sm font-semibold mb-1">{t("המגנטים לאירוע")}</div>
      <p className="text-xs leading-relaxed text-ink-soft mb-4">
        {t("זה עיצוב המגנטים לאירוע שלכם. אם הכל נראה טוב, אשרו אותו. רוצים לשנות משהו? כתבו הערה.")}{" "}
        {t("התמונה מהאירוע תופיע במקום המשבצות. לחיצה על מסגרת מגדילה אותה.")}
      </p>
      {frames.map((frame, i) => (
        <FrameCard key={frame.id} eventToken={eventToken} frame={frame} index={i} count={frames.length} qrContext={qrContext} />
      ))}
    </section>
  );
}
