"use client";

import { useState } from "react";

type SpreadPhoto = { id: string; url: string };
type Spread = { id: string; photo1: SpreadPhoto; photo2: SpreadPhoto | null; comments: { id: string; text: string }[] };

export default function GalleryAlbumProofing({
  token,
  status,
  spreads,
  onClose,
}: {
  token: string;
  status: "sent" | "approved" | "changes_requested";
  spreads: Spread[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [spreadComments, setSpreadComments] = useState(spreads.map((s) => s.comments));
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(status === "approved");
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);

  if (spreads.length === 0) return null;
  const spread = spreads[index];
  const comments = spreadComments[index];

  const goTo = (i: number) => setIndex(Math.max(0, Math.min(spreads.length - 1, i)));

  const submitComment = async () => {
    if (!commentText.trim()) return;
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
          {index + 1} / {spreads.length}
        </span>
      </div>

      {approved && (
        <div className="mx-4 mb-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-center bg-sage-bg text-sage">
          ✓ האלבום אושר
        </div>
      )}

      <div className="flex-1 flex items-center justify-center px-3 min-h-0">
        <div className="flex gap-1.5 h-full w-full items-center justify-center py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={spread.photo1.url} alt="" className={`h-full ${spread.photo2 ? "w-1/2" : "max-w-full"} object-contain`} />
          {spread.photo2 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={spread.photo2.url} alt="" className="h-full w-1/2 object-contain" />
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 py-2 shrink-0">
        <button
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
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
