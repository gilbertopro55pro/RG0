"use client";

import { use, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";
import ClientLangScope from "@/i18n/ClientLangScope";
import { useT } from "@/i18n/client";
import { isLang, type Lang } from "@/i18n/config";
import AuthLangSwitcher, { RESET_LANG_KEY, authLangFrom } from "@/components/AuthLangSwitcher";

export default function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const param = use(searchParams).lang;
  // The link in Supabase's reset email comes back as plain /reset-password (no ?lang — it must
  // match the redirect allow-list), so fall back to the language the reset was requested in on
  // this device (saved by the login page). ?lang, when present, wins.
  const stored = useSyncExternalStore(noSubscribe, readStoredResetLang, () => null);
  const lang = param ? authLangFrom(param) : (stored ?? "he");
  return (
    <ClientLangScope lang={lang}>
      <ResetPasswordForm lang={lang} />
    </ClientLangScope>
  );
}

const noSubscribe = () => () => {};
function readStoredResetLang(): Lang | null {
  try {
    const v = localStorage.getItem(RESET_LANG_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

function ResetPasswordForm({ lang }: { lang: Lang }) {
  const t = useT();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // supabase-js reads the recovery token out of the URL hash on load and exchanges it for a
  // real (short-lived, password-update-only) session automatically — this just waits for that
  // to land before showing the form, and flags the link as invalid/expired if it never does.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      else setInvalidLink(true);
    });
  }, []);

  const submit = async () => {
    if (!password || password.length < 6) {
      setError(t("הסיסמה חייבת להכיל לפחות 6 תווים"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("הסיסמאות לא תואמות"));
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(
        /password/i.test(updateError.message) && /different|same/i.test(updateError.message)
          ? t("הסיסמה החדשה חייבת להיות שונה מהקודמת.")
          : /password/i.test(updateError.message)
            ? t("הסיסמה חלשה מדי. בחרו סיסמה של 6 תווים לפחות.")
            : t("עדכון הסיסמה נכשל. נסו שוב, או בקשו קישור חדש.")
      );
      return;
    }
    setDone(true);
    try {
      localStorage.removeItem(RESET_LANG_KEY);
    } catch {}
    // A reset done in English/Russian opens the app in that language (the session exists now).
    if (lang !== "he") {
      await fetch("/api/ui-language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      }).catch(() => {});
    }
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1800);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <AuthLangSwitcher path="/reset-password" lang={lang} className="mb-5 text-ink-soft" />
      <Image src="/icons/icon-192.png" alt={t("לוגו המערכת")} width={72} height={72} className="rounded-2xl shadow-card mb-5" priority />
      <div className="w-full max-w-sm rounded-2xl p-5 bg-card border border-line shadow-card">
        <h1 className="text-xl font-bold mb-5 font-display">{t("בחירת סיסמה חדשה")}</h1>

        {!ready && !invalidLink && (
          <div className="flex justify-center py-6">
            <Spinner className="h-6 w-6" />
          </div>
        )}

        {invalidLink && (
          <p className="text-sm text-rose">
            {t("הקישור לא תקין או שפג תוקפו. חזרו למסך ההתחברות ובקשו קישור חדש דרך \"שכחתי סיסמה\".")}
          </p>
        )}

        {ready && !done && (
          <div className="space-y-3">
            <div>
              <label className="text-xs block mb-1 text-ink-soft">{t("סיסמה חדשה")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm border border-line"
              />
            </div>
            <div>
              <label className="text-xs block mb-1 text-ink-soft">{t("אימות סיסמה")}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="w-full rounded-lg px-3 py-2 text-sm border border-line"
              />
            </div>
            {error && <p className="text-xs text-rose">{error}</p>}
            <button
              onClick={submit}
              disabled={saving}
              className="w-full rounded-xl py-3 text-sm font-semibold mt-2 bg-ink text-white disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving && <Spinner light />}
              {saving ? t("שומר...") : t("שמירת סיסמה")}
            </button>
          </div>
        )}

        {done && <p className="text-sm text-sage font-medium">{t("הסיסמה עודכנה בהצלחה! מעביר אתכם למערכת...")}</p>}
      </div>
    </div>
  );
}
