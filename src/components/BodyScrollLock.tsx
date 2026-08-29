"use client";

import { useEffect } from "react";

// Mounted once at the root layout. Every full-screen modal/overlay in this app (there are dozens,
// across many components) uses the same Tailwind "fixed inset-0" backdrop pattern — rather than
// wiring a body-scroll-lock into each one individually (and having to remember it again for every
// future modal), this watches the DOM directly: whenever at least one such backdrop is present,
// the page behind it is made unscrollable, so the content visible through a blurred/translucent
// backdrop stays still instead of drifting whenever the user scrolls the mouse wheel over it.
// `.fixed.inset-0` is specific enough in practice to never false-positive here — grepped across the
// whole app and it's used exclusively for modal/overlay backdrops, never decorative or nav elements.
export default function BodyScrollLock() {
  useEffect(() => {
    const hasBackdrop = () => !!document.querySelector(".fixed.inset-0");
    const update = () => {
      // Writing to body.style on every single mutation (a photo grid growing during an upload
      // fires this dozens/hundreds of times, and so does a progress modal re-rendering its own
      // percentage) forces a style recalc each time even when the value doesn't actually change
      // — on some mobile browsers that steady drip of recalcs while a `position: fixed` overlay
      // is on screen is enough to make it visibly drift. Only touch the style when the target
      // value is actually different from what's already set.
      const next = hasBackdrop() ? "hidden" : "";
      if (document.body.style.overflow !== next) {
        document.body.style.overflow = next;
      }
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.body.style.overflow = "";
    };
  }, []);

  return null;
}
