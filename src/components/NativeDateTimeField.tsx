"use client";

import { useEffect, useState } from "react";

// Touch devices (iOS in particular) render a native date/time picker wider than the input's own
// declared box — a confirmed WebKit sizing bug — so on touch the real <input> stays fully invisible
// (opacity-0, absolute inset-0) and clipped by this wrapper's overflow-hidden, acting only as a hit
// target; a plain decorative <div> underneath shows the value/placeholder instead. A real mouse
// pointer has no such sizing bug, but DOES need the input's own native click-to-position-caret,
// keyboard typing and spinner/picker-icon behavior to actually work — which our onClick-triggered
// showPicker() call can't guarantee inside every host (an embedded webview, e.g. the desktop app's
// Electron BrowserView, can fail to render that popup at all), while the browser's default handling
// of a genuinely visible, focusable input always does. So under (hover: hover) and (pointer: fine)
// this renders the real control directly — no overlay, no showPicker() call, nothing that can fail.
export default function NativeDateTimeField({
  type,
  value,
  onChange,
  display,
  compact = false,
}: {
  type: "date" | "time";
  value: string;
  onChange: (value: string) => void;
  display: React.ReactNode;
  compact?: boolean;
}) {
  const [desktopPointer, setDesktopPointer] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    setDesktopPointer(mq.matches);
    const handler = (e: MediaQueryListEvent) => setDesktopPointer(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (desktopPointer) {
    return (
      <div className="relative w-full rounded-lg border border-line bg-white">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          dir="ltr"
          className={`w-full h-full ${compact ? "px-1.5" : "px-3"} py-2 text-sm text-center bg-transparent`}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-lg border border-line bg-white overflow-hidden">
      <div className={`pointer-events-none flex items-center justify-center ${compact ? "px-1.5" : "px-3"} py-2 text-sm`} dir="ltr">
        {display}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          // Wrapped in try/catch — a confirmed WebKit bug (showPicker() doesn't work on iOS,
          // webkit.org bug 261703) makes this throw on some iOS Safari versions, particularly for
          // type="time". A harmless no-op here on affected devices; the input's own native default
          // tap-to-open behavior doesn't depend on this call.
          try {
            (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
          } catch {}
        }}
        dir="ltr"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}
