import Link from "next/link";
import { getT } from "@/i18n/server";

// Home-screen notice for the last days of the free trial (from TRIAL_BANNER_DAYS_LEFT days left).
export default async function TrialBanner({ daysLeft }: { daysLeft: number }) {
  const t = await getT();
  const title =
    daysLeft <= 1
      ? t("תקופת הניסיון מסתיימת היום")
      : daysLeft === 2
        ? t("תקופת הניסיון מסתיימת מחר")
        : t("תקופת הניסיון מסתיימת בעוד {n} ימים", { n: daysLeft });
  return (
    <div className="rounded-2xl bg-card p-4 mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-bold">{title}</div>
        <div className="text-xs text-ink-soft mt-0.5">{t("כדי להמשיך בלי הפסקה, בוחרים מסלול. כל מה שהכנסתם נשמר.")}</div>
      </div>
      <Link href="/billing" className="shrink-0 rounded-xl px-3.5 py-2.5 text-sm font-bold bg-ink text-white">
        {t("בחירת מסלול")}
      </Link>
    </div>
  );
}
