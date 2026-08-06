export default function Spinner({ className = "h-4 w-4", light = false }: { className?: string; light?: boolean }) {
  return (
    <span
      className={`inline-block rounded-full border-2 animate-spin align-[-2px] ${className}`}
      style={{
        borderColor: light ? "rgba(255,255,255,0.35)" : "var(--color-line)",
        borderTopColor: light ? "#fff" : "var(--color-ink)",
      }}
    />
  );
}
