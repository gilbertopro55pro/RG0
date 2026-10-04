"use client";

import Link from "next/link";
import { LANGS, LANG_LABELS, isLang, type Lang } from "@/i18n/config";

// Sign-in / sign-up / reset-password in English and Russian (2026-10-04): the page language comes
// from ?lang=en|ru (no param = Hebrew, exactly as before), so a photographer arriving from the /en
// or /ru landing page stays in their language. Links between these pages keep the ?lang.

// Remembered across the Supabase reset-password email round trip: the redirect URL itself stays
// exactly /reset-password (it has to match Supabase's redirect allow-list), so the language the
// reset was requested in rides along in this device's storage instead (read by /reset-password).
export const RESET_LANG_KEY = "auth_reset_lang";

export function authLangFrom(value: string | string[] | undefined): Lang {
  const v = Array.isArray(value) ? value[0] : value;
  return isLang(v) ? v : "he";
}

export function withLang(href: string, lang: Lang): string {
  if (lang === "he") return href;
  return `${href}${href.includes("?") ? "&" : "?"}lang=${lang}`;
}

export default function AuthLangSwitcher({ path, lang, className = "" }: { path: string; lang: Lang; className?: string }) {
  return (
    <nav aria-label="Language" className={`flex items-center gap-1.5 text-sm ${className}`}>
      {LANGS.map((l, i) => (
        <span key={l} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden="true" className="opacity-50">·</span>}
          {l === lang ? (
            <span lang={l} aria-current="true" className="font-semibold">
              {LANG_LABELS[l]}
            </span>
          ) : (
            <Link lang={l} href={withLang(path, l)} replace scroll={false} className="underline-offset-4 hover:underline opacity-80 hover:opacity-100">
              {LANG_LABELS[l]}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
