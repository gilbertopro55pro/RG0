import Link from "next/link";

// Round "back" button (design stage 5) replacing the "→ חזרה…" text links. The chevron points
// right: in RTL, back is toward the start of the line. The label stays for screen readers.
export default function BackLink({ href, label, className = "" }: { href: string; label: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={`h-11 w-11 rounded-full flex items-center justify-center border border-line text-ink shrink-0 ${className}`}
      style={{ background: "var(--color-input-bg)" }}
    >
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  );
}
