import { CHANGELOG } from "@/lib/changelog";

export default function UpdatesSettings() {
  return (
    <div className="space-y-3">
      {CHANGELOG.map((entry) => (
        <div key={entry.version} className="rounded-2xl p-4 bg-card border border-line shadow-card">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-sm font-semibold tracking-wide">גרסה {entry.version}</span>
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
