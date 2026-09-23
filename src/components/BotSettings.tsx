export default function BotSettings() {
  return (
    <div className="rounded-2xl p-4 bg-card border border-line shadow-card">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold tracking-wide">בוט AI לפניות חדשות בוואטסאפ</span>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0"
          style={{ background: "var(--color-chip)", color: "var(--color-ink-soft)" }}
        >
          בקרוב
        </span>
      </div>
      <p className="text-xs mb-2 text-ink-soft">
        כשלקוח/ה כותבים לוואטסאפ העסקי שלך, הבוט יבדוק זמינות מול היומן וישלח הצעת מחיר לפי המחירון
        או יעדכן שהתאריך תפוס ויוסיף אותם לרשימת המתנה. ההזמנה תיכנס למערכת רק אחרי שתאשר/י אותה בעצמך
        בעמוד הלידים.
      </p>
      <p className="text-xs text-ink-soft">
        התכונה ממתינה כרגע לאישור של מטא לתבניות ההודעות, ותופעל ברגע שהאישור יתקבל.
      </p>
    </div>
  );
}
