"use client";

import { useT } from "@/i18n/client";
import { LANGS, LANG_LABELS, isLang, type Lang } from "@/i18n/config";

// "Client language" picker (UI languages phase 2): the language of the pages this client sees.
// Render it only when canChooseClientLang() is true for the photographer (admin only for now).
export default function ClientLangSelect({
  value,
  onChange,
  showHint = true,
  className = "",
}: {
  value: string | null | undefined;
  onChange: (lang: Lang) => void;
  showHint?: boolean;
  className?: string;
}) {
  const t = useT();
  const current: Lang = isLang(value) ? value : "he";
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm font-medium text-gray-700 mb-1">{t("שפת הלקוח/ה")}</span>
      <select
        value={current}
        onChange={(e) => isLang(e.target.value) && onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
      >
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {LANG_LABELS[l]}
          </option>
        ))}
      </select>
      {showHint && (
        <span className="block text-xs text-gray-500 mt-1">
          {t("הדפים שהלקוח/ה רואה (הצעת המחיר, החוזה, הפורטל והגלריה) יוצגו בשפה הזו.")}
        </span>
      )}
    </label>
  );
}
