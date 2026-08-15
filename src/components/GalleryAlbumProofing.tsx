"use client";

import { useState } from "react";

type SpreadPhoto = { id: string; url: string };
type SpreadLayout = "split" | "feature" | "stack" | "custom";

export type ClientAlbumElement =
  | {
      id: string;
      type: "photo";
      url: string;
      xPct: number;
      yPct: number;
      widthPct: number;
      heightPct: number;
      focalX: number;
      focalY: number;
      filter?: "none" | "bw" | "sepia";
      borderWidth?: number;
      borderColor?: string;
    }
  | { id: string; type: "text"; text: string; xPct: number; yPct: number; widthPct: number; fontSize: number; color: "white" | "black"; align: "right" | "center" | "left" };

export function cssFilterFor(filter: "none" | "bw" | "sepia" | undefined): string | undefined {
  if (filter === "bw") return "grayscale(1)";
  if (filter === "sepia") return "sepia(0.85)";
  return undefined;
}

type Spread = {
  id: string;
  photo1: SpreadPhoto;
  photo2: SpreadPhoto | null;
  layout: SpreadLayout;
  focalX1: number;
  focalY1: number;
  focalX2: number;
  focalY2: number;
  elements: ClientAlbumElement[];
  comments: { id: string; text: string }[];
};

function TextOverlay({ el }: { el: Extract<ClientAlbumElement, { type: "text" }> }) {
  return (
    <div
      className="absolute px-1 font-bold"
      style={{
        left: `${el.xPct}%`,
        top: `${el.yPct}%`,
        width: `${el.widthPct}%`,
        textAlign: el.align,
        color: el.color === "white" ? "#fff" : "#000",
        fontSize: `${el.fontSize}cqw`,
        textShadow: el.color === "white" ? "0 1px 4px rgba(0,0,0,0.7)" : "0 1px 4px rgba(255,255,255,0.7)",
      }}
    >
      {el.text}
    </div>
  );
}

