"use client";

import { useState } from "react";
import { useModalEntered } from "@/lib/useModalEntered";
import { IconClose } from "@/components/icons/AlbumIcons";

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const entered = useModalEntered();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setSent(false);
    setMessage("");
    setError(null);
  };

  const submit = async () => {
    if (!message.trim()) return;
    setSending(true);
    setError(null);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? "שליחת ההודעה נכשלה");
      return;
    }
    setSent(true);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-40 h-11 w-11 rounded-full flex items-center justify-center bg-ink text-white shadow-sheet"
        aria-label="הצעות ורעיונות לשיפור"
      >
        💡
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{
            background: "rgba(46,49,66,0.45)",
            backdropFilter: entered ? "blur(16px)" : "blur(0px)",
            WebkitBackdropFilter: entered ? "blur(16px)" : "blur(0px)",
            transition: "backdrop-filter 280ms ease, -webkit-backdrop-filter 280ms ease",
          }}
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold font-display">הצעות ורעיונות לשיפור</h2>
              <button
                onClick={close}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>

            {sent ? (
              <div className="rounded-xl px-3.5 py-4 text-sm bg-sage-bg text-sage text-center">
                תודה! ההודעה נשלחה אלינו
              </div>
            ) : (
              <>
                <p className="text-xs mb-4 text-ink-soft">
                  יש לך רעיון לפיצ&apos;ר חדש, בקשה לשיפור, או משהו שלא עבד כמו שציפית? נשמח לשמוע
                  ההודעה תישלח ישירות לצוות הפיתוח.
                </p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white resize-none"
                  placeholder="כתבו כאן את ההצעה או הבקשה שלכם..."
                />
                {error && <p className="text-xs text-rose mt-2">{error}</p>}
                <button
                  onClick={submit}
                  disabled={sending}
                  className="w-full rounded-lg py-3 text-sm font-semibold mt-3 bg-ink text-white disabled:opacity-60"
                >
                  {sending ? "שולח..." : "שליחה"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
