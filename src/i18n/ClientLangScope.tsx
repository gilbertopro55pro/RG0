import { I18nProvider } from "@/i18n/client";
import { dirOf, type Lang } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";

// Wraps a client-facing page (quote, contract, portal, gallery, chat) in the CLIENT's language,
// independent of the photographer's own ui_lang cookie: its own provider for useT(), and its own
// direction, so a Hebrew client page stays RTL on a device set to English and vice versa.
// Server components on these pages translate with makeT(messagesFor(lang)) from the same lang.
export default function ClientLangScope({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return (
    <I18nProvider lang={lang} messages={messagesFor(lang)}>
      <div dir={dirOf(lang)} lang={lang} className="contents">
        {children}
      </div>
    </I18nProvider>
  );
}
