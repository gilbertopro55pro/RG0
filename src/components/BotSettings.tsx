"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { IntakeFaqItem, Photographer } from "@/lib/types";

const MAX_FAQ = 15;

// Settings → אוטומציה: the intake assistant (עוזר פניות, lib/intakeAssistant.ts). A public chat that
// answers new clients, checks the date and collects the event details — never prices — and hands
// the photographer a ready lead.
export default function BotSettings({
  photographer,
  cap,
  usedThisMonth,
  chatPath,
}: {
  photographer: Pick<Photographer, "id" | "name" | "intake_bot_enabled" | "intake_bot_faq" | "intake_bot_reply_hours" | "intake_bot_extra_question">;
  cap: number;
  usedThisMonth: number;
  chatPath: string;
}) {
  const [enabled, setEnabled] = useState(photographer.intake_bot_enabled);
  const [faq, setFaq] = useState<IntakeFaqItem[]>(photographer.intake_bot_faq?.length ? photographer.intake_bot_faq : []);
  const [replyHours, setReplyHours] = useState(photographer.intake_bot_reply_hours || 24);
  const [extraQuestion, setExtraQuestion] = useState(photographer.intake_bot_extra_question ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [greetingCopied, setGreetingCopied] = useState(false);

  if (cap <= 0) {
    return (
      <div className="rounded-2xl p-4 bg-card border border-line">
        <div className="text-sm font-semibold mb-1">עוזר פניות</div>
        <p className="text-xs text-ink-soft">
          עוזר שעונה ללקוחות חדשים מיד, בודק שהתאריך פנוי ואוסף את פרטי האירוע, ומעביר לך ליד מוכן להצעת מחיר. זמין במסלולי פרו ופרו+ (שדרוג בלשונית &quot;מנוי וצוות&quot;).
        </p>
      </div>
    );
  }

  const save = async (patch?: { intake_bot_enabled?: boolean }) => {
    setSaving(true);
    setStatus(null);
    const cleanFaq = faq
      .map((f) => ({ q: f.q.trim().slice(0, 200), a: f.a.trim().slice(0, 800) }))
      .filter((f) => f.q && f.a)
      .slice(0, MAX_FAQ);
    const { error } = await createClient()
      .from("photographers")
      .update({
        intake_bot_enabled: patch?.intake_bot_enabled ?? enabled,
        intake_bot_faq: cleanFaq,
        intake_bot_reply_hours: replyHours,
        intake_bot_extra_question: extraQuestion.trim().slice(0, 200) || null,
      })
      .eq("id", photographer.id);
    setSaving(false);
    setStatus(error ? "השמירה נכשלה. נסו שוב" : "נשמר");
    if (!error) setFaq(cleanFaq);
  };

  const fullLink = typeof window !== "undefined" ? `${window.location.origin}${chatPath}` : chatPath;
  const field = "w-full rounded-lg px-3 py-2 text-sm border border-line";
  // For the WhatsApp Business app's automatic greeting message (no Meta approval needed): sends
  // every new client straight to the assistant. The link shows a preview card (public/og/chat.png).
  const greeting = `היי, תודה שפניתם ל${photographer.name}! 📸
רוצים לדעת עכשיו אם התאריך שלכם פנוי?
בצ'אט הזה תקבלו תשובה תוך שניות, בלי לחכות:
👈 https://myframeflow.com${chatPath}
בודקים את התאריך, אוספים את הפרטים, והצעה אישית בדרך אליכם.
(ואפשר תמיד להמשיך לכתוב גם כאן)`;

  return (
    <div className="rounded-2xl bg-card border border-line overflow-hidden">
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold mb-1">עוזר פניות</div>
          <p className="text-xs text-ink-soft">
            עונה ללקוחות חדשים מיד, בודק שהתאריך פנוי ואוסף את פרטי האירוע. על מחירים הוא לא מדבר: הלקוח מקבל ממך הצעה אישית, וכל פנייה נכנסת ללידים.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="העוזר פעיל"
          disabled={saving}
          onClick={() => {
            const next = !enabled;
            setEnabled(next);
            save({ intake_bot_enabled: next });
          }}
          className="relative h-6 w-10 rounded-full shrink-0 transition-colors"
          style={{ background: enabled ? "var(--color-sage)" : "var(--color-chip)" }}
        >
          <span className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-all" style={enabled ? { left: 3 } : { right: 3 }} />
        </button>
      </div>

      <div className="px-4 py-3 border-t border-line">
        <div className="text-xs text-ink-soft mb-1.5">הקישור לשיחה (לשים באינסטגרם, בוואטסאפ ובאתר)</div>
        <div className="flex items-center gap-2">
          <span className="flex-1 min-w-0 truncate text-sm font-data" dir="ltr">
            {fullLink}
          </span>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(fullLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {}
            }}
            className="text-xs font-semibold rounded-lg px-3 py-1.5 border border-line shrink-0"
            style={{ background: "var(--color-input-bg)" }}
          >
            {copied ? "הועתק" : "העתקה"}
          </button>
          <a href={chatPath} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline underline-offset-2 shrink-0" style={{ color: "var(--color-amber-deep)" }}>
            לנסות
          </a>
        </div>
        <p className="text-xs text-ink-soft mt-2">
          <span className="font-data">{usedThisMonth}</span> מתוך <span className="font-data">{cap}</span> שיחות החודש. אחרי המכסה הלקוחות מקבלים טופס פנייה רגיל, ושום פנייה לא הולכת לאיבוד.
        </p>
      </div>

      <div className="px-4 py-3 border-t border-line">
        <div className="text-sm font-semibold mb-1">הודעת פתיחה לוואטסאפ העסקי</div>
        <p className="text-xs text-ink-soft mb-2">
          כל לקוח חדש שכותב לך בוואטסאפ יקבל אוטומטית את ההודעה הזו, עם הקישור לעוזר. באפליקציית WhatsApp Business: הגדרות › כלים לעסקים › הודעת פתיחה › להדליק ולהדביק.
        </p>
        <div className="rounded-xl border border-line p-3 text-sm whitespace-pre-line break-words" style={{ background: "var(--color-input-bg)" }}>
          {greeting}
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(greeting);
              setGreetingCopied(true);
              setTimeout(() => setGreetingCopied(false), 1500);
            } catch {}
          }}
          className="mt-2 text-xs font-semibold rounded-lg px-3 py-1.5 border border-line"
          style={{ background: "var(--color-input-bg)" }}
        >
          {greetingCopied ? "הועתק" : "העתקת ההודעה"}
        </button>
      </div>

      <div className="px-4 py-3 border-t border-line grid gap-3">
        <div>
          <label htmlFor="intake-hours" className="text-xs text-ink-soft block mb-1">
            תוך כמה זמן אני חוזר/ת עם הצעה (מופיע ללקוח)
          </label>
          <select id="intake-hours" value={replyHours} onChange={(e) => setReplyHours(Number(e.target.value))} className={field} style={{ background: "var(--color-input-bg)" }}>
            {[6, 12, 24, 48].map((h) => (
              <option key={h} value={h}>
                {h} שעות
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="intake-extra" className="text-xs text-ink-soft block mb-1">
            שאלה נוספת שהעוזר ישאל (לא חובה)
          </label>
          <input
            id="intake-extra"
            value={extraQuestion}
            onChange={(e) => setExtraQuestion(e.target.value)}
            maxLength={200}
            placeholder="למשל: רוצים גם מגנטים או אלבום?"
            className={field}
            style={{ background: "var(--color-input-bg)" }}
          />
        </div>
      </div>

      <div className="px-4 py-3 border-t border-line grid gap-2">
        <div className="text-sm font-semibold">שאלות נפוצות</div>
        <p className="text-xs text-ink-soft">העוזר עונה על שאלות כלליות רק מתוך מה שכתוב כאן. בלי מחירים.</p>
        {faq.map((item, i) => (
          <div key={i} className="rounded-xl border border-line p-3 grid gap-2" style={{ background: "var(--color-input-bg)" }}>
            <input
              aria-label={`שאלה ${i + 1}`}
              value={item.q}
              onChange={(e) => setFaq((f) => f.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))}
              placeholder="השאלה, למשל: מתי מקבלים את התמונות?"
              maxLength={200}
              className="w-full text-sm font-semibold bg-transparent border-b border-line pb-1.5"
            />
            <textarea
              aria-label={`תשובה ${i + 1}`}
              value={item.a}
              onChange={(e) => setFaq((f) => f.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))}
              placeholder="התשובה שלך"
              rows={2}
              maxLength={800}
              className="w-full text-sm bg-transparent resize-none"
            />
            <button type="button" onClick={() => setFaq((f) => f.filter((_, j) => j !== i))} className="text-xs text-rose justify-self-start">
              הסרה
            </button>
          </div>
        ))}
        {faq.length < MAX_FAQ && (
          <button type="button" onClick={() => setFaq((f) => [...f, { q: "", a: "" }])} className="text-sm font-semibold justify-self-start" style={{ color: "var(--color-amber-deep)" }}>
            + שאלה חדשה
          </button>
        )}
      </div>

      <div className="px-4 py-3 border-t border-line flex items-center gap-3">
        <button type="button" onClick={() => save()} disabled={saving} className="rounded-lg px-4 py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60">
          {saving ? "שומר…" : "שמירה"}
        </button>
        {status && <span className={`text-xs ${status === "נשמר" ? "text-sage" : "text-rose"}`}>{status}</span>}
      </div>

      <p className="px-4 pb-4 text-xs text-ink-soft">בקרוב: אותו עוזר גם בוואטסאפ העסקי.</p>
    </div>
  );
}
