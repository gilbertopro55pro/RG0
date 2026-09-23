"use client";

import { IconClose } from "@/components/icons/AlbumIcons";

const STEPS = [
  {
    title: "נכנסים לאתר החשבון של Apple",
    body: [
      "פותחים דפדפן וגולשים לכתובת account.apple.com, לוחצים על \"Sign In\" בפינה הימנית העליונה, ומתחברים עם כתובת ה-Apple ID והסיסמה הרגילה שלכם (לא הסיסמה הייעודית, היא עדיין לא קיימת).",
    ],
    link: { href: "https://account.apple.com", label: "account.apple.com ←" },
  },
  {
    title: "מאתרים את קטע האבטחה",
    body: [
      "אחרי ההתחברות תראו את דף ניהול החשבון שלכם. מחפשים קטע בשם \"Sign-In and Security\" (כניסה ואבטחה) ולוחצים עליו.",
    ],
    note: "המסך הזה מוצג רק אחרי התחברות אישית, ולכן אין לו גרסה ציבורית שניתן לצלם, הוא שונה לכל משתמש ומוגן מאחורי הסיסמה שלכם.",
  },
  {
    title: "פותחים את מסך הסיסמאות הייעודיות",
    body: [
      "בתוך קטע האבטחה, מחפשים ולוחצים על \"App-Specific Passwords\" (סיסמאות ייעודיות לאפליקציה).",
    ],
  },
  {
    title: "יוצרים את הסיסמה",
    body: [
      "לוחצים על \"Generate an app-specific password\". Apple תבקש שם לזיהוי (למשל: \"גילברטו\"). זה רק לשימוש האישי שלכם.",
      "תוצג סיסמה בפורמט xxxx-xxxx-xxxx-xxxx. מעתיקים אותה עכשיו, Apple מציגה אותה פעם אחת בלבד ולא ניתן לראות אותה שוב מאוחר יותר (אפשר תמיד ליצור סיסמה חדשה אם היא הלכה לאיבוד).",
    ],
  },
  {
    title: "חוזרים לגילברטו ומסיימים",
    body: [
      "נכנסים להגדרות במערכת גילברטו → כרטיס \"יומן Apple (iCloud)\". מזינים את כתובת ה-Apple ID שלכם, ומדביקים את הסיסמה שהעתקתם בשלב הקודם בשדה App-Specific Password.",
      "לוחצים \"גילוי יומנים\". המערכת תציג רשימה של כל היומנים בחשבון ה-iCloud שלכם. בוחרים לאיזה יומן לסנכרן, וזהו. כל אירוע חדש שתוסיפו בגילברטו יופיע שם אוטומטית.",
    ],
    final: true,
  },
];

export default function AppleCalendarGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(28, 27, 25, 0.45)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold font-display">חיבור יומן Apple (iCloud)</h2>
          <button onClick={onClose} className="text-ink-soft text-xl leading-none px-1">
            <IconClose className="h-5 w-5" />
          </button>
        </div>
        <p className="text-xs text-ink-soft mb-4">
          מדריך מלא, שלב אחר שלב, ליצירת סיסמה ייעודית לחיבור וחיבור היומן שלכם. לא צריך ידע טכני. רק לעקוב אחרי השלבים בדיוק כפי שהם.
        </p>

        <div className="rounded-xl px-3.5 py-2.5 text-xs mb-4 bg-amber-bg text-amber-deep leading-relaxed">
          לפני שמתחילים: חייב להיות אימות דו-שלבי (Two-Factor Authentication) פעיל בחשבון ה-Apple ID שלכם. ברוב המקרים זה כבר פעיל כברירת מחדל באייפון מודרני.
        </div>

        <div className="space-y-3.5 mb-4">
          {STEPS.map((step, i) => (
            <div
              key={i}
              className={`rounded-2xl p-3.5 border ${step.final ? "bg-amber-deep text-white border-transparent" : "bg-card border-line"}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold font-data ${
                    step.final ? "bg-white/20 text-white" : "bg-amber-bg text-amber-deep"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="text-sm font-semibold">{step.title}</span>
              </div>
              {step.body.map((p, j) => (
                <p key={j} className={`text-xs leading-relaxed ${step.final ? "text-white/90" : "text-ink-soft"} ${j > 0 ? "mt-2" : ""}`}>
                  {p}
                </p>
              ))}
              {step.link && (
                <a
                  href={step.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-bg text-amber-deep"
                >
                  {step.link.label}
                </a>
              )}
              {step.note && (
                <div className="mt-2 text-[11px] leading-relaxed text-ink-soft rounded-lg px-2.5 py-2 border border-dashed border-line">
                  {step.note}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-xl px-3.5 py-2.5 text-xs mb-4 bg-white border border-line text-rose leading-relaxed">
          הסיסמה הייעודית משמשת רק לחיבור הזה, ואפשר לבטל אותה בכל רגע מתוך אותו מסך ב-Apple בלי להשפיע על שאר החשבון. לעולם אל תזינו כאן את הסיסמה הרגילה של ה-Apple ID.
        </div>

        <p className="text-[11px] text-ink-soft leading-relaxed mb-4">
          שלבים 2–3 מוצגים רק אחרי התחברות אישית ולכן אין להם צילום מסך ציבורי. למקור הרשמי והמעודכן ביותר של Apple, כולל תמונות:{" "}
          <a href="https://support.apple.com/en-us/102654" target="_blank" rel="noopener noreferrer" className="underline">
            support.apple.com/en-us/102654
          </a>
        </p>

        <button onClick={onClose} className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white">
          הבנתי, סגירה
        </button>
      </div>
    </div>
  );
}
