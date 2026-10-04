"use client";

import { usePathname } from "next/navigation";
import { useLang } from "@/i18n/client";

// Pages that aren't translated yet (phase 1 covers the photographer's screens only): client-facing
// pages, sign-in/sign-up, legal pages and the landing page stay Hebrew right-to-left even when the
// device's UI language is English or Russian, instead of showing Hebrew text in a mirrored layout.
const HEBREW_ONLY_PREFIXES = [
  "/landing", "/login", "/signup", "/reset-password", "/gallery", "/contracts", "/portal", "/quotes", "/p", "/chat", "/print",
  "/terms", "/privacy", "/cookies", "/cancellation-policy", "/accessibility", "/business-info", "/desktop-handoff",
];

export function isHebrewOnlyPath(pathname: string): boolean {
  return HEBREW_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default function LangScope({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const lang = useLang();
  if (lang === "he" || !isHebrewOnlyPath(pathname)) return <>{children}</>;
  // display: contents keeps the layout exactly as it was; dir/lang still apply to everything inside.
  return (
    <div dir="rtl" lang="he" className="contents">
      {children}
    </div>
  );
}
