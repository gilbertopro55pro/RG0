"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";

export default function ResetPasswordPage() {
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
      setError("הסיסמה חייבת להכיל לפחות 6 תווים");
      return;
    }
    if (password !== confirmPassword) {
      setError("הסיסמאות לא תואמות");
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
          ? "הסיסמה החדשה חייבת להיות שונה מהקודמת."
          : /password/i.test(updateError.message)
            ? "הסיסמה חלשה מדי. בחרו סיסמה של 6 תווים לפחות."
            : "עדכון הסיסמה נכשל. נסו שוב, או בקשו קישור חדש."
      );
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1800);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <Image src="/icons/icon-192.png" alt="לוגו המערכת" width={72} height={72} className="rounded-2xl shadow-card mb-5" priority />
      <div className="w-full max-w-sm rounded-2xl p-5 bg-card border border-line shadow-card">
        <h1 className="text-xl font-bold mb-5 font-display">בחירת סיסמה חדשה</h1>

        {!ready && !invalidLink && (
          <div className="flex justify-center py-6">
            <Spinner className="h-6 w-6" />
          </div>
        )}

        {invalidLink && (
          <p className="text-sm text-rose">
            הקישור לא תקין או שפג תוקפו. חזרו למסך ההתחברות ובקשו קישור חדש דרך &quot;שכחתי סיסמה&quot;.
          </p>
        )}

        {ready && !done && (
          <div className="space-y-3">
            <div>
              <label className="text-xs block mb-1 text-ink-soft">סיסמה חדשה</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm border border-line"
              />
            </div>
            <div>
              <label className="text-xs block mb-1 text-ink-soft">אימות סיסמה</label>
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
              {saving ? "שומר..." : "שמירת סיסמה"}
            </button>
          </div>
        )}

        {done && <p className="text-sm text-sage font-medium">הסיסמה עודכנה בהצלחה! מעביר אתכם למערכת...</p>}
      </div>
    </div>
  );
}
