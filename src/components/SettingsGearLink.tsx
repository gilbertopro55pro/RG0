"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconSettings } from "@/components/icons/NavIcons";
import { CURRENT_VERSION } from "@/lib/changelog";

// Moved out of the quick-actions grid to sit right next to the "האירועים שלי" heading instead —
// same unseen-changelog dot it always had, just relocated.
export default function SettingsGearLink() {
  const [hasUnseenUpdate, setHasUnseenUpdate] = useState(false);

  useEffect(() => {
    const recompute = () => {
      try {
        setHasUnseenUpdate(localStorage.getItem("changelog-seen-version") !== CURRENT_VERSION);
      } catch {}
    };
    recompute();
    window.addEventListener("changelog-seen-change", recompute);
    return () => window.removeEventListener("changelog-seen-change", recompute);
  }, []);

  return (
    <Link href="/settings" className="relative shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-card shadow-card text-ink-soft" aria-label="הגדרות">
      {hasUnseenUpdate && (
        <span className="absolute top-0.5 left-0.5 h-2.5 w-2.5 rounded-full shadow" style={{ background: "var(--color-rose)" }} />
      )}
      <IconSettings className="h-4 w-4" />
    </Link>
  );
}
