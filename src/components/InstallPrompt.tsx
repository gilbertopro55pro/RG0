"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { IconClose } from "@/components/icons/AlbumIcons";

// Client-facing token pages never need "install the app" nudges — only the photographer's own
// working screens do. "/p" is the public portfolio page (/p/[slug]) — shown to potential clients.
const HIDDEN_PREFIXES = ["/login", "/signup", "/gallery", "/contracts", "/portal", "/quotes", "/billing", "/p"];
const DISMISS_KEY = "install-prompt-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallPrompt() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    const nav = navigator as Navigator & { standalone?: boolean };
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || !!nav.standalone;
    if (isStandalone) return;

    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setVisible(true);

    // Chrome/Android fires this instead of us having to guess — capture it so the button below
    // can trigger the browser's own real install flow rather than just showing instructions.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const isHidden = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isHidden || !visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    dismiss();
  };

  return (
    <div className="fixed bottom-3 inset-x-3 md:inset-x-auto md:right-3 md:left-auto md:max-w-sm z-40 rounded-2xl p-4 bg-white shadow-sheet border border-line">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" className="h-11 w-11 rounded-xl shrink-0" alt="" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold mb-1">התקינו את האפליקציה למסך הבית</div>
          <p className="text-xs text-ink-soft mb-2.5 leading-relaxed">
            {isIOS
              ? 'לחצו על כפתור השיתוף ⬆️ בסרגל הכלים למטה, ואז "הוספה למסך הבית".'
              : "גישה מהירה מהמסך הראשי, בלי לפתוח דפדפן, בדיוק כמו אפליקציה רגילה."}
          </p>
          <div className="flex items-center gap-3">
            {installEvent && (
              <button onClick={install} className="text-xs font-semibold text-amber-deep">
                התקנה
              </button>
            )}
            <button onClick={dismiss} className="text-xs font-semibold text-ink-soft">
              לא עכשיו
            </button>
          </div>
        </div>
        <button onClick={dismiss} className="shrink-0 text-ink-soft leading-none" aria-label="סגירה">
          <IconClose className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
