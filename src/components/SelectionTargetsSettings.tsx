"use client";

import { useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { createClient } from "@/lib/supabase/client";
import { SELECTION_TARGET_DEFAULTS, SELECTION_TARGET_MAX, selectionTargetFor, type SelectionTargets } from "@/lib/selectionTarget";

// Settings › "תמחור וחבילות צילום": how many photos the client picks for the album, per event type
// (owner, 2026-10-27; lib/selectionTarget.ts). The built-in types show their number (the default
// until changed); an empty field turns the target off for that type. The photographer's own event
// types follow the built-in type their name reads as, unless given a number of their own. Saved a
// moment after typing, the whole map at once (photographers.photo_selection_targets).
export default function SelectionTargetsSettings({
  photographerId,
  initialTargets,
  eventTypeNames,
}: {
  photographerId: string;
  initialTargets: SelectionTargets;
  eventTypeNames: string[];
}) {
  const t = useT();
  const [targets, setTargets] = useState<SelectionTargets>(initialTargets ?? {});
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = (next: SelectionTargets) => {
    setTargets(next);
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error } = await createClient().from("photographers").update({ photo_selection_targets: next }).eq("id", photographerId);
      setStatus(error ? "error" : "saved");
    }, 700);
  };
  const setValue = (name: string, raw: string) => {
    const next = { ...targets };
    const n = Number(raw);
    next[name] = raw.trim() === "" ? null : Number.isInteger(n) ? Math.min(SELECTION_TARGET_MAX, Math.max(1, n)) : (targets[name] ?? null);
    save(next);
  };
  const reset = (name: string) => {
    const next = { ...targets };
    delete next[name];
    save(next);
  };

  const builtIn = SELECTION_TARGET_DEFAULTS.map((d) => d.name);
  const own = [...new Set(eventTypeNames.map((n) => n.trim()).filter((n) => n && !builtIn.includes(n)))];
  const has = (name: string) => Object.prototype.hasOwnProperty.call(targets, name);

  const row = (name: string, value: number | null, hint: string, canReset: boolean) => (
    <div key={name} className="flex items-center gap-2 py-1.5">
      <label htmlFor={`selection-target-${name}`} className="flex-1 min-w-0 text-sm truncate">
        {builtIn.includes(name) ? t(name) : name}
      </label>
      <input
        id={`selection-target-${name}`}
        type="number"
        inputMode="numeric"
        min={1}
        max={SELECTION_TARGET_MAX}
        value={value ?? ""}
        placeholder={t("ללא")}
        onChange={(e) => setValue(name, e.target.value)}
        className="w-20 h-9 rounded-lg border border-line bg-white px-2 text-sm text-center font-data"
      />
      <span className="w-28 shrink-0 text-[11px] text-ink-soft leading-tight">
        {hint}
        {canReset && (
          <>
            {" "}
            <button type="button" onClick={() => reset(name)} className="underline font-semibold">
              {t("איפוס")}
            </button>
          </>
        )}
      </span>
    </div>
  );

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="text-sm font-semibold mb-1">{t("כמות תמונות לבחירה לפי סוג אירוע")}</div>
      <p className="text-xs mb-3 text-ink-soft leading-relaxed">
        {t("כשהלקוח מגיע לכמות הזו במועדפים בגלריה, פס הבחירה הופך לירוק, מופיעה שורה שמסבירה שהגיע לכמות, וקונפטי נופל פעם אחת. שדה ריק: בלי כמות לסוג הזה.")}
      </p>
      <div className="divide-y divide-line">
        {SELECTION_TARGET_DEFAULTS.map((d) => {
          const value = has(d.name) ? (targets[d.name] ?? null) : d.count;
          const changed = has(d.name) && targets[d.name] !== d.count;
          return row(d.name, value, t("ברירת מחדל: {n}", { n: d.count }), changed);
        })}
        {own.map((name) => {
          const inherited = selectionTargetFor({ eventType: name, targets: Object.fromEntries(Object.entries(targets).filter(([k]) => k !== name)) });
          return row(
            name,
            has(name) ? (targets[name] ?? null) : inherited,
            has(name) ? t("כמות משלו") : inherited ? t("לפי סוג האירוע הקרוב") : t("ללא כמות"),
            has(name)
          );
        })}
      </div>
      {status !== "idle" && (
        <p className="mt-2 text-xs font-semibold" style={{ color: status === "saved" ? "var(--color-sage)" : "var(--color-rose)" }}>
          {status === "saved" ? t("נשמר") : t("השמירה נכשלה. נסו שוב")}
        </p>
      )}
    </div>
  );
}
