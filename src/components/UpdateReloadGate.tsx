"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// Client-facing pages (galleries, contracts, quotes, portfolio…) and the auth pages never show
// this — only the photographer's own app does.
const HIDDEN_PREFIXES = ["/login", "/signup", "/reset-password", "/gallery", "/contracts", "/portal", "/quotes", "/billing", "/landing", "/p", "/chat"];
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const SNOOZE_MS = 10 * 60 * 1000;
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID;

// Prompts an open tab to reload once a newer deployment is live. This used to compare CHANGELOG's
// version against localStorage — which only ever fired after the new code had ALREADY loaded
// (the check itself ran inside the old bundle otherwise), and never for a silent update that
// doesn't bump the version, so changes stayed invisible until the person fully closed the app.
// Now it asks the server which build is live (/api/version) and compares it to the build this tab
// was loaded from: on mount, whenever the tab comes back into view, and every few minutes.
// "What's new" for real releases is still ChangelogModal's job, after the reload.
export default function UpdateReloadGate() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const snoozedUntil = useRef(0);

  useEffect(() => {
    if (!BUILD_ID) return;
    let cancelled = false;
    const check = async () => {
      if (Date.now() < snoozedUntil.current) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { buildId } = await res.json();
        if (!cancelled && buildId && buildId !== BUILD_ID) setShow(true);
      } catch {}
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const hidden = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!show || hidden) return null;

  // A plain reload is all it takes — the login session/cookies stay exactly as they were, and the
  // service worker is network-first for pages, so this always fetches the new deployment.
  const snooze = () => {
    snoozedUntil.current = Date.now() + SNOOZE_MS;
    setShow(false);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(28, 27, 25, 0.7)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
    >
      <div className="w-full max-w-sm rounded-3xl p-6 bg-paper shadow-sheet text-center">
        <div className="flex justify-center mb-3">
          <span
            className="h-12 w-12 rounded-full flex items-center justify-center"
            style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 11a8 8 0 1 0-2.3 5.7" />
              <path d="M20 4v7h-7" />
            </svg>
          </span>
        </div>
        <h2 className="text-lg font-bold font-display mb-2">יש עדכון חדש למערכת</h2>
        <p className="text-sm text-ink-soft mb-5">כדי שהשינויים ייכנסו לתוקף, צריך לטעון את המערכת מחדש. ההתחברות שלך נשמרת.</p>
        <button onClick={() => window.location.reload()} className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white">
          טעינה מחדש
        </button>
        {/* Reloading throws away anything typed but not yet saved (a half-filled new event, a
            contract being edited) — so there's a way to finish that first. It comes back. */}
        <button onClick={snooze} className="w-full mt-2 py-2 text-xs font-semibold text-ink-soft">
          עוד 10 דקות
        </button>
      </div>
    </div>
  );
}
