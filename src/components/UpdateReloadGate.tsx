"use client";

import { useEffect, useState } from "react";
import { CURRENT_VERSION } from "@/lib/changelog";

// Separate from ChangelogModal's own "changelog-seen-version" key (src/components/ChangelogModal.tsx)
// on purpose: that one tracks whether the person has *read* what's new, this one tracks whether
// their *browser tab* has actually reloaded the current code. Reloading here deliberately doesn't
// touch the changelog key — so right after reconnecting, the existing unseen-update dot on the
// settings gear (SettingsGearLink.tsx / TopNav.tsx) still lights up on its own, sending them to
// Settings to read what changed. One version bump, two independent nudges.
const RELOAD_SEEN_KEY = "app-reload-version";

export default function UpdateReloadGate() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(RELOAD_SEEN_KEY) !== CURRENT_VERSION) {
        setShow(true);
      }
    } catch {}
  }, []);

  if (!show) return null;

  // A real sign-out (forcing the password to be typed again) would be a heavy, disruptive cost to
  // pay on every single shipped update — this does the thing that actually matters (getting the
  // freshly-deployed code loaded) via a hard reload, which fetches the new page and JS bundle from
  // the network while the existing login session/cookies stay exactly as they were.
  const reconnect = () => {
    try {
      localStorage.setItem(RELOAD_SEEN_KEY, CURRENT_VERSION);
    } catch {}
    window.location.reload();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(46,49,66,0.7)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
    >
      <div className="w-full max-w-sm rounded-3xl p-6 bg-paper shadow-sheet text-center">
        <div className="flex justify-center mb-3">
          <span
            className="h-12 w-12 rounded-full flex items-center justify-center text-2xl"
            style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}
          >
            ⟳
          </span>
        </div>
        <h2 className="text-lg font-bold font-display mb-2">יש עדכון חדש למערכת</h2>
        <p className="text-sm text-ink-soft mb-5">
          כדי שהשינויים ייכנסו לתוקף, יש להתנתק ולהתחבר מחדש למערכת.
        </p>
        <button onClick={reconnect} className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white">
          התנתקות וחיבור מחדש
        </button>
      </div>
    </div>
  );
}
