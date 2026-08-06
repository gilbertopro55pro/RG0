"use client";

import { useEffect } from "react";
import { triggerHaptic } from "@/lib/haptics";

const PRESSED_CLASS = "js-pressed";
const BUTTON_SELECTOR = "button, a[role='button'], [role='button']";

// Mounted once at the root layout. Two jobs:
//
// 1. A guaranteed "press in, spring back" animation on every button — driven entirely by
//    JS pointer events and a CSS class, not the CSS `:active` pseudo-class. iOS Safari's
//    `:active` only activates under specific, inconsistent conditions even with the classic
//    touchstart-listener workaround, so we don't rely on it for the primary effect anymore.
// 2. A light haptic buzz on touch press, where the platform supports it. Note: iOS (Safari,
//    Chrome, or any other browser there — they all run on WebKit) never supports the Web
//    Vibration API at all; this is an Apple platform restriction, not a bug in this app, and
//    there is no web-based workaround. It still works on Android.
export default function GlobalButtonEffects() {
  useEffect(() => {
    let pressedEl: HTMLElement | null = null;

    const findButton = (target: EventTarget | null): HTMLElement | null => {
      const el = target as HTMLElement | null;
      const button = el?.closest<HTMLElement>(BUTTON_SELECTOR);
      if (!button) return null;
      if ((button as HTMLButtonElement).disabled || button.getAttribute("aria-disabled") === "true") return null;
      return button;
    };

    const clearPressed = () => {
      if (pressedEl) {
        pressedEl.classList.remove(PRESSED_CLASS);
        pressedEl = null;
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      try {
        const button = findButton(e.target);
        if (!button) return;
        pressedEl = button;
        button.classList.add(PRESSED_CLASS);
        if (e.pointerType === "touch") triggerHaptic(10);
      } catch {
        // Visual/haptic feedback is a nice-to-have — never let this break real interactions.
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, { passive: true });
    document.addEventListener("pointerup", clearPressed, { passive: true });
    document.addEventListener("pointercancel", clearPressed, { passive: true });
    document.addEventListener("pointerleave", clearPressed, { passive: true, capture: true });

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", clearPressed);
      document.removeEventListener("pointercancel", clearPressed);
      document.removeEventListener("pointerleave", clearPressed, true);
    };
  }, []);

  return null;
}
