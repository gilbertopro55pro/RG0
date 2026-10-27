import Link from "next/link";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { getT } from "@/i18n/server";
import SwitchAccountButton from "@/components/SwitchAccountButton";

// The app's 404: an address that doesn't exist, or notFound() in a page. The common case is a
// photographer opening a link from an email or a phone notification while signed in to another
// account (a second studio, the test account): RLS hides the other account's event, gallery or
// album corrections, and Next's default page said only "This page could not be found". This one
// names the account that is signed in and offers signing in to the other one, back to the same link.
export default async function NotFound() {
  const [user, t] = await Promise.all([getSessionUser(), getT()]);
  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl p-6 text-center bg-card border border-line shadow-card">
        <h1 className="text-xl font-bold mb-2 font-display">{t("הדף לא נמצא")}</h1>
        {user ? (
          <>
            <p className="text-sm text-ink-soft">{t("הדף לא נמצא בחשבון שמחובר עכשיו:")}</p>
            {user.email && (
              <p className="text-sm font-semibold mt-1 break-all" dir="ltr">
                {user.email}
              </p>
            )}
            <p className="text-sm text-ink-soft mt-3 mb-5">
              {t("אם הגעתם מקישור במייל או בהתראה, ייתכן שהוא שייך לחשבון אחר. התחברו לחשבון הזה, והקישור ייפתח.")}
            </p>
            <SwitchAccountButton label={t("התחברות לחשבון אחר")} />
            <Link href="/" className="block w-full rounded-xl py-3 mt-2 text-sm font-semibold border border-line text-ink">
              {t("למסך הבית")}
            </Link>
          </>
        ) : (
          <p className="text-sm text-ink-soft">{t("הקישור לא קיים, או שהדף כבר לא זמין.")}</p>
        )}
      </div>
    </main>
  );
}
