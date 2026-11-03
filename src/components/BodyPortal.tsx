"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const noSubscribe = () => () => {};

// A sheet or modal rendered inside a glass card (.bg-card, and anything else with backdrop-filter)
// is positioned against that card instead of the screen: `fixed inset-0` then covers only the card
// and its sheet lands at the card's bottom, off-screen on a long page — the screen just dims and
// "nothing happens" (owner, 2026-10-10, removing a portfolio tab). Rendering it into <body> puts it
// back on the screen.
// Nothing on the server, and nothing while the page hydrates either (the server snapshot), so a
// sheet that is already open when the page loads (the home screen's reminder windows) matches the
// server's HTML; it renders right after. Checking `typeof document` instead rendered the portal
// during hydration, and React threw away the whole home screen's server HTML (error #418, found
// 2026-11-03). After a tap the snapshot is already true, so a sheet opened by a tap shows at once.
export default function BodyPortal({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );
  if (!mounted) return null;
  return createPortal(children, document.body);
}
