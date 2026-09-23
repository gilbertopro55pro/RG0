// Storage is unlimited on most plans — what's actually bounded there is how long any one gallery
// can be kept before it expires (see GALLERY_EXPIRY_OPTIONS_BY_TIER in stages.ts), which caps
// total storage on its own without a hard quota. The entry-level "basic" tier is the one
// exception (see STORAGE_CAP_BYTES_BY_TIER) — capBytes is null for everyone else, in which case
// this stays the purely-informational stat it always was.
function formatStorage(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function StorageUsageSettings({ usedBytes, capBytes }: { usedBytes: number; capBytes: number | null }) {
  const pct = capBytes ? Math.min(100, Math.round((usedBytes / capBytes) * 100)) : null;
  const isNearCap = pct !== null && pct >= 80;
  const isOverCap = pct !== null && pct >= 100;

  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="flex items-center gap-2 mb-3.5">
        <span className="text-sm font-semibold tracking-wide">אחסון</span>
      </div>
      <div className="flex items-center justify-between text-sm rounded-xl px-3.5 py-2.5" style={{ background: "var(--color-chip)" }}>
        <span>נפח תמונות וסרטונים בשימוש כרגע</span>
        <span className="font-data font-semibold">
          {formatStorage(usedBytes)}
          {capBytes !== null && ` / ${formatStorage(capBytes)}`}
        </span>
      </div>
      {pct !== null && (
        <div className="h-1.5 rounded-full mt-2.5 overflow-hidden" style={{ background: "var(--color-chip)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: isOverCap ? "var(--color-rose)" : isNearCap ? "var(--color-peach)" : "var(--color-sage)",
            }}
          />
        </div>
      )}
      <p className="text-xs mt-2.5 text-ink-soft">
        {capBytes === null
          ? "אין הגבלת נפח, גלריות פגות תוקף אוטומטית לפי המסלול שלך, כך שהנפח לא ממשיך לגדול ללא גבול."
          : isOverCap
            ? "הגעתם למכסת האחסון של המסלול. לא ניתן להעלות קבצים נוספים עד שיתפנה מקום או שתשדרגו מסלול."
            : isNearCap
              ? "מתקרבים למכסת האחסון של המסלול. כדאי לפנות מקום או לשקול שדרוג מסלול."
              : "גלריות פגות תוקף אוטומטית לפי המסלול שלך, מה שמסייע לפנות מקום עם הזמן."}
      </p>
    </div>
  );
}
