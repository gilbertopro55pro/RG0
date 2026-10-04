import type { Lang } from "@/i18n/config";
import { dateLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

// Billing/account emails to the photographer (subscription-lifecycle cron), in the photographer's
// own language (photographerLang(photographers.ui_lang)). Text only: what is sent, when and for how
// much is decided by the cron. Hebrew output is identical to what the cron sent before 2026-10-04.
// Dictionary: src/i18n/dict/billingNotify.ts. Admin emails stay in Hebrew and don't go through here.

type Email = { subject: string; text: string };

export function renewalReminderEmail(lang: Lang, p: { name: string; planLabel: string; periodEnd: string; amount: number }): Email {
  const t = makeT(messagesFor(lang));
  const date = new Date(p.periodEnd).toLocaleDateString(dateLocale(lang));
  return {
    subject: t("המנוי שלך יחודש בקרוב | {date}", { date }),
    text: t(
      "שלום {name},\n\nהמנוי {plan} שלך במערכת גילברטו יחודש אוטומטית בתאריך {date} בסך ₪{amount}.\nאם ברצונך לכבות את החידוש האוטומטי, ניתן לעשות זאת בכל עת מתוך הגדרות > מנוי.\n\nתודה שאת/ה חלק מהמערכת!",
      { name: p.name, plan: t(p.planLabel), date, amount: p.amount },
    ),
  };
}

export function planSwitchEmail(
  lang: Lang,
  p: { name: string; targetLabel: string; targetAmount: number; targetPricePerMonth: number; wasOnLongCycle: boolean; paymentLink: string },
): Email {
  const t = makeT(messagesFor(lang));
  const plan = t(p.targetLabel);
  const reason = p.wasOnLongCycle
    ? t(
        "זהו החיוב עבור החודשים ה-11 וה-12 של תקופת המנוי הקודמת שלך, בעקבות המעבר למסלול {plan} שביקשת, במקום שיהיו חינמיים כמו במסלול הקודם. החל מהמחזור שאחרי כן תחויב/י ₪{price} מדי חודש כמסלול {plan} רגיל.",
        { plan, price: p.targetPricePerMonth },
      )
    : t("כפי שביקשת, המנוי שלך עובר למסלול {plan} (₪{amount}) החל מהמחזור הבא.", { plan, amount: p.targetAmount });
  return {
    subject: t("המעבר למסלול החדש שלך | נדרשת השלמת תשלום"),
    text: t("שלום {name},\n\n{reason}\n\nלהשלמת התשלום: {link}\n\nתודה!", { name: p.name, reason, link: p.paymentLink }),
  };
}

export function trialEndingEmail(lang: Lang, p: { name: string; siteUrl: string }): Email {
  const t = makeT(messagesFor(lang));
  return {
    subject: t("תקופת הניסיון בגילברטו מסתיימת מחר"),
    text: t(
      "שלום {name},\n\nתקופת הניסיון שלך במערכת גילברטו מסתיימת מחר. כדי להמשיך לעבוד בלי הפסקה, בוחרים מסלול כאן:\n{url}/billing\n\nכל האירועים, הגלריות והלקוחות שהכנסת נשמרים 30 יום אחרי סוף הניסיון, ואחרי התשלום ממשיכים בדיוק מאיפה שעצרת. בלי תשלום עד אז, החשבון והנתונים נמחקים.\n\nצוות גילברטו",
      { name: p.name, url: p.siteUrl },
    ),
  };
}

function deletionDate(lang: Lang, deleteAt: Date): string {
  return deleteAt.toLocaleDateString(dateLocale(lang), { timeZone: "Asia/Jerusalem" });
}

export function trialDeletionWarningEmail(lang: Lang, p: { name: string; deleteAt: Date; retentionDays: number; siteUrl: string }): Email {
  const t = makeT(messagesFor(lang));
  const date = deletionDate(lang, p.deleteAt);
  return {
    subject: t("החשבון שלך בגילברטו יימחק ב-{date}", { date }),
    text: t(
      "שלום {name},\n\nתקופת הניסיון שלך בגילברטו הסתיימה, ועדיין לא נבחר מסלול. כפי שמופיע בתנאי השימוש, הנתונים נשמרים {days} יום מסוף הניסיון, ולכן ב-{date} החשבון וכל מה שבו יימחקו לצמיתות: האירועים, הלקוחות, הגלריות והתמונות.\n\nכדי לשמור הכל ולהמשיך בדיוק מאיפה שעצרת, בוחרים מסלול כאן:\n{url}/billing\n\nצוות גילברטו",
      { name: p.name, days: p.retentionDays, date, url: p.siteUrl },
    ),
  };
}

export function trialDeletionFinalWarningEmail(lang: Lang, p: { name: string; siteUrl: string }): Email {
  const t = makeT(messagesFor(lang));
  return {
    subject: t("תזכורת אחרונה: החשבון שלך בגילברטו יימחק מחר"),
    text: t(
      "שלום {name},\n\nמחר החשבון שלך בגילברטו וכל הנתונים שבו יימחקו לצמיתות, כי תקופת הניסיון הסתיימה ולא נבחר מסלול. אחרי המחיקה אי אפשר לשחזר אותם.\n\nכדי לשמור הכל, בוחרים מסלול היום:\n{url}/billing\n\nצוות גילברטו",
      { name: p.name, url: p.siteUrl },
    ),
  };
}
