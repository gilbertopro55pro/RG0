"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLang, useT } from "@/i18n/client";

export const PRESET_EVENT_TYPES = ["חתונה", "חינה", "בת מצווה", "בר מצווה", "עלייה לתורה", "הכנסת ספר תורה", "ברית", "בריתה", "מגנטים"];

const CUSTOM_VALUE = "__custom__";

// The arrow sits on the end side: left in Hebrew (RTL), right in English/Russian.
const selectArrowStyle = (side: "left" | "right") => ({
  background: `var(--color-amber-bg) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239C7A3C' stroke-width='1.5' fill='none' fill-rule='evenodd'/%3E%3C/svg%3E") ${side} 0.9rem center/10px 6px no-repeat`,
});

// "סוג האירוע" as a dropdown of the fixed presets plus every free-text type this photographer has
// typed before. There's no separate table for the saved ones — they're simply the distinct
// events.event_type values already on the photographer's own events (RLS scopes the query), so a
// type typed once shows up in the list for the next event automatically, right after that first
// event is saved.
export default function EventTypeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  const lang = useLang();
  const [savedTypes, setSavedTypes] = useState<string[]>([]);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("events")
        .select("event_type")
        .not("event_type", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000)
        .returns<{ event_type: string | null }[]>();
      if (cancelled) return;
      setSavedTypes((data ?? []).map((r) => r.event_type ?? "").filter(Boolean));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const type of [...PRESET_EVENT_TYPES, ...savedTypes, value]) {
      const trimmed = type.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
    return out;
  }, [savedTypes, value]);

  return (
    <div>
      <label className="text-xs block mb-1 text-ink-soft">{t("סוג האירוע")}</label>
      <select
        value={custom ? CUSTOM_VALUE : value}
        onChange={(e) => {
          if (e.target.value === CUSTOM_VALUE) {
            setCustom(true);
            onChange("");
            return;
          }
          setCustom(false);
          onChange(e.target.value);
        }}
        className="w-full rounded-lg px-3 py-2.5 text-sm appearance-none font-medium text-ink"
        style={selectArrowStyle(lang === "he" ? "left" : "right")}
      >
        <option value="">{t("בחירת סוג אירוע")}</option>
        {options.map((type) => (
          <option key={type} value={type}>
            {t(type)}
          </option>
        ))}
        <option value={CUSTOM_VALUE}>{t("+ אחר: הקלדה חופשית")}</option>
      </select>
      {custom && (
        <div className="mt-2">
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
            placeholder={t("הקלידו את סוג האירוע")}
          />
          <p className="text-[11px] text-ink-soft mt-1">{t("אחרי שמירת האירוע הסוג יישמר ברשימה לאירועים הבאים")}</p>
        </div>
      )}
    </div>
  );
}
