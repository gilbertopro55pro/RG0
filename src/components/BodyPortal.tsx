"use client";

import { createPortal } from "react-dom";

// A sheet or modal rendered inside a glass card (.bg-card, and anything else with backdrop-filter)
// is positioned against that card instead of the screen: `fixed inset-0` then covers only the card
// and its sheet lands at the card's bottom, off-screen on a long page — the screen just dims and
// "nothing happens" (owner, 2026-10-10, removing a portfolio tab). Rendering it into <body> puts it
// back on the screen. Only for content that opens after a tap (it renders nothing on the server).
export default function BodyPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
