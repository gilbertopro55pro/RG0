"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CLIENT_MESSAGE_INSERT_OPTIONS,
  CUSTOMIZABLE_MESSAGE_STAGES,
  RECOMMENDED_CLIENT_MESSAGE_TEMPLATES,
  DEFAULT_CLIENT_MESSAGE_TEMPLATE,
  STAGE_LABELS,
  type StageKey,
} from "@/lib/stages";
import type { ClientMessageTemplateRow } from "@/lib/types";

const EMOJI_OPTIONS = [
  "📸", "🎉", "✅", "💐", "🥂", "📅", "💌", "🙏",
  "😊", "❤️", "👏", "🎊", "📷", "✨", "💍", "👰",
  "🤵", "🎈", "🎁", "🌸", "🥳", "💯", "🔔", "📍",
];

function recommendedFor(key: StageKey): string {
  return RECOMMENDED_CLIENT_MESSAGE_TEMPLATES[key] ?? DEFAULT_CLIENT_MESSAGE_TEMPLATE;
}

export default function ClientMessagesSettings({ initialTemplates }: { initialTemplates: ClientMessageTemplateRow[] }) {
  const supabase = createClient();
  const [bodies, setBodies] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const key of CUSTOMIZABLE_MESSAGE_STAGES) map[key] = recommendedFor(key);
    for (const row of initialTemplates) {
      if (CUSTOMIZABLE_MESSAGE_STAGES.includes(row.stage_key as StageKey)) map[row.stage_key] = row.body;
    }
    return map;
  });
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [aiLoadingKey, setAiLoadingKey] = useState<string | null>(null);
  const [aiErrorKey, setAiErrorKey] = useState<string | null>(null);
  const [emojiOpenKey, setEmojiOpenKey] = useState<string | null>(null);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Inserts the token/emoji at the cursor position (or replaces a selection) in that stage's own
  // textarea, so the photographer never has to remember or type the {{...}} syntax by hand.
  const insertToken = (key: StageKey, token: string) => {
    const el = textareaRefs.current[key];
    const current = bodies[key] ?? "";
    if (!el) {
      setBodies((prev) => ({ ...prev, [key]: current + token }));
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    setBodies((prev) => ({ ...prev, [key]: next }));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const askAi = async (key: StageKey) => {
    setAiLoadingKey(key);
    setAiErrorKey(null);
    try {
      const res = await fetch("/api/client-message-templates/ai-rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageLabel: STAGE_LABELS[key], currentText: bodies[key] }),
      });
      const data = await res.json();
      if (!res.ok || !data.text) throw new Error(data.error ?? "שגיאה");
      setBodies((prev) => ({ ...prev, [key]: data.text }));
    } catch {
      setAiErrorKey(key);
    } finally {
      setAiLoadingKey(null);
    }
  };

  const save = async (key: StageKey) => {
    setSavingKey(key);
    setErrorKey(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSavingKey(null);
      setErrorKey(key);
      return;
    }
    const body = bodies[key].trim() || recommendedFor(key);
    const { error } = await supabase
      .from("client_message_templates")
      .upsert({ photographer_id: user.id, stage_key: key, body, updated_at: new Date().toISOString() }, { onConflict: "photographer_id,stage_key" });
    setSavingKey(null);
    if (error) {
      setErrorKey(key);
      return;
    }
    setBodies((prev) => ({ ...prev, [key]: body }));
    setSavedKey(key);
    setTimeout(() => setSavedKey((cur) => (cur === key ? null : cur)), 2000);
  };

  const resetToDefault = (key: StageKey) => {
    setBodies((prev) => ({ ...prev, [key]: recommendedFor(key) }));
  };

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="text-sm font-semibold tracking-wide mb-1">הודעות ללקוח/ה</div>
      <div className="text-xs text-ink-soft leading-relaxed mb-3.5 space-y-1">
        <p>כאן אפשר לערוך את נוסח ההודעה שנשלחת ללקוח/ה דרך כפתור &quot;שליחת עדכון ללקוח בוואטסאפ&quot; בכל שלב — הנוסח שנשמר הוא בדיוק מה שיישלח בפועל.</p>
        <p><span className="font-data">{"{{שם}}"}</span> — מוסיף את שם הלקוח מתוך כרטיס האירוע.</p>
        <p><span className="font-data">{"{{שלב}}"}</span> — מוסיף את שם השלב מתוך החבילה.</p>
        <p><span className="font-data">קישור:</span> — יוסיף מיד אחריו את הקישור הרלוונטי.</p>
      </div>
      <p className="text-xs text-ink-soft leading-relaxed mb-3.5">
        אם שמרתם חתימה אישית בלשונית &quot;פרופיל&quot;, היא תתווסף אוטומטית בשורה האחרונה של כל הודעה, עם שורה ריקה מפרידה — אין צורך לכתוב אותה כאן בעצמכם.
      </p>

      <div className="space-y-3">
        {CUSTOMIZABLE_MESSAGE_STAGES.map((key) => {
          const isDefault = bodies[key] === recommendedFor(key);
          return (
            <div key={key} className="rounded-xl p-3 bg-chip relative">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold">{STAGE_LABELS[key]}</span>
                {!isDefault && (
                  <button onClick={() => resetToDefault(key)} className="text-[11px] text-ink-soft whitespace-nowrap shrink-0">
                    איפוס לנוסח המומלץ
                  </button>
                )}
              </div>
              <textarea
                ref={(el) => {
                  textareaRefs.current[key] = el;
                }}
                value={bodies[key]}
                onChange={(e) => setBodies((prev) => ({ ...prev, [key]: e.target.value }))}
                rows={4}
                className="w-full rounded-lg px-2.5 py-2 text-sm border border-line bg-white leading-relaxed"
              />
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <select
                  value=""
                  onChange={(e) => {
                    const token = e.target.value;
                    if (!token) return;
                    const opt = CLIENT_MESSAGE_INSERT_OPTIONS.find((o) => o.token === token);
                    // "קישור" is already self-labeled ("קישור: ") — every other tag gets its
                    // label prefixed so the sent message reads "תאריך האירוע: 25.8.2026" and not
                    // just the bare value.
                    const insertText = opt && opt.token !== "קישור: " ? `${opt.label}: ${opt.token}` : token;
                    insertToken(key, insertText);
                  }}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-white border border-line text-ink-soft"
                >
                  <option value="" disabled>
                    + הוספת פרט
                  </option>
                  {CLIENT_MESSAGE_INSERT_OPTIONS.map((opt) => (
                    <option key={opt.token} value={opt.token}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setEmojiOpenKey((cur) => (cur === key ? null : key))}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-white border border-line text-ink-soft"
                >
                  😀 אימוג׳י
                </button>
                <button
                  type="button"
                  onClick={() => askAi(key)}
                  disabled={aiLoadingKey === key}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-amber-bg text-amber-deep disabled:opacity-60"
                >
                  {aiLoadingKey === key ? "מנסח..." : "✨ עזרה מ-AI"}
                </button>
              </div>
              {emojiOpenKey === key && (
                <div className="mt-2 rounded-xl p-2.5 bg-white border border-line grid grid-cols-8 gap-1">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        insertToken(key, emoji);
                        setEmojiOpenKey(null);
                      }}
                      className="text-lg rounded-lg py-1 hover:bg-chip"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              {aiErrorKey === key && <p className="text-xs text-rose mt-1.5">שגיאה בפנייה ל-AI, נסו שוב</p>}
              {errorKey === key && <p className="text-xs text-rose mt-1.5">שגיאה בשמירה, נסו שוב</p>}
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => save(key)}
                  disabled={savingKey === key}
                  className="rounded-lg px-4 py-1.5 text-xs font-semibold bg-ink text-white disabled:opacity-60"
                >
                  {savingKey === key ? "שומר..." : savedKey === key ? "נשמר ✓" : "שמירה"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
