import { useEffect, useState } from "react";

// Backdrop blur ramps in right after mount (needs a tick so the transition actually plays
// instead of starting already-blurred). Shared across every modal that wants the same
// blur-in treatment as NewEventModal without also needing its full open/close animation.
export function useModalEntered() {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return entered;
}

export const MODAL_BACKDROP_BLUR_TRANSITION_MS = 280;
