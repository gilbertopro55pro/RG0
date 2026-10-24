// One version in Settings › עדכונים. No hooks, so the server list (UpdatesSettings) and the earlier
// versions loaded on demand (OlderUpdates) render the same card.
export default function UpdateEntryCard({ label, date, changes }: { label: string; date: string; changes: string[] }) {
  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs font-data text-ink-soft">{date}</span>
      </div>
      <ul className="space-y-2">
        {changes.map((change, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--color-amber-deep)" }} />
            <span>{change}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
