"use client";

import type { CSSProperties, ReactNode } from "react";
import { toneVars, type Tone } from "@/lib/tones";
import { useVivid } from "@/components/VividProvider";

// A status tag (paid, pending, needs attention...). In the vivid look (admin, lib/tones.ts) it's a
// pill in its tone with a dot; otherwise it renders exactly the tag the screen had before, from
// `legacyClassName` / `legacyStyle`, so other accounts see no change.
export default function ToneTag({
  tone,
  children,
  legacyClassName,
  legacyStyle,
  className = "",
  title,
}: {
  tone: Tone;
  children: ReactNode;
  legacyClassName?: string;
  legacyStyle?: CSSProperties;
  className?: string;
  title?: string;
}) {
  const vivid = useVivid();
  if (!vivid) {
    return (
      <span className={legacyClassName} style={legacyStyle} title={title}>
        {children}
      </span>
    );
  }
  const v = toneVars(tone);
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full ${className}`}
      style={{ background: v.bg, color: v.ink }}
      title={title}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: v.solid }} />
      {children}
    </span>
  );
}
