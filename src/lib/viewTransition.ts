import { flushSync } from "react-dom";

// Wraps a state update in the View Transitions API when the browser supports it (Chromium-based),
// giving a shared-element "grow from its place" animation for elements with a matching
// view-transition-name. Falls back to a plain synchronous update everywhere else.
export function withViewTransition(update: () => void) {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
      flushSync(update);
    });
  } else {
    update();
  }
}

export const BTN_PRESS = "transition-transform duration-100 active:scale-95";
