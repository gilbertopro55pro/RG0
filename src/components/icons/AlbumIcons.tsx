// Line-style icons for the album design tool's own chrome (GalleryManageView.tsx's album
// section) — matches the app's canonical icon convention set by NavIcons.tsx: 24x24 viewBox,
// currentColor stroke, no fill, strokeWidth 1.6, round caps/joins.

function IconBase({ size = 14, className, children }: { size?: number; className?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={className ? undefined : size}
      height={className ? undefined : size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function IconClose({ size }: { size?: number }) {
  return (
    <IconBase size={size}>
      <path d="M5 5l14 14M19 5L5 19" />
    </IconBase>
  );
}

// Accepts either `size` (this icon's original, fixed-pixel call sites) or `className` (so it can
// also drop into the landing page's FEATURES grid, which sizes every icon via a `h-full w-full`
// wrapper instead) — both are optional and mutually exclusive in practice, never combined.
export function IconPalette({ size, className }: { size?: number; className?: string }) {
  return (
    <IconBase size={size} className={className}>
      <path d="M12 3.5A8.5 8.5 0 1012 20.5c1.1 0 1.9-.9 1.9-2 0-.53-.2-1-.55-1.36-.35-.36-.55-.83-.55-1.36 0-1.1.9-2 2-2H16.5A4.5 4.5 0 0021 9c0-3-4-5.5-9-5.5z" />
      <circle cx={7.5} cy={11} r={1} fill="currentColor" stroke="none" />
      <circle cx={9.5} cy={7.2} r={1} fill="currentColor" stroke="none" />
      <circle cx={14.5} cy={7} r={1} fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function IconRotateDevice({ size }: { size?: number }) {
  return (
    <IconBase size={size}>
      <rect x={7} y={2} width={10} height={16} rx={2} transform="rotate(-20 12 10)" />
      <path d="M19.5 15a7 7 0 0 1-10.6 5.2" />
      <path d="M9.5 17.5l-1 3 3-.6" />
    </IconBase>
  );
}

export function IconTarget({ size }: { size?: number }) {
  return (
    <IconBase size={size}>
      <circle cx={12} cy={12} r={7.5} />
      <circle cx={12} cy={12} r={2.4} fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function IconRefresh({ size }: { size?: number }) {
  return (
    <IconBase size={size}>
      <path d="M4 12a8 8 0 0113.6-5.7M20 12a8 8 0 01-13.6 5.7" />
      <path d="M17 4.5v3.8h-3.8M7 19.5v-3.8h3.8" />
    </IconBase>
  );
}

export function IconFont({ size }: { size?: number }) {
  return (
    <IconBase size={size}>
      <path d="M6 19l4.5-14 4.5 14M7.5 14h6" />
    </IconBase>
  );
}

export function IconChat({ size }: { size?: number }) {
  return (
    <IconBase size={size}>
      <path d="M4 5.5h16v11H9l-4 3.5v-3.5H4z" />
    </IconBase>
  );
}

export function IconSave({ size }: { size?: number }) {
  return (
    <IconBase size={size}>
      <path d="M5 3.5h11l4.5 4.5V19a1.5 1.5 0 01-1.5 1.5H5A1.5 1.5 0 013.5 19V5A1.5 1.5 0 015 3.5z" />
      <path d="M7.5 3.5v6h8v-6M7 20.5v-6h10v6" />
    </IconBase>
  );
}

export function IconWarning({ size }: { size?: number }) {
  return (
    <IconBase size={size}>
      <path d="M12 3.5l9.5 16.5H2.5L12 3.5z" />
      <path d="M12 9.8v4.4" />
      <circle cx={12} cy={17} r={0.9} fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function IconPdf({ size }: { size?: number }) {
  return (
    <IconBase size={size}>
      <path d="M6 3.5h8l4.5 4.5V20.5H6z" />
      <path d="M14 3.5V8h4.5" />
      <path d="M8.5 13.5h1.4a1.3 1.3 0 010 2.6H8.5v-2.6zm0 0v3.7M13 17.2v-3.7h1.6M13 15.3h1.3M17 17.2v-3.7c1.6 0 1.6 3.7 0 3.7z" />
    </IconBase>
  );
}

export function IconImage({ size }: { size?: number }) {
  return (
    <IconBase size={size}>
      <rect x={3.5} y={4.5} width={17} height={15} rx={1.5} />
      <circle cx={8.5} cy={9.5} r={1.6} />
      <path d="M3.5 16.5l5-5 4 4 3-3 5 5" />
    </IconBase>
  );
}

export function IconCheck({ size }: { size?: number }) {
  return (
    <IconBase size={size}>
      <path d="M4.5 12.5l5 5 10-11" />
    </IconBase>
  );
}