export default function GalleryAlbumProofing({
  token,
  status,
  title,
  coverUrl,
  spreads,
  onClose,
}: {
  token: string;
  status: "sent" | "approved" | "changes_requested";
  title: string;
  coverUrl: string | null;
  spreads: Spread[];
  onClose: () => void;
}) {
  const hasCover = !!coverUrl;
  const [index, setIndex] = useState(hasCover ? -1 : 0);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [spreadComments, setSpreadComments] = useState(spreads.map((s) => s.comments));
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(status === "approved");
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);

  if (spreads.length === 0) return null;
  const onCover = index === -1;
  const spread = onCover ? null : spreads[index];
  const comments = onCover ? [] : spreadComments[index];

  const goTo = (i: number) => setIndex(Math.max(hasCover ? -1 : 0, Math.min(spreads.length - 1, i)));

  const submitComment = async () => {
    if (!commentText.trim() || !spread) return;
    setSubmittingComment(true);
    const res = await fetch(`/api/gallery/${token}/album/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spreadId: spread.id, text: commentText.trim() }),
    });
    setSubmittingComment(false);
    if (res.ok) {
      setSpreadComments((prev) =>
        prev.map((c, i) => (i === index ? [...c, { id: `local-${Date.now()}`, text: commentText.trim() }] : c))
      );
      setCommentText("");
    }
  };

  const approve = async () => {
    setApproving(true);
    await fetch(`/api/gallery/${token}/album/approve`, { method: "POST" });
    setApproving(false);
    setApproved(true);
    setConfirmApproveOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col select-none">
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button onClick={onClose} aria-label="סגירה" className="h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center text-lg">
          ✕
        </button>
        <span dir="ltr" className="text-xs font-semibold text-white/70 font-data tracking-wide">
          {onCover ? "שער" : `${index + 1} / ${spreads.length}`}
        </span>
      </div>

      {approved && (
        <div className="mx-4 mb-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-center bg-sage-bg text-sage">
          ✓ האלבום אושר
        </div>
      )}

      <div className="flex-1 flex items-center justify-center px-3 min-h-0">
        {onCover ? (
          <div className="relative h-full w-full flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl ?? undefined} alt="" className="h-full w-full object-contain" />
            <div className="absolute bottom-6 inset-x-0 text-center px-6">
              <p className="text-white text-lg font-bold font-display" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}>
                {title}
              </p>
            </div>
          </div>
        ) : spread!.layout === "custom" ? (
          <div className="relative w-full max-w-full aspect-[16/10]" style={{ containerType: "inline-size" }}>
            {spread!.elements.map((el) =>
              el.type === "photo" ? (
                <div
                  key={el.id}
                  className="absolute overflow-hidden"
                  style={{
                    left: `${el.xPct}%`,
                    top: `${el.yPct}%`,
                    width: `${el.widthPct}%`,
                    height: `${el.heightPct}%`,
                    outline: el.borderWidth ? `${el.borderWidth}px solid ${el.borderColor ?? "#fff"}` : undefined,
                    outlineOffset: el.borderWidth ? `-${el.borderWidth}px` : undefined,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={el.url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ objectPosition: `${el.focalX}% ${el.focalY}%`, filter: cssFilterFor(el.filter) }}
                  />
                </div>
              ) : (
                <TextOverlay key={el.id} el={el} />
              )
            )}
          </div>
        ) : spread!.photo2 ? (
          // Two photos share a spread — shown as a real "cover" crop (object-cover, aimed via the
          // photographer's chosen focal point) inside a fixed-ratio frame, rather than shrunk to
          // fit whole, so what the client approves here matches what the exported PDF prints.
          <div className="relative w-full max-w-full aspect-[16/10]" style={{ containerType: "inline-size" }}>
            <div className={`absolute inset-0 flex gap-1.5 ${spread!.layout === "stack" ? "flex-col" : "flex-row"}`}>
              <div className="relative overflow-hidden rounded-sm" style={{ flex: spread!.layout === "feature" ? 1.6 : 1 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={spread!.photo1.url}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ objectPosition: `${spread!.focalX1}% ${spread!.focalY1}%` }}
                />
              </div>
              <div className="relative overflow-hidden rounded-sm" style={{ flex: 1 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={spread!.photo2.url}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ objectPosition: `${spread!.focalX2}% ${spread!.focalY2}%` }}
                />
              </div>
            </div>
            {spread!.elements.filter((el) => el.type === "text").map((el) => (
              <TextOverlay key={el.id} el={el} />
            ))}
          </div>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center" style={{ containerType: "inline-size" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={spread!.photo1.url} alt="" className="h-full max-w-full object-contain" />
            {spread!.elements.filter((el) => el.type === "text").map((el) => (
              <TextOverlay key={el.id} el={el} />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 py-2 shrink-0">
        <button
          onClick={() => goTo(index - 1)}
          disabled={index === (hasCover ? -1 : 0)}
          className="h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center text-xl disabled:opacity-30"
        >
          ›
        </button>
        <button
          onClick={() => goTo(index + 1)}
          disabled={index === spreads.length - 1}
          className="h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center text-xl disabled:opacity-30"
        >
          ‹
        </button>
      </div>

      <div className="bg-white rounded-t-3xl p-4 pb-6 shrink-0 max-h-[38vh] overflow-y-auto">
        {comments.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {comments.map((c) => (
              <p key={c.id} className="text-sm rounded-lg px-3 py-2 bg-amber-bg text-amber-deep">
                {c.text}
              </p>
            ))}
          </div>
        )}
        {!approved && (
          <>
            {!onCover && (
              <div className="flex gap-2 mb-3">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="הערה על העמוד הזה..."
                  className="flex-1 rounded-lg px-3 py-2.5 text-sm border border-line bg-white"
                />
                <button
                  onClick={submitComment}
                  disabled={submittingComment || !commentText.trim()}
                  className="shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60"
                >
                  שליחה
                </button>
              </div>
            )}
            <button
              onClick={() => setConfirmApproveOpen(true)}
              className="w-full rounded-lg py-3 text-sm font-semibold bg-amber-deep text-white"
            >
              אישור העיצוב הסופי
            </button>
          </>
        )}
      </div>

      {confirmApproveOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center"
          style={{ background: "rgba(46,49,66,0.45)" }}
          onClick={() => setConfirmApproveOpen(false)}
        >
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-white" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 font-display">לאשר את עיצוב האלבום?</h2>
            <p className="text-sm text-ink-soft mb-5">לאחר האישור העיצוב יעבור להדפסה. עדיין אפשר לכתוב הערות, אך לא לבטל את האישור.</p>
            <div className="flex gap-2">
              <button
                onClick={approve}
                disabled={approving}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60"
              >
                {approving ? "שולח..." : "כן, מאשר/ת"}
              </button>
              <button
                onClick={() => setConfirmApproveOpen(false)}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink-soft"
              >
                חזרה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
