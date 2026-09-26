"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { IntakeFaqItem, Photographer } from "@/lib/types";
import { GREETING_MAX_CHARS, chatLinkFor, defaultWhatsAppGreeting } from "@/lib/intakeGreeting";
import { SOURCE_LINKS } from "@/lib/leadSource";

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
  photographer: Pick<Photographer, "id" | "name" | "intake_bot_enabled" | "intake_bot_faq" | "intake_bot_reply_hours" | "intake_bot_extra_question" | "intake_whatsapp_greeting" | "meta_pixel_id" | "intake_allow_split_day" | "intake_shabbat_closed">;
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
  const [pixelId, setPixelId] = useState(photographer.meta_pixel_id ?? "");
  const [splitDay, setSplitDay] = useState(!!photographer.intake_allow_split_day);
  const [shabbatClosed, setShabbatClosed] = useState(!!photographer.intake_shabbat_closed);
  const [copiedSource, setCopiedSource] = useState<string | null>(null);
  const defaultGreeting = defaultWhatsAppGreeting(photographer.name, chatPath);
  const [greeting, setGreeting] = useState(photographer.intake_whatsapp_greeting?.trim() || defaultGreeting);
  const [savedGreeting, setSavedGreeting] = useState(greeting);
  const [greetingBusy, setGreetingBusy] = useState<"save" | "ai" | null>(null);
  const [greetingStatus, setGreetingStatus] = useState<string | null>(null);

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
        meta_pixel_id: /^\d{8,20}$/.test(pixelId.trim()) ? pixelId.trim() : null,
        intake_allow_split_day: splitDay,
        intake_shabbat_closed: shabbatClosed,
      })
      .eq("id", photographer.id);
    setSaving(false);
    setStatus(error ? "השמירה נכשלה. נסו שוב" : "נשמר");
    if (!error) setFaq(cleanFaq);
  };

  const fullLink = typeof window !== "undefined" ? `${window.location.origin}${chatPath}` : chatPath;
  const field = "w-full rounded-lg px-3 py-2 text-sm border border-line";
  // WhatsApp Business greeting (no Meta approval needed): sends every new client to the assistant.
  // The chat link shows as a preview card (public/og/chat.png).
  const saveGreeting = async () => {
    setGreetingBusy("save");
    setGreetingStatus(null);
    const text = greeting.trim().slice(0, GREETING_MAX_CHARS);
    const { error } = await createClient()
      .from("photographers")
      .update({ intake_whatsapp_greeting: text === defaultGreeting ? null : text })
      .eq("id", photographer.id);
    setGreetingBusy(null);
    if (error) {
      setGreetingStatus("השמירה נכשלה. נסו שוב");
      return;
    }
    setSavedGreeting(text);
    setGreetingStatus("נשמר");
  };
  const rewriteGreeting = async () => {
    setGreetingBusy("ai");
    setGreetingStatus(null);
    const res = await fetch("/api/intake-bot/greeting-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: greeting }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setGreetingBusy(null);
    if (!res?.ok || !json.text) {
      setGreetingStatus(json.error ?? "הניסוח לא זמין כרגע. נסו שוב");
      return;
    }
    setGreeting(json.text);
    setGreetingStatus("נוסח מחדש. אפשר לערוך, ואז לשמור");
  };

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
        <div className="text-sm font-semibold mb-1">קישורים לפי מקור</div>
        <p className="text-xs text-ink-soft mb-2">
          אותו עוזר, קישור אחר לכל ערוץ. כך בעמוד הלידים רואים מאיפה הגיעה כל פנייה (הודעת הפתיחה לוואטסאפ והכפתור בפורטפוליו כבר מסומנים).
        </p>
        <div className="grid gap-1.5">
          {SOURCE_LINKS.map(({ src, label }) => {
            const url = `${chatLinkFor(chatPath)}?src=${src}`;
            return (
              <div key={src} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold">{label}</div>
                  <div className="text-xs text-ink-soft font-data truncate" dir="ltr">
                    {url}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(url);
                      setCopiedSource(src);
                      setTimeout(() => setCopiedSource(null), 1500);
                    } catch {}
                  }}
                  className="text-xs font-semibold rounded-lg px-3 py-1.5 border border-line shrink-0"
                  style={{ background: "var(--color-input-bg)" }}
                >
                  {copiedSource === src ? "הועתק" : "העתקה"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-3 border-t border-line">
        <div className="text-sm font-semibold mb-1">הודעת פתיחה לוואטסאפ העסקי</div>
        <p className="text-xs text-ink-soft mb-2">
          כל לקוח חדש שכותב לך בוואטסאפ יקבל אוטומטית את ההודעה הזו, עם הקישור לעוזר. באפליקציית WhatsApp Business: הגדרות › כלים לעסקים › הודעת פתיחה › להדליק ולהדביק.
        </p>
        <textarea
          aria-label="הודעת הפתיחה"
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          rows={7}
          maxLength={GREETING_MAX_CHARS}
          className="w-full rounded-xl border border-line p-3 text-sm resize-y"
          style={{ background: "var(--color-input-bg)" }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveGreeting}
            disabled={greetingBusy !== null || greeting.trim() === savedGreeting}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-ink text-white disabled:opacity-50"
          >
            {greetingBusy === "save" ? "שומר…" : "שמירה"}
          </button>
          <button
            type="button"
            onClick={rewriteGreeting}
            disabled={greetingBusy !== null || !greeting.trim()}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-line disabled:opacity-50"
            style={{ background: "var(--color-input-bg)", color: "var(--color-amber-deep)" }}
          >
            {greetingBusy === "ai" ? "מנסח…" : "✦ ניסוח עם AI"}
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(greeting);
                setGreetingCopied(true);
                setTimeout(() => setGreetingCopied(false), 1500);
              } catch {}
            }}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-line"
            style={{ background: "var(--color-input-bg)" }}
          >
            {greetingCopied ? "הועתק" : "העתקה"}
          </button>
          {greeting.trim() !== defaultGreeting && (
            <button type="button" onClick={() => setGreeting(defaultGreeting)} className="text-xs text-ink-soft underline underline-offset-2">
              חזרה לנוסח המקורי
            </button>
          )}
        </div>
        {greetingStatus && <p className={`mt-1.5 text-xs ${greetingStatus === "נשמר" || greetingStatus.startsWith("נוסח") ? "text-sage" : "text-rose"}`}>{greetingStatus}</p>}
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
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={splitDay} onChange={(e) => setSplitDay(e.target.checked)} className="mt-1" />
          <span>
            אירוע בוקר ואירוע ערב באותו יום
            <span className="block text-xs text-ink-soft">
              אירוע בוקר (07:30 עד 15:00, למשל עלייה לתורה) ואירוע ערב (18:00 עד 00:00) לא חוסמים זה את זה בבדיקת התאריך. אירוע בלי שעות, או אירוע שנמשך כל היום, חוסם את כל היום.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={shabbatClosed} onChange={(e) => setShabbatClosed(e.target.checked)} className="mt-1" />
          <span>
            לא מצלם בשבת
            <span className="block text-xs text-ink-soft">ביום שישי רק אירוע בוקר (עד 16:00). שישי בערב ושבת מסומנים כלא זמינים.</span>
          </span>
        </label>
        <div>
          <label htmlFor="intake-pixel" className="text-xs text-ink-soft block mb-1">
            מזהה Meta Pixel (לא חובה)
          </label>
          <input
            id="intake-pixel"
            value={pixelId}
            onChange={(e) => setPixelId(e.target.value.replace(/\D/g, "").slice(0, 20))}
            inputMode="numeric"
            dir="ltr"
            placeholder="למשל 1234567890123456"
            className={`${field} font-data`}
            style={{ background: "var(--color-input-bg)" }}
          />
          <p className="text-xs text-ink-soft mt-1">מדווח למטא על כל ליד שהעוזר יוצר, כדי שהמודעות ילמדו למצוא לקוחות שמשאירים פרטים. המספר נמצא במנהל האירועים של מטא.</p>
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
