import { LANDING_CONTAINER } from "@/components/LandingChrome";

// Landing section for the quote flow (owner, 2026-10-01): one WhatsApp link takes the client from
// the quote to an approved booking, a questionnaire, a signed contract and an event in the calendar.
// The video (public/guides/quote-flow.mp4, 24s) is the app's real screens with demo data.

const STEPS = [
  { n: "1", title: "שולחים קישור, לא קובץ", text: "לחיצה על „שליחה ללקוח/ה״ פותחת את וואטסאפ עם הודעה מוכנה: שם הלקוח, האירוע, התאריך והקישור להצעה." },
  { n: "2", title: "הלקוח מאשר בטלפון", text: "ההצעה נפתחת בעמוד מעוצב עם הלוגו שלכם, הפריטים והסכום. לחיצה אחת והיא מאושרת." },
  { n: "3", title: "שאלון קצר, אירוע ביומן", text: "הלקוח משלים את פרטי האירוע, והאירוע נפתח לבד ביומן שלכם, עם כל השלבים." },
  { n: "4", title: "חוזה באותו קישור", text: "בוחרים לשלוח גם חוזה, והלקוח חותם עליו בסוף השאלון. מקבלים עדכון לטלפון, והליד יוצא מהרשימה." },
];

export default function LandingQuoteSection() {
  return (
    <section id="quotes" className="bg-[var(--l-bg-alt)] scroll-mt-4">
      <div className={`${LANDING_CONTAINER} py-16 lg:py-28 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-12 lg:gap-20`}>
        <div className="flex flex-col gap-6 lg:gap-7 lg:max-w-[620px]">
          <div className="flex items-center gap-2.5 text-sm lg:text-[15px] text-[var(--l-ink-soft)]">
            <span className="w-2 h-2 rounded-[2px] bg-[var(--l-accent)]" />
            הצעת מחיר, חוזה ואירוע
          </div>
          <h2 className="font-display m-0 text-4xl lg:text-[56px] leading-[1.05] font-bold tracking-[-0.03em] text-balance">
            מהצעת מחיר לאירוע סגור, בקישור אחד.
          </h2>
          <p className="m-0 text-[17px] lg:text-[19px] leading-relaxed text-[var(--l-ink-soft)]">
            בונים הצעה מתוך הליד, הפריטים כבר מוכנים מהשיחה עם הלקוח, ושולחים בוואטסאפ. הלקוח מאשר, ממלא פרטים, חותם, והאירוע מחכה לכם ביומן.
          </p>
          <ol className="m-0 p-0 list-none flex flex-col gap-3 lg:gap-4">
            {STEPS.map((s) => (
              <li key={s.n} className="flex items-start gap-3.5 rounded-[14px] bg-white border border-[var(--l-line)] px-4 py-3.5 lg:px-5 lg:py-4">
                <span className="w-9 h-9 shrink-0 rounded-[10px] bg-[var(--l-navy)] text-[var(--l-accent)] flex items-center justify-center font-bold">{s.n}</span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-base lg:text-[17px] font-bold">{s.title}</span>
                  <span className="text-[15px] leading-relaxed text-[var(--l-ink-soft)]">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="m-0 text-sm text-[var(--l-ink-soft)]">בכל המסלולים. קובץ ה-PDF של ההצעה זמין להורדה בכרטיס הליד.</p>
        </div>

        <div className="self-center shrink-0 w-[260px] sm:w-[300px] lg:w-[340px]">
          <div className="rounded-[44px] p-3 bg-[#060a14] border border-[#2a3650] shadow-[0_40px_90px_rgba(11,18,32,0.35)]">
            <video
              src="/guides/quote-flow.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="הדגמה: שליחת הצעת מחיר, אישור הלקוח, שאלון וחתימה על החוזה"
              className="block w-full aspect-[480/768] object-cover object-top rounded-[34px] bg-[var(--l-bg-alt)]"
            />
          </div>
          <p className="m-0 mt-3 text-center text-xs text-[var(--l-ink-soft)]">המסכים האמיתיים של המערכת, עם נתוני הדגמה</p>
        </div>
      </div>
    </section>
  );
}
