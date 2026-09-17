import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "מדיניות עוגיות — גילברטו",
};

// Companion to /privacy — split into its own page (rather than folded into the privacy policy)
// since cookie disclosure is its own commonly-expected, commonly-linked document. Describes only
// what this app actually sets: no third-party analytics/ad tracking scripts exist anywhere in the
// codebase (confirmed by search) — every cookie/local-storage entry below is functional, not
// tracking. Same "starting draft, review before relying on it" status as /privacy.
export default function CookiesPolicyPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-sm leading-relaxed text-ink">
      <h1 className="text-xl font-bold mb-6">מדיניות עוגיות (Cookies)</h1>
      <p className="text-ink-soft mb-6">עודכן לאחרונה: {new Date().toLocaleDateString("he-IL")}</p>

      <section className="space-y-4">
        <p>
          גילברטו משתמשת בעוגיות (Cookies) ובאחסון מקומי בדפדפן (Local Storage) לצורך תפעול בסיסי של המערכת בלבד. אין באתר עוגיות
          מעקב, פרסום או ניתוח התנהגות של צד שלישי (כגון Google Analytics או פיקסל פרסומי) — כל עוגייה או פריט אחסון מפורטים כאן
          משרתים פונקציה תפעולית ישירה.
        </p>

        <h2 className="font-bold pt-2">עוגיות הכרחיות</h2>
        <ul className="list-disc pr-5 space-y-1">
          <li>עוגיית התחברות (session) — מזהה אתכם כמחוברים למערכת לאחר כניסה, ונמחקת ביציאה או בתום תוקפה. בלעדיה לא ניתן להשתמש במערכת.</li>
        </ul>

        <h2 className="font-bold pt-2">אחסון מקומי (Local Storage)</h2>
        <p>בנוסף לעוגיות, המערכת שומרת בדפדפן שלכם (לא בשרת) מספר הגדרות תצוגה אישיות:</p>
        <ul className="list-disc pr-5 space-y-1">
          <li>העדפת מצב תצוגה (בהיר / כהה).</li>
          <li>סימון אילו עדכוני מערכת כבר נצפו (כדי לא להציג שוב הודעה על עדכון שכבר ראיתם).</li>
          <li>מצב התקנה של האפליקציה כ-PWA (קיצור דרך למסך הבית).</li>
        </ul>
        <p>מידע זה נשאר על המכשיר שלכם בלבד, לא נשלח לשרת, וניתן לנקות אותו בכל עת דרך הגדרות הדפדפן.</p>

        <h2 className="font-bold pt-2">שליטה בעוגיות</h2>
        <p>
          ניתן לחסום או למחוק עוגיות דרך הגדרות הדפדפן שלכם בכל עת — אך שימו לב שחסימת עוגיית ההתחברות תמנע כניסה למערכת.
        </p>

        <h2 className="font-bold pt-2">יצירת קשר</h2>
        <p>
          לשאלות בנוגע למדיניות זו, ראו את{" "}
          <a href="/privacy" className="underline">
            מדיניות הפרטיות
          </a>{" "}
          ואת פרטי הקשר בעמוד{" "}
          <a href="/business-info" className="underline">
            פרטי העסק
          </a>
          .
        </p>
      </section>
    </div>
  );
}
