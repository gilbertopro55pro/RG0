import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "מדיניות פרטיות — גילברטו",
};

// Minimal privacy policy — the concrete blocker for submitting the Google OAuth consent screen
// for verification/production publishing (Google requires a hosted privacy-policy URL as part of
// that submission). This is a starting draft covering what the app actually does; it should be
// reviewed (and the contact details filled in) before relying on it as a real legal document.
export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-sm leading-relaxed text-ink">
      <h1 className="text-xl font-bold mb-6">מדיניות פרטיות</h1>
      <p className="text-ink-soft mb-6">עודכן לאחרונה: {new Date().toLocaleDateString("he-IL")}</p>

      <section className="space-y-4">
        <p>
          גילברטו היא מערכת לניהול תהליך עבודה של צלמי אירועים — ניהול אירועים, גלריות תמונות ללקוחות, הצעות מחיר, חוזים ותקשורת עם
          לקוחות. מדיניות זו מסבירה אילו מידע המערכת אוספת וכיצד הוא נשמר ומשמש.
        </p>

        <h2 className="font-bold pt-2">מידע שנאסף</h2>
        <ul className="list-disc pr-5 space-y-1">
          <li>פרטי חשבון הצלם/ת (שם, אימייל, טלפון) בעת ההרשמה.</li>
          <li>תמונות שהצלם/ת מעלה עבור לקוחותיו, ופרטי הלקוחות (שם, אימייל, טלפון) שהצלם/ת מזין במערכת.</li>
          <li>נתוני שימוש בסיסיים לתפעול המערכת (למשל: מועדי התחברות, פעולות בתוך המערכת).</li>
        </ul>

        <h2 className="font-bold pt-2">חיבור ליומן Google</h2>
        <p>
          צלם/ת שבוחר/ת לחבר את יומן ה-Google שלו/ה מעניק/ה למערכת הרשאה ליצור, לעדכן ולמחוק אירועים ביומן שלו/ה בלבד (הרשאת
          <span dir="ltr"> calendar.events </span>
          ), לצורך סנכרון אוטומטי של אירועי צילום. המערכת אינה קוראת אירועים אחרים ביומן ואינה משתפת את המידע הזה עם צד שלישי כלשהו.
          ניתן לנתק את החיבור בכל עת דרך הגדרות המערכת, וכן דרך{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer" className="underline">
            הגדרות ההרשאות של חשבון ה-Google
          </a>
          .
        </p>

        <h2 className="font-bold pt-2">שיתוף מידע</h2>
        <p>
          המידע אינו נמכר ואינו משותף עם צדדים שלישיים, למעט ספקי תשתית הכרחיים להפעלת המערכת (אחסון ענן, שליחת הודעות/מיילים) ולמעט
          כשנדרש על פי דין.
        </p>

        <h2 className="font-bold pt-2">אבטחה ומחיקה</h2>
        <p>
          המידע נשמר באמצעות ספקי ענן מאובטחים. ניתן לבקש מחיקת חשבון ומידע נלווה בפנייה ישירה לצלם/ת המפעיל/ה את המערכת, או ליצירת
          קשר ישיר עם מפעילי המערכת.
        </p>

        <h2 className="font-bold pt-2">יצירת קשר</h2>
        <p>
          לשאלות בנוגע למדיניות זו ניתן לפנות באמצעות פרטי הקשר בעמוד{" "}
          <a href="/business-info" className="underline">
            פרטי העסק
          </a>
          . למדיניות שימוש בעוגיות ראו את{" "}
          <a href="/cookies" className="underline">
            מדיניות העוגיות
          </a>
          .
        </p>
      </section>
    </div>
  );
}
