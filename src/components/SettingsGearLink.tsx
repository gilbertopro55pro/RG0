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
    <Link href="/settings" className="relative shrink-0 h-10 w-10 rounded-xl flex items-center justify-center bg-card text-ink" aria-label="הגדרות">
      {hasUnseenUpdate && (
        <span className="absolute top-2 left-2 h-2 w-2 rounded-full" style={{ background: "var(--color-brass)" }} />
      )}
      <IconSettings className="h-[19px] w-[19px]" />
    </Link>
  );
}
