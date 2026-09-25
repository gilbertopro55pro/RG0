import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "תקנון שימוש — גילברטו",
};

// Standard, expected page for a paid subscription service — was missing entirely until now (only
// /privacy existed). Same "starting draft, review before relying on it as a full legal contract"
// status as the other policy pages — grounded in what the app actually does (subscription tiers
// in src/lib/stages.ts, the cancel/reactivate flow in BillingSettings.tsx, the non-retroactive
// "data stays, nothing deleted on cancel" behavior already true elsewhere in the app) rather than
// generic boilerplate that promises something the product doesn't do.
export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-sm leading-relaxed text-ink">
      <h1 className="text-xl font-bold mb-6">תקנון שימוש</h1>
      <p className="text-ink-soft mb-6">עודכן לאחרונה: {new Date().toLocaleDateString("he-IL")}</p>

      <section className="space-y-4">
        <p>
          תקנון זה חל על השימוש במערכת גילברטו (&quot;המערכת&quot;), המופעלת על ידי רועי גלברט, עוסק מורשה (&quot;אנחנו&quot;
          / &quot;מפעילת המערכת&quot;). הרשמה לשירות או שימוש בו מהווים הסכמה לתנאים המפורטים כאן. לפרטי העסק המלאים ראו את{" "}
          <a href="/business-info" className="underline">
            עמוד פרטי העסק
          </a>
          .
        </p>

        <h2 className="font-bold pt-2">מהות השירות</h2>
        <p>
          גילברטו היא מערכת ניהול תהליך עבודה לצלמי אירועים — ניהול אירועים ולידים, גלריות תמונות ללקוחות, חוזים דיגיטליים,
          תזכורות תשלום ועורך אלבומים. השירות מיועד לשימוש עסקי על ידי צלמים ובעלי עסקי צילום, לא לצרכנים פרטיים.
        </p>

        <h2 className="font-bold pt-2">חשבון המשתמש</h2>
        <ul className="list-disc pr-5 space-y-1">
          <li>יש להירשם עם פרטים נכונים ולעדכן אותם במידת הצורך.</li>
          <li>המשתמש/ת אחראי/ת לשמירה על סודיות פרטי ההתחברות ולכל פעולה המתבצעת בחשבון.</li>
          <li>אסור להשתמש במערכת למטרה בלתי חוקית, או באופן הפוגע בצד שלישי.</li>
        </ul>

        <h2 className="font-bold pt-2">מנוי ותשלום</h2>
        <ul className="list-disc pr-5 space-y-1">
          <li>השירות ניתן במסלולי מנוי בתשלום (חודשי או שנתי), כמפורט בדף התמחור באתר.</li>
          <li>
            חשבון חדש מקבל תקופת ניסיון חינם של 14 יום, ללא צורך בפרטי אמצעי תשלום, עם כל האפשרויות של מסלול פרו+ ומכסת אחסון
            של 5GB. בתום תקופת הניסיון הגישה למערכת מותנית בבחירת מסלול ובתשלום; הנתונים שהוזנו נשמרים 30 יום מתום הניסיון, ואם לא נבחר מסלול עד אז, החשבון וכל הנתונים שבו (כולל תמונות וקבצים) נמחקים לצמיתות. שבוע לפני המחיקה ויום לפניה נשלחת התראה לכתובת המייל של החשבון. תקופת ניסיון אחת לכל
            מספר טלפון.
          </li>
          <li>החיוב מתבצע מראש עבור כל מחזור, ומתחדש אוטומטית עד לביטול המנוי.</li>
          <li>ניתן לבטל את החידוש האוטומטי בכל עת דרך הגדרות המערכת — הגישה לשירות נשארת פעילה עד תום מחזור החיוב ששולם, ולא מתבצע חיוב נוסף לאחר מכן.</li>
          <li>
            למדיניות המלאה בנוגע לביטול, החזרים ומעבר בין מסלולים ראו את{" "}
            <a href="/cancellation-policy" className="underline">
              מדיניות הביטולים
            </a>
            .
          </li>
        </ul>

        <h2 className="font-bold pt-2">תוכן ובעלות</h2>
        <ul className="list-disc pr-5 space-y-1">
          <li>התמונות, פרטי הלקוחות והתוכן שהצלם/ת מעלה/ה למערכת נשארים בבעלותו/ה המלאה — המערכת משמשת ככלי ניהול ואחסון בלבד, ואינה תובעת זכויות על תוכן זה.</li>
          <li>הצלם/ת אחראי/ת לוודא שיש לו/ה את כל ההרשאות הנדרשות לתוכן שהוא/היא מעלה/ה למערכת (לרבות תמונות לקוחות).</li>
          <li>אסור להעלות תוכן הפוגע בזכויות יוצרים, בפרטיות, או המהווה עבירה על פי דין.</li>
        </ul>

        <h2 className="font-bold pt-2">זמינות השירות ואחריות</h2>
        <p>
          אנו פועלים לשמור על זמינות ותקינות השירות, אך אינו מתחייב לזמינות רציפה ללא הפרעות. השירות ניתן &quot;כמות
          שהוא&quot; (AS IS). ככל שהדין מתיר זאת, לא נהיה אחראים לנזק עקיף שייגרם כתוצאה משימוש במערכת או מהפסקתה, למעט
          במקרים של רשלנות חמורה או זדון.
        </p>

        <h2 className="font-bold pt-2">שינויים בשירות ובתקנון</h2>
        <p>
          אנו רשאים לעדכן את השירות ואת תקנון זה מעת לעת. שינויים מהותיים יפורסמו באתר. המשך השימוש בשירות לאחר עדכון
          מהווה הסכמה לתנאים המעודכנים.
        </p>

        <h2 className="font-bold pt-2">דין וסמכות שיפוט</h2>
        <p>על תקנון זה יחולו דיני מדינת ישראל, וסמכות השיפוט הבלעדית נתונה לבתי המשפט המוסמכים במחוז שבו מתנהל העסק.</p>

        <h2 className="font-bold pt-2">יצירת קשר</h2>
        <p>
          לשאלות בנוגע לתקנון זה ניתן לפנות באמצעות פרטי הקשר בעמוד{" "}
          <a href="/business-info" className="underline">
            פרטי העסק
          </a>
          .
        </p>
      </section>
    </div>
  );
}
