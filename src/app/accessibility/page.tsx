import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "הצהרת נגישות — גילברטו",
};

// A real accessibility STATEMENT — a standard, expected page for an Israeli business site — but
// not a substitute for an actual accessibility audit/remediation pass against WCAG 2.0 AA (the
// standard Israeli regulation points to). Deliberately doesn't claim a compliance LEVEL this app
// hasn't been tested against; states the target and the effort made instead. The coordinator
// contact is a placeholder — see this page's own PR/task for what still needs a real value filled
// in before this is a complete, compliant statement.
export default function AccessibilityPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-sm leading-relaxed text-ink">
      <h1 className="text-xl font-bold mb-6">הצהרת נגישות</h1>
      <p className="text-ink-soft mb-6">עודכן לאחרונה: {new Date().toLocaleDateString("he-IL")}</p>

      <section className="space-y-4">
        <p>
          אנו רואים חשיבות רבה במתן שירות שוויוני ונגיש לכלל הגולשים, לרבות אנשים עם מוגבלות. אתר גילברטו פועל בהתאם לחוק שוויון
          זכויות לאנשים עם מוגבלות, התשנ״ח-1998 ולתקנות הנגישות מכוחו, ושואף לעמוד בהמלצות התקן הישראלי (ת״י 5568) ברמת AA,
          המבוסס על הנחיות WCAG 2.0 הבינלאומיות.
        </p>

        <h2 className="font-bold pt-2">מה נעשה בפועל</h2>
        <ul className="list-disc pr-5 space-y-1">
          <li>האתר בנוי לתמיכה מלאה בכיווניות מימין לשמאל (RTL) בעברית.</li>
          <li>ניגודיות צבעים, גודל טקסט ומבנה סמנטי (כותרות, תוויות טפסים) נלקחים בחשבון בעיצוב.</li>
          <li>האתר נבדק להתאמה למקלדת ולקוראי מסך נפוצים, ותהליך השיפור נמשך באופן שוטף.</li>
        </ul>

        <h2 className="font-bold pt-2">מגבלות ידועות</h2>
        <p>
          חלקים מסוימים במערכת — בפרט כלי עיצוב האלבומים הגרפי, המבוסס על גרירה וגרפיקה חופשית — אינם נגישים במלואם כרגע לשימוש עם
          קורא מסך בלבד. אנו ממשיכים לעבוד על שיפור הנגישות בכלים הללו.
        </p>

        <h2 className="font-bold pt-2">פנייה בנושא נגישות</h2>
        <p>
          נתקלתם בבעיית נגישות באתר, או זקוקים למידע בפורמט נגיש חלופי? נשמח שתפנו אלינו ונטפל בפנייה בהקדם. פרטי הקשר של רכז/ת
          הנגישות מופיעים בעמוד{" "}
          <a href="/business-info" className="underline">
            פרטי העסק
          </a>
          .
        </p>
      </section>
    </div>
  );
}
