"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __bootReady?: () => void;
  }
}

// Tells the boot splash (the inline script in app/layout.tsx) that React has hydrated the page, so
// it goes as soon as the page works instead of waiting for every image and font (window load).
export default function BootReady() {
  useEffect(() => {
    window.__bootReady?.();
  }, []);
  return null;
}
