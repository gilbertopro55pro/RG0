import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "מדיניות ביטולים — גילברטו",
};

// Its own standalone, discoverable page rather than only the short in-product copy on the cancel
// confirmation dialog (BillingSettings.tsx) — per explicit request, "פורמלית ונגישה כעמוד עצמאי".
// Describes the ACTUAL mechanics this app implements (verified against BillingSettings.tsx,
// payplus.ts's computePlanSwitchEffectiveDate, and the subscription-lifecycle cron), not generic
// cancellation boilerplate that would promise behavior the product doesn't actually have.
export default function CancellationPolicyPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-sm leading-relaxed text-ink">
      <h1 className="text-xl font-bold mb-6">מדיניות ביטולים</h1>
      <p className="text-ink-soft mb-6">עודכן לאחרונה: {new Date().toLocaleDateString("he-IL")}</p>

      <section className="space-y-4">
        <h2 className="font-bold pt-2">תקופת ניסיון</h2>
        <p>
          תקופת הניסיון (14 יום) אינה כרוכה בפרטי אמצעי תשלום ולכן אין צורך לבטל אותה: אם לא נבחר מסלול עד סופה, פשוט לא
          מתבצע חיוב, והגישה למערכת נעצרת עד לבחירת מסלול. הנתונים שהוזנו בזמן הניסיון נשמרים 30 יום מתום הניסיון; אם לא נבחר מסלול עד אז, החשבון וכל הנתונים שבו נמחקים לצמיתות. שבוע לפני המחיקה ויום לפניה נשלחת התראה במייל.
        </p>

        <h2 className="font-bold pt-2">ביטול מנוי</h2>
        <ul className="list-disc pr-5 space-y-1">
          <li>ניתן לכבות את החידוש האוטומטי בכל עת, ללא צורך בהסבר, דרך הגדרות המערכת (מנוי → ביטול מנוי).</li>
          <li>ביטול החידוש האוטומטי אינו מפסיק את הגישה מיידית — הגישה למערכת נשארת פעילה במלואה עד תום מחזור החיוב הנוכחי ששולם בפועל (חודשי או שנתי, לפי המסלול).</li>
          <li>לא יתבצע חיוב נוסף לאחר תום אותו מחזור.</li>
          <li>הביטול פועל קדימה בלבד — אין החזר כספי יחסי על חלק ממחזור חיוב שכבר שולם.</li>
        </ul>

        <h2 className="font-bold pt-2">מה קורה לנתונים שלי</h2>
        <p>
          שום מידע לא נמחק כתוצאה מביטול — האירועים, הגלריות, החוזים והתמונות שלכם נשארים שמורים במערכת במלואם. ניתן להפעיל
          את המנוי מחדש בכל עת דרך מסך ההרשמה לתשלום, ולחזור בדיוק מאיפה שעצרתם.
        </p>

        <h2 className="font-bold pt-2">מעבר בין מסלולים</h2>
        <p>
          מעבר בין מסלולים (למשל משדרוג לפרו+ או מעבר בין חיוב חודשי לשנתי) אינו משנה את המחזור הנוכחי ששולם — השינוי נכנס
          לתוקף רק מהחיוב הבא, כך שלא משלמים כפול על מה ששולם כבר. במעבר ממסלול שנתי, עשרת החודשים הראשונים של אותה תקופה
          נותרים ללא שינוי כפי ששולמו, ורק שני החודשים האחרונים (שבמסלול הקודם היו חינמיים) מחויבים לפי המסלול החדש; משם
          ואילך ממשיך חיוב רגיל לפי המסלול החדש.
        </p>

        <h2 className="font-bold pt-2">תשלום שנכשל</h2>
        <p>
          אם חיוב מחזורי נכשל (למשל עקב כרטיס שפג תוקפו), הגישה למערכת מוגבלת עד לעדכון אמצעי התשלום דרך מסך ההגדרות —
          הנתונים עצמם נשארים שמורים ואינם נפגעים.
        </p>

        <h2 className="font-bold pt-2">יצירת קשר</h2>
        <p>
          לשאלות בנוגע לביטול או לחיוב ניתן לפנות באמצעות פרטי הקשר בעמוד{" "}
          <a href="/business-info" className="underline">
            פרטי העסק
          </a>
          . למדיניות הכללית ראו את{" "}
          <a href="/terms" className="underline">
            תקנון השימוש
          </a>
          .
        </p>
      </section>
    </div>
  );
}
