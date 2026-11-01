"use client";

import { useT } from "@/i18n/client";

// Step 1 of the two direct-upload boxes in Settings › פורטפוליו (photos: PortfolioUploadPanel,
// videos: PortfolioVideoUploadPanel; owner, 2026-10-10 / 2026-11-01): the main tab the upload goes
// into. An existing tab from the list, or "+ לשונית חדשה..." with a name typed below it. The
// parent keeps the state and reads the result with chosenMainTab.

// Sentinel for the dropdown's last option: picking it reveals a free-text input instead of one of
// the existing tabs. Never sent to the DB (see chosenMainTab).
export const NEW_MAIN_TAB = "__custom__";

// The main tab a choice names, "" for none (the first option, or a new tab with no name yet).
export function chosenMainTab(value: string, custom: string): string {
  return (value === NEW_MAIN_TAB ? custom : value).trim();
}

export function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-paper text-[11px] font-bold" aria-hidden="true">
      {n}
    </span>
  );
}

export default function PortfolioMainTabSelect({
  id,
  options,
  value,
  onChange,
  custom,
  onCustomChange,
  noneLabel,
}: {
  id: string;
  // The existing tabs, in the order shown.
  options: string[];
  // "", one of `options`, or NEW_MAIN_TAB.
  value: string;
  onChange: (value: string) => void;
  custom: string;
  onCustomChange: (value: string) => void;
  // What the first option ("", no main tab) means in this box.
  noneLabel: string;
}) {
  const t = useT();
  return (
    <>
      <label htmlFor={id} className="flex items-center gap-2 text-xs font-semibold mb-1.5">
        <StepBadge n={1} />
        {t("הלשונית הראשית")}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white mb-1">
        <option value="">{noneLabel}</option>
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={NEW_MAIN_TAB}>{t("+ לשונית חדשה...")}</option>
      </select>
      {value === NEW_MAIN_TAB && (
        <input
          value={custom}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder={t("שם הלשונית החדשה, לדוגמה: חתונות")}
          autoFocus
          className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white mt-1 mb-1"
        />
      )}
      <p className="text-[11px] text-ink-soft mb-3.5">{t("אפשר לבחור לשונית קיימת, או \"+ לשונית חדשה\" ולכתוב שם.")}</p>
    </>
  );
}
