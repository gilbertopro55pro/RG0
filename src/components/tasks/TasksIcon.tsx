// The to-do list's icon: a checklist. On the home screen's tasks button and in the top nav.
export default function TasksIcon({ className, strokeWidth = 1.8 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="17" rx="2.5" />
      <path d="m7.5 9.5 1.5 1.5 3-3M14.5 10h2.5M7.5 15.5l1.5 1.5 3-3M14.5 16h2.5" />
    </svg>
  );
}
