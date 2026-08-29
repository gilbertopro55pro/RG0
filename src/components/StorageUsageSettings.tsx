// Storage capacity is unlimited on every plan — what's actually bounded is how long any one
// gallery can be kept before it expires (see GALLERY_EXPIRY_OPTIONS_BY_TIER in stages.ts), which
// caps total storage on its own without a hard quota. This stat is purely informational: it shows
// the photographer what they're actually holding right now, not a limit they can hit.
function formatStorage(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function StorageUsageSettings({ usedBytes }: { usedBytes: number }) {
  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="flex items-center gap-2 mb-3.5">
        <span className="text-sm font-semibold tracking-wide">אחסון</span>
      </div>
      <div className="flex items-center justify-between text-sm rounded-xl px-3.5 py-2.5" style={{ background: "var(--color-chip)" }}>
        <span>נפח תמונות וסרטונים בשימוש כרגע</span>
        <span className="font-data font-semibold">{formatStorage(usedBytes)}</span>
      </div>
      <p className="text-xs mt-2.5 text-ink-soft">
        אין הגבלת נפח — גלריות פגות תוקף אוטומטית לפי המסלול שלך, כך שהנפח לא ממשיך לגדול ללא גבול.
      </p>
    </div>
  );
}
