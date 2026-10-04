import { CHANGELOG } from "@/lib/changelog";
import { getT } from "@/i18n/server";

export default async function UpdatesSettings() {
  const t = await getT();
  return (
    <div className="space-y-3">
      {CHANGELOG.map((entry) => (
        <div key={entry.version} className="rounded-2xl p-4 bg-card border border-line shadow-card">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-sm font-semibold">{t("גרסה {v}", { v: entry.version })}</span>
            <span className="text-xs font-data text-ink-soft">{entry.date}</span>
          </div>
          <ul className="space-y-2">
            {entry.changes.map((change, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--color-amber-deep)" }} />
                <span>{change}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
