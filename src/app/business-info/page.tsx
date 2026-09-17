import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "פרטי העסק — גילברטו",
};

// Standard "who is actually behind this service" disclosure page — linked from /privacy,
// /cookies, /accessibility, /terms and /cancellation-policy. A dedicated public contact email is
// still outstanding (gilbertopro_admin@gmail.com is a known non-real mailbox — see
// notificationEmailFor's own comment — never use it here); until one is provided, contact routes
// through the WhatsApp channel already used throughout the app rather than an email address.
export default function BusinessInfoPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-sm leading-relaxed text-ink">
      <h1 className="text-xl font-bold mb-6">פרטי העסק</h1>

      <section className="space-y-4">
        <div>
          <h2 className="font-bold pt-2 mb-1">שם העסק</h2>
          <p>רועי גלברט — צילום אירועים</p>
        </div>

        <div>
          <h2 className="font-bold pt-2 mb-1">סוג העסק</h2>
          <p>עוסק מורשה</p>
        </div>

        <div>
          <h2 className="font-bold pt-2 mb-1">מספר עוסק מורשה (ח.פ)</h2>
          <p dir="ltr" className="text-right font-data">039119243</p>
        </div>

        <div>
          <h2 className="font-bold pt-2 mb-1">כתובת</h2>
          <p>האשה העברייה 16, קריית גת</p>
        </div>

        <div>
          <h2 className="font-bold pt-2 mb-1">אודות המערכת</h2>
          <p>
            גילברטו היא מערכת לניהול תהליך עבודה של צלמי אירועים, המופעלת ומפותחת על ידי רועי גלברט. לפרטים נוספים ראו את{" "}
            <a href="/privacy" className="underline">
              מדיניות הפרטיות
            </a>
            , את{" "}
            <a href="/terms" className="underline">
              תקנון השימוש
            </a>
            , את{" "}
            <a href="/cancellation-policy" className="underline">
              מדיניות הביטולים
            </a>{" "}
            ואת{" "}
            <a href="/accessibility" className="underline">
              הצהרת הנגישות
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
