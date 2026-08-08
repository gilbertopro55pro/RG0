export type ChangelogEntry = {
  version: string;
  date: string;
  changes: string[];
};

// Newest first. CURRENT_VERSION is derived from entries[0] — bump a version by adding a new
// entry at the top, not by editing this constant directly.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.1.0",
    date: "2026-08-08",
    changes: [
      "לשונית \"עדכונים\" חדשה בהגדרות — כל היסטוריית העדכונים זמינה לצפייה בכל רגע",
      "תיקון תצוגה בנייד: שדה תאריך הצילום ומשך שמירת הגלריה לא הופיעו נכון זה לצד זה במסכים צרים",
      "אימות דומיין למיילים היוצאים מהמערכת — תזכורות פקיעת גלריה מגיעות כעת ללקוחות באמת",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-08-08",
    changes: [
      "מסך יצירה/עריכה חדש לגלריות, עם לשוניות פרטים והרשאות — גם לגלריה עצמאית וגם ליצירת גלריה ישירות מתוך אירוע",
      "אפשרות לכבות הורדת קבצים מקוריים מהגלריה, לבחירת הצלם/ת",
      "קישור לפורטל הלקוח נשלח אוטומטית ב-WhatsApp ברגע שנוצר אירוע חדש",
      "תזכורת אוטומטית ללקוח שבוע לפני שהגלריה נמחקת סופית מהמערכת",
      "חיזוק אבטחה: אימות חתימה על הודעות נכנסות מ-WhatsApp",
      "שיפורי מצב כהה ותיקוני תצוגה שונים",
    ],
  },
];

export const CURRENT_VERSION = CHANGELOG[0].version;
