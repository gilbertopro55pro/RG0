// Shared shimmer block for route-level loading.tsx files — a gray placeholder the size/shape of
// the real content, so the page doesn't flash to blank white during the server-side data fetch.
export function SkeletonBlock({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded-xl ${className}`}
      style={{ background: "var(--color-chip)", ...style }}
    />
  );
}

export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card space-y-2.5">
      <SkeletonBlock className="h-4 w-2/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock key={i} className="h-3" style={{ width: `${85 - i * 15}%` }} />
      ))}
    </div>
  );
}
