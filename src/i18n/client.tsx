"use client";

import { createContext, useContext, useMemo } from "react";
import type { Lang } from "@/i18n/config";
import type { Messages } from "@/i18n/types";
import { makeT, type TFn } from "@/i18n/translate";

const I18nContext = createContext<{ lang: Lang; messages: Messages }>({ lang: "he", messages: {} });

// Mounted once in the root layout with the current language's messages (empty for Hebrew).
export function I18nProvider({ lang, messages, children }: { lang: Lang; messages: Messages; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, messages }), [lang, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): TFn {
  const { messages } = useContext(I18nContext);
  return useMemo(() => makeT(messages), [messages]);
}

export function useLang(): Lang {
  return useContext(I18nContext).lang;
}
