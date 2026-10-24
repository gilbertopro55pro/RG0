"use client";

import { useEffect, useState } from "react";
import { I18nProvider } from "@/i18n/client";
import { dirOf, type Lang } from "@/i18n/config";
import type { Messages } from "@/i18n/types";

// ClientLangScope for a page that is itself a client component (login, signup, reset password):
// importing ClientLangScope there put the merged dictionary (every area, ~830KB) in the page's own
// bundle, for every visitor. Hebrew needs no messages; English and Russian load the dictionary as
// a chunk of its own, only for them, and the page waits for it instead of showing Hebrew first.
export default function LazyLangScope({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const [messagesByLang, setMessagesByLang] = useState<Partial<Record<Lang, Messages>>>({ he: {} });
  const messages = messagesByLang[lang];

  useEffect(() => {
    if (messages) return;
    let cancelled = false;
    void import("@/i18n/dict").then(({ messagesFor }) => {
      if (!cancelled) setMessagesByLang((prev) => ({ ...prev, [lang]: messagesFor(lang) }));
    });
    return () => {
      cancelled = true;
    };
  }, [lang, messages]);

  if (!messages) return null;
  return (
    <I18nProvider lang={lang} messages={messages}>
      <div dir={dirOf(lang)} lang={lang} className="contents">
        {children}
      </div>
    </I18nProvider>
  );
}
