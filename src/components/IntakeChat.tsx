"use client";

import { useEffect, useRef, useState } from "react";

type Line = { role: "client" | "assistant"; text: string };

// Public chat with the intake assistant (עוזר פניות). The session token lives in localStorage so a
// reload continues the same conversation. When the assistant isn't available (off, plan, or the
// month's cap), the page shows the plain inquiry form instead — a client is never turned away.
export default function IntakeChat({ chatKey, studio, logoUrl, replyHours }: { chatKey: string; studio: string; logoUrl: string | null; replyHours: number }) {
  const storageKey = `intake-session:${chatKey}`;
  const greeting: Line = { role: "assistant", text: `היי! אני העוזר של ${studio}. ספרו לי על האירוע: מה חוגגים, ומתי?` };
  const [lines, setLines] = useState<Line[]>([greeting]);
  const [session, setSession] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(storageKey);
    } catch {}
    fetch(`/api/intake-chat/${encodeURIComponent(chatKey)}${saved ? `?session=${saved}` : ""}`)
      .then((r) => r.json())
      .then((data: { available?: boolean; transcript?: Line[]; state?: string | null }) => {
        if (saved && data.transcript && data.transcript.length > 0) {
          setSession(saved);
          setLines([greeting, ...data.transcript]);
          setState(data.state ?? null);
          setAvailable(true);
        } else {
          setAvailable(!!data.available);
        }
      })
      .catch(() => setAvailable(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines, sending]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setError(null);
    setLines((l) => [...l, { role: "client", text }]);
    setSending(true);
    try {
      const res = await fetch(`/api/intake-chat/${encodeURIComponent(chatKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, message: text }),
      });
      const data: { session?: string; reply?: string; state?: string; error?: string; unavailable?: string } = await res.json().catch(() => ({}));
      if (data.unavailable) {
        setAvailable(false);
        return;
      }
      if (!res.ok || !data.reply) {
        setError(data.error ?? "ההודעה לא נשלחה. נסו שוב");
        setLines((l) => l.slice(0, -1));
        setDraft(text);
        return;
      }
      if (data.session) {
        setSession(data.session);
        try {
          localStorage.setItem(storageKey, data.session);
        } catch {}
      }
      setState(data.state ?? null);
      setLines((l) => [...l, { role: "assistant", text: data.reply! }]);
    } catch {
      setError("אין חיבור. נסו שוב");
      setLines((l) => l.slice(0, -1));
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  const handedOff = state === "completed" || state === "waitlisted";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-paper text-ink" dir="rtl">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-line bg-card sticky top-0 z-10">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
        ) : (
          <span className="h-10 w-10 rounded-full flex items-center justify-center font-extrabold shrink-0 bg-amber-bg text-amber-deep">
            {studio.trim().slice(0, 2)}
          </span>
        )}
        <div className="min-w-0">
          <div className="font-bold truncate">{studio}</div>
          <div className="text-xs text-ink-soft">{available === false ? "טופס פנייה" : "עונה מיד"}</div>
        </div>
      </header>

      {available === false ? (
        <InquiryForm chatKey={chatKey} studio={studio} />
      ) : (
        <>
          <p className="text-[11.5px] text-ink-soft text-center px-4 py-2 bg-chip">
            העוזר האוטומטי של {studio}. {studio} עצמו חוזר אליכם עם הצעת מחיר.
          </p>
          <div className="flex-1 w-full max-w-xl mx-auto px-3 py-4 flex flex-col gap-2">
            {lines.map((line, i) => (
              <div
                key={i}
                className={`max-w-[86%] px-3 py-2 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] ${
                  line.role === "client" ? "self-end bg-ink text-paper rounded-tl-md" : "self-start bg-card border border-line rounded-tr-md"
                }`}
              >
                {line.text}
              </div>
            ))}
            {sending && (
              <div className="self-start bg-card border border-line rounded-2xl rounded-tr-md px-3 py-2 text-ink-soft text-sm" aria-live="polite">
                כותב…
              </div>
            )}
            {handedOff && (
              <div className="self-stretch text-center text-[12.5px] font-semibold rounded-xl px-3 py-2 bg-amber-bg text-amber-deep">
                הפרטים הועברו ל{studio} · תשובה תוך {replyHours} שעות
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="sticky bottom-0 bg-card border-t border-line px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))]">
            {error && <p className="text-xs text-rose mb-1.5 text-center">{error}</p>}
            <form
              className="max-w-xl mx-auto flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <label htmlFor="intake-msg" className="sr-only">
                הודעה
              </label>
              <input
                id="intake-msg"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={1000}
                placeholder="כתבו הודעה…"
                autoComplete="off"
                disabled={available === null}
                className="flex-1 min-w-0 rounded-full border border-line px-4 py-2.5 text-[15px]"
                style={{ background: "var(--color-input-bg)" }}
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                aria-label="שליחה"
                className="h-11 w-11 shrink-0 rounded-full bg-ink text-paper flex items-center justify-center disabled:opacity-40"
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 12H5M11 5l-7 7 7 7" />
                </svg>
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function InquiryForm({ chatKey, studio }: { chatKey: string; studio: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [eventType, setEventType] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 text-center">
        <div>
          <p className="text-lg font-bold mb-1">הפנייה נשלחה</p>
          <p className="text-sm text-ink-soft">{studio} יחזור אליך בהקדם.</p>
        </div>
      </div>
    );
  }

  const field = "w-full rounded-xl border border-line px-3.5 py-2.5 text-[15px]";
  return (
    <form
      className="w-full max-w-md mx-auto px-4 py-6 flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSending(true);
        setError(null);
        const res = await fetch(`/api/intake-chat/${encodeURIComponent(chatKey)}/form`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, phone, eventType, date, notes }),
        }).catch(() => null);
        setSending(false);
        if (res?.ok) setDone(true);
        else setError((await res?.json().catch(() => null))?.error ?? "השליחה נכשלה. נסו שוב");
      }}
    >
      <p className="text-sm text-ink-soft">השאירו פרטים ו{studio} יחזור אליכם עם כל המידע.</p>
      <label className="text-xs text-ink-soft" htmlFor="f-name">שם</label>
      <input id="f-name" required value={name} onChange={(e) => setName(e.target.value)} className={field} style={{ background: "var(--color-input-bg)" }} />
      <label className="text-xs text-ink-soft" htmlFor="f-phone">טלפון</label>
      <input id="f-phone" required type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} className={`${field} text-right`} style={{ background: "var(--color-input-bg)" }} />
      <label className="text-xs text-ink-soft" htmlFor="f-type">סוג האירוע</label>
      <input id="f-type" value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="חתונה, בר מצווה…" className={field} style={{ background: "var(--color-input-bg)" }} />
      <label className="text-xs text-ink-soft" htmlFor="f-date">תאריך</label>
      <input id="f-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} style={{ background: "var(--color-input-bg)" }} />
      <label className="text-xs text-ink-soft" htmlFor="f-notes">עוד פרטים</label>
      <textarea id="f-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${field} resize-none`} style={{ background: "var(--color-input-bg)" }} />
      {error && <p className="text-xs text-rose">{error}</p>}
      <button type="submit" disabled={sending} className="mt-1 rounded-xl py-3 font-bold bg-ink text-paper disabled:opacity-60">
        {sending ? "שולח…" : "שליחת פנייה"}
      </button>
    </form>
  );
}
