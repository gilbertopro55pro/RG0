"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CLIENT_MESSAGE_INSERT_OPTIONS,
  CLIENT_MESSAGE_INSERT_TEXT_I18N,
  CLIENT_MESSAGE_EMOJI_OPTIONS as EMOJI_OPTIONS,
  CLIENT_MESSAGE_LINK_MARKER,
  CUSTOMIZABLE_MESSAGE_STAGES,
  STAGE_LABELS,
  builtInClientMessageTemplate,
} from "@/lib/stages";
import type { ClientMessageTemplateRow, CustomPackageStageRow } from "@/lib/types";
import { useT } from "@/i18n/client";
import { LANGS, LANG_LABELS, type Lang } from "@/i18n/config";
import { clientTemplateKey } from "@/lib/clientMessage";

// Hebrew: the recommended text (or the generic default); English/Russian: its built-in translation.
// Also what an unsaved custom stage gets in English/Russian (the generic default).
function recommendedFor(key: string, lang: Lang = "he"): string {
  return builtInClientMessageTemplate(key, lang);
}

export default function ClientMessagesSettings({
  initialTemplates,
  customStages = [],
  clientLangTemplates = false,
}: {
  initialTemplates: ClientMessageTemplateRow[];
  // Custom package stages with their own saved template (written from the package builder's
  // inline editor) show up here too, alongside the 5 built-in stages — but only once a template
  // has actually been saved for them (see customEntries below), and only ones still marked
  // client-facing, matching how the package builder decides whether to show that editor at all.
  customStages?: CustomPackageStageRow[];
  // The English/Русский switch for the versions sent to English/Russian clients (admin only for
  // now, canChooseClientLang). Those are saved as "<stage>@en" / "<stage>@ru" rows.
  clientLangTemplates?: boolean;
}) {
  const t = useT();
  const supabase = createClient();
  const customEntries = customStages
    .filter((s) => s.notify_client)
    .map((s) => ({ key: `custom:${s.id}`, label: s.name }))
    .filter((entry) => initialTemplates.some((t) => t.stage_key === entry.key));
  const allKeys: { key: string; label: string; isCustom: boolean }[] = [
    ...CUSTOMIZABLE_MESSAGE_STAGES.map((key) => ({ key, label: STAGE_LABELS[key], isCustom: false })),
    ...customEntries.map((e) => ({ ...e, isCustom: true })),
  ];
  // Which language's version is being edited. Hebrew is the plain stage key, exactly as before.
  const [editLang, setEditLang] = useState<Lang>("he");
  const editLangs: Lang[] = clientLangTemplates ? [...LANGS] : ["he"];
  // Keyed by the stored stage_key (clientTemplateKey): "gallery_upload", "gallery_upload@en", …
  const [bodies, setBodies] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const lang of editLangs) {
      for (const key of CUSTOMIZABLE_MESSAGE_STAGES) map[clientTemplateKey(key, lang)] = recommendedFor(key, lang);
      for (const entry of customEntries) map[clientTemplateKey(entry.key, lang)] = lang === "he" ? "" : recommendedFor(entry.key, lang);
    }
    for (const row of initialTemplates) {
      if (row.stage_key in map) map[row.stage_key] = row.body;
    }
    return map;
  });
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [emptyErrorKey, setEmptyErrorKey] = useState<string | null>(null);
  const [aiLoadingKey, setAiLoadingKey] = useState<string | null>(null);
  const [aiErrorKey, setAiErrorKey] = useState<string | null>(null);
  const [emojiOpenKey, setEmojiOpenKey] = useState<string | null>(null);
  // "איפוס לנוסח המומלץ" only overwrites the DB once the photographer separately clicks "שמירה"
  // — but that second click looks like a routine save, giving no signal that it's about to
  // permanently replace a real customization with the generic default. Requiring a second tap on
  // the reset button itself (armed for a few seconds, matching the pattern the AI-rewrite/insert
  // buttons already use for lightweight in-place state) makes the destructive intent explicit.
  const [confirmResetKey, setConfirmResetKey] = useState<string | null>(null);
  const confirmResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // A custom stage's template can start existing only *after* this component already mounted —
  // the package builder saves it via router.refresh() (a Server Component re-render), not a full
  // page reload, and useState's lazy initializer above only ever runs once on mount. Without this,
  // a newly-appeared custom entry's card would render with an empty body until the next hard
  // reload, even though the correct text is already sitting in initialTemplates.
  useEffect(() => {
    setBodies((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const entry of customEntries) {
        for (const lang of editLangs) {
          const sk = clientTemplateKey(entry.key, lang);
          if (!(sk in next)) {
            next[sk] = initialTemplates.find((t) => t.stage_key === sk)?.body ?? (lang === "he" ? "" : recommendedFor(entry.key, lang));
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customStages, initialTemplates]);

  useEffect(() => {
    return () => {
      if (confirmResetTimeoutRef.current) clearTimeout(confirmResetTimeoutRef.current);
    };
  }, []);

  // Inserts the token/emoji at the cursor position (or replaces a selection) in that stage's own
  // textarea, so the photographer never has to remember or type the {{...}} syntax by hand.
  const insertToken = (key: string, token: string) => {
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

  const askAi = async (key: string, label: string) => {
    setAiLoadingKey(key);
    setAiErrorKey(null);
    try {
      const res = await fetch("/api/client-message-templates/ai-rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageLabel: label, currentText: bodies[key] }),
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

  const save = async (key: string) => {
    setErrorKey(null);
    setEmptyErrorKey(null);
    const body = bodies[key].trim();
    // Never silently substitute the recommended default for an accidentally-emptied field — that
    // would persist text the photographer never actually wrote, indistinguishable from their own
    // customization quietly reverting.
    if (!body) {
      setEmptyErrorKey(key);
      return;
    }
    setSavingKey(key);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSavingKey(null);
      setErrorKey(key);
      return;
    }
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

  const resetToDefault = (key: string) => {
    if (confirmResetTimeoutRef.current) clearTimeout(confirmResetTimeoutRef.current);
    if (confirmResetKey !== key) {
      // First tap: arm the confirmation instead of resetting immediately, and disarm it again
      // after a few seconds so a stray later click elsewhere can't land on a still-armed button.
      setConfirmResetKey(key);
      confirmResetTimeoutRef.current = setTimeout(() => setConfirmResetKey((cur) => (cur === key ? null : cur)), 3000);
      return;
    }
    setConfirmResetKey(null);
    setBodies((prev) => ({ ...prev, [key]: recommendedFor(key.replace(/@(en|ru)$/, ""), editLang) }));
  };

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="text-sm font-semibold mb-1">{t("הודעות ללקוח/ה")}</div>
      <div className="text-xs text-ink-soft leading-relaxed mb-3.5 space-y-1">
        <p>{t("כאן אפשר לערוך את נוסח ההודעה שנשלחת ללקוח/ה דרך כפתור \"שליחת עדכון ללקוח בוואטסאפ\" בכל שלב, הנוסח שנשמר הוא בדיוק מה שיישלח בפועל.")}</p>
        <p><span className="font-data">{"{{שם}}"}</span>, {t("מוסיף את שם הלקוח מתוך כרטיס האירוע.")}</p>
        <p><span className="font-data">{"{{שלב}}"}</span>, {t("מוסיף את שם השלב מתוך החבילה.")}</p>
        <p><span className="font-data">{CLIENT_MESSAGE_LINK_MARKER[editLang]}</span>, {t("יוסיף מיד אחריו את הקישור הרלוונטי.")}</p>
      </div>
      <p className="text-xs text-ink-soft leading-relaxed mb-3.5">
        {t("אם שמרתם חתימה אישית בלשונית \"פרופיל\", היא תתווסף אוטומטית בשורה האחרונה של כל הודעה, עם שורה ריקה מפרידה. אין צורך לכתוב אותה כאן בעצמכם.")}
      </p>

      {editLangs.length > 1 && (
        <div className="mb-3.5">
          <div className="text-xs font-semibold mb-1.5">{t("שפת ההודעה")}</div>
          <div className="inline-flex rounded-full bg-chip p-0.5">
            {editLangs.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setEditLang(lang)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${editLang === lang ? "bg-ink text-white" : "text-ink-soft"}`}
              >
                {LANG_LABELS[lang]}
              </button>
            ))}
          </div>
          {editLang !== "he" && (
            <p className="text-xs text-ink-soft leading-relaxed mt-1.5">
              {t("הנוסח הזה נשלח ללקוחות שהשפה שלהם באירוע היא {lang}. ללקוחות בעברית נשלח הנוסח בעברית.", { lang: LANG_LABELS[editLang] })}
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {allKeys.map(({ key: stageKey, label, isCustom }) => {
          // Every piece of per-card state is keyed by the stored key, so each language keeps its own.
          const key = clientTemplateKey(stageKey, editLang);
          const isDefault = !isCustom && bodies[key] === recommendedFor(stageKey, editLang);
          return (
            <div key={stageKey} className="rounded-xl p-3 bg-chip relative">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold">{t(label)}</span>
                {!isCustom && !isDefault && (
                  <button
                    onClick={() => resetToDefault(key)}
                    className="text-[11px] whitespace-nowrap shrink-0 font-semibold"
                    style={{ color: confirmResetKey === key ? "var(--color-rose)" : "var(--color-ink-soft)" }}
                  >
                    {confirmResetKey === key ? t("לאשר איפוס? (לחיצה נוספת)") : t("איפוס לנוסח המומלץ")}
                  </button>
                )}
              </div>
              <textarea
                ref={(el) => {
                  textareaRefs.current[key] = el;
                }}
                value={bodies[key] ?? ""}
                dir={editLang === "he" ? undefined : "ltr"}
                onChange={(e) => {
                  setBodies((prev) => ({ ...prev, [key]: e.target.value }));
                  setEmptyErrorKey((cur) => (cur === key ? null : cur));
                }}
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
                    if (opt) insertToken(key, editLang === "he" ? opt.insertText : (CLIENT_MESSAGE_INSERT_TEXT_I18N[editLang][opt.token] ?? opt.insertText));
                  }}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-white border border-line text-ink-soft"
                >
                  <option value="" disabled>
                    {t("+ הוספת פרט")}
                  </option>
                  {CLIENT_MESSAGE_INSERT_OPTIONS.map((opt) => (
                    <option key={opt.token} value={opt.token}>
                      {t(opt.label)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setEmojiOpenKey((cur) => (cur === key ? null : key))}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-white border border-line text-ink-soft"
                >
                  😀 {t("אימוג׳י")}
                </button>
                {/* The rewrite route writes Hebrew, so it's offered on the Hebrew version only. */}
                {editLang === "he" && (
                <button
                  type="button"
                  onClick={() => askAi(key, label)}
                  disabled={aiLoadingKey === key}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-amber-bg text-amber-deep disabled:opacity-60"
                >
                  {aiLoadingKey === key ? t("מנסח...") : t("עזרה בניסוח")}
                </button>
                )}
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
              {aiErrorKey === key && <p className="text-xs text-rose mt-1.5">{t("שגיאה בפנייה ל-AI, נסו שוב")}</p>}
              {emptyErrorKey === key && <p className="text-xs text-rose mt-1.5">{t("ההודעה ריקה. יש להזין טקסט לפני שמירה")}</p>}
              {errorKey === key && <p className="text-xs text-rose mt-1.5">{t("שגיאה בשמירה, נסו שוב")}</p>}
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => save(key)}
                  disabled={savingKey === key}
                  className="rounded-lg px-4 py-1.5 text-xs font-semibold bg-ink text-white disabled:opacity-60"
                >
                  {savingKey === key ? t("שומר...") : savedKey === key ? t("נשמר ✓") : t("שמירה")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
