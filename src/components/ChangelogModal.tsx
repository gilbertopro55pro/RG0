"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CHANGELOG, CURRENT_VERSION } from "@/lib/changelog";

const SEEN_KEY = "changelog-seen-version";
const CLOSE_ANIMATION_MS = 220;

// Same hidden-route list as TopNav — no dashboard chrome (and no "what's new" popup) on
// client-facing token pages or pre-auth screens.
const HIDDEN_PREFIXES = ["/login", "/signup", "/gallery", "/contracts", "/portal", "/quotes", "/billing"];

export default function ChangelogModal() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) !== CURRENT_VERSION) {
        setVisible(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  const isHidden = pathname === "/" || HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isHidden || !visible) return null;

  const latest = CHANGELOG[0];

  const dismiss = () => {
    setClosing(true);
    setTimeout(() => {
      try {
        localStorage.setItem(SEEN_KEY, CURRENT_VERSION);
        // TopNav computes its settings badge count once on mount and has no other way to learn
        // the seen-version changed — same cross-component notify pattern haptics.ts uses.
        window.dispatchEvent(new Event("changelog-seen-change"));
      } catch {}
      setVisible(false);
    }, CLOSE_ANIMATION_MS);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{
        background: "rgba(46,49,66,0.45)",
        backdropFilter: entered && !closing ? "blur(16px)" : "blur(0px)",
        WebkitBackdropFilter: entered && !closing ? "blur(16px)" : "blur(0px)",
        transition: `backdrop-filter ${CLOSE_ANIMATION_MS + 60}ms ease, -webkit-backdrop-filter ${CLOSE_ANIMATION_MS + 60}ms ease`,
      }}
    >
      <style>{`
        @keyframes changelogZoomOut { from { transform: scale(1); opacity: 1; } to { transform: scale(0.85); opacity: 0; } }
        .changelog-closing { animation: changelogZoomOut ${CLOSE_ANIMATION_MS}ms ease forwards; }
      `}</style>
      <div
        className={`w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto ${closing ? "changelog-closing" : ""}`}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold font-display">מה חדש</h2>
          <span className="text-xs font-data text-ink-soft">גרסה {latest.version}</span>
        </div>
        <p className="text-xs text-ink-soft mb-4">העדכונים האחרונים במערכת</p>

        <ul className="space-y-2.5 mb-5">
          {latest.changes.map((change, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--color-amber-deep)" }} />
              <span>{change}</span>
            </li>
          ))}
        </ul>

        <button onClick={dismiss} className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white">
          אישור
        </button>
      </div>
    </div>
  );
}
