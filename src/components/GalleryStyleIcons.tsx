// Small schematic icons for the gallery style editor — each one is a tiny diagram of what the
// option actually does (where the caption sits, what shape the cover takes, how photos tile),
// so a picker reads at a glance instead of needing a text label to explain itself.

import type { ReactNode } from "react";

function Base({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export function PlayIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" stroke="none">
      <path d="M8 5.5v13l11-6.5-11-6.5z" />
    </svg>
  );
}

export function TextPositionIcon({ position }: { position: string }) {
  if (position === "center-left" || position === "center-right") {
    const onRight = position === "center-right";
    return (
      <Base>
        <rect x={3} y={4} width={18} height={16} rx={2} opacity={0.45} />
        <line x1={onRight ? 15 : 6} y1={10.5} x2={onRight ? 18 : 9} y2={10.5} strokeWidth={2.2} />
        <line x1={onRight ? 13.5 : 6} y1={13.5} x2={onRight ? 18 : 9} y2={13.5} strokeWidth={2.2} />
      </Base>
    );
  }
  const below = position === "below";
  return (
    <Base>
      <rect x={3} y={below ? 3 : 9.5} width={18} height={11} rx={2} opacity={0.45} />
      <line x1={5} y1={below ? 18.5 : 4.5} x2={13} y2={below ? 18.5 : 4.5} strokeWidth={2.2} />
      <line x1={5} y1={below ? 21 : 7} x2={10} y2={below ? 21 : 7} strokeWidth={2.2} />
    </Base>
  );
}

export function ShapeIcon({ shape }: { shape: string }) {
  switch (shape) {
    case "banner":
      return (
        <Base>
          <rect x={2.5} y={8} width={19} height={8} rx={1.5} />
        </Base>
      );
    case "square":
      return (
        <Base>
          <rect x={4} y={4} width={16} height={16} rx={1.5} />
        </Base>
      );
    case "circle":
      return (
        <Base>
          <circle cx={12} cy={12} r={8.5} />
        </Base>
      );
    case "rectangle":
    default:
      return (
        <Base>
          <rect x={3} y={5.5} width={18} height={13} rx={1.5} />
        </Base>
      );
  }
}

export function GridStyleIcon({ style }: { style: string }) {
  switch (style) {
    case "grid":
      return (
        <Base>
          <rect x={3} y={3} width={7.5} height={7.5} rx={1} />
          <rect x={13.5} y={3} width={7.5} height={7.5} rx={1} />
          <rect x={3} y={13.5} width={7.5} height={7.5} rx={1} />
          <rect x={13.5} y={13.5} width={7.5} height={7.5} rx={1} />
        </Base>
      );
    case "framed":
      return (
        <Base>
          <rect x={3} y={3} width={18} height={18} rx={2} opacity={0.4} />
          <rect x={7} y={7} width={10} height={10} rx={1} />
        </Base>
      );
    case "justified":
      return (
        <Base>
          <rect x={3} y={4} width={8} height={6.5} rx={1} />
          <rect x={12.5} y={4} width={8.5} height={6.5} rx={1} />
          <rect x={3} y={13.5} width={12} height={6.5} rx={1} />
          <rect x={16.5} y={13.5} width={4.5} height={6.5} rx={1} />
        </Base>
      );
    case "masonry":
    default:
      return (
        <Base>
          <rect x={3} y={3} width={5.5} height={9} rx={1} />
          <rect x={9.5} y={3} width={5.5} height={14} rx={1} />
          <rect x={16} y={3} width={5} height={6} rx={1} />
          <rect x={3} y={13.5} width={5.5} height={7.5} rx={1} />
          <rect x={16} y={10.5} width={5} height={10.5} rx={1} />
        </Base>
      );
  }
}
