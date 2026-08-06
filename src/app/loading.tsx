export default function Loading() {
  return (
    <div className="flex items-center justify-center py-24">
      <div
        className="h-8 w-8 rounded-full border-2 border-line animate-spin"
        style={{ borderTopColor: "var(--color-ink)" }}
      />
    </div>
  );
}
