import type { AreaDict } from "@/i18n/types";

// Area "landing" (marketing/auth pages in English and Russian, 2026-10-04; see src/i18n/dict/index.ts).
// Hebrew source text → translation. The landing page at /en and /ru: hero, sections, pricing,
// comparison table, calculator, FAQ and footer. Marketing tone, not word for word; prices stay in ₪.
// Keys shared with other areas (plan names, plan notes, "גילברטו", "עיצוב אלבום", and the hero
// lines the auth pages also use) live in their own dictionaries and aren't repeated here.
const dict: AreaDict = {
  en: {
    // Metadata
    "גילברטו | ניהול תהליך צילום אירועים": "Gilberto | Event photography workflow, managed",
    "מערכת לניהול תהליך צילום אירועים מסגירה עד מסירה": "The system that runs your event photography business, from booking to delivery",

    // Header + hero
    "איך זה עובד": "How it works",
    "מחירים": "Pricing",
    "שאלות": "FAQ",
    "הרשמה": "Sign up",

    // Founder
    "רועי גלברט, צלם אירועים ומייסד גילברטו": "Roei Gelbert, event photographer and founder of Gilberto",

    // Journey (the first step's name is used elsewhere too)
    "פנייה": "Inquiry",

    // More
    "ועוד דברים שתשתמשו בהם כל שבוע": "Plus the things you'll use every week",
    "לידים והצעות מחיר": "Leads and price quotes",
    "כל פנייה במקום אחד, והצעת מחיר בקישור שהלקוח מאשר בטלפון.": "Every inquiry in one place, and quotes sent as a link the client approves on their phone.",
    "חבילות ושלבים משלכם": "Your own packages and stages",
    "מחירים, שלבי עבודה ונוסח ההודעות ללקוח, מותאמים לשיטה שלכם.": "Prices, workflow stages and client message wording, tailored to the way you work.",
    "תיק עבודות לשיתוף, מתמלא מהגלריות שלכם בלחיצה (פרו ופרו+).": "A shareable portfolio, filled from your galleries in one click (Pro and Pro+).",
    "הכנסות לפי חודש, מגמה, ותשלומים פתוחים.": "Monthly revenue, trends and outstanding payments.",
    "צוות": "Team",
    "עוזרים וצלמים נוספים, כל אחד רואה רק את האירועים שלו.": "Assistants and second shooters, each seeing only their own events.",
    "ייבוא מיומן Google": "Import from Google Calendar",
    "אירועים שכבר ביומן נכנסים למערכת בסריקה אחת, בלי להקליד מחדש.": "Events already in your calendar come in with a single scan, no retyping.",

    // Intake assistant
    "עוזר פניות חכם": "Smart intake assistant",
    "לקוח כותב בשתיים בלילה. מישהו כבר עונה לו.": "A client writes at 2 a.m. Someone's already answering.",
    "עוזר הפניות מדבר עם לקוחות חדשים כמו בן אדם, מהקישור בוואטסאפ או באתר שלכם. הוא בודק ביומן אם התאריך פנוי, שואל את השאלות הנכונות, ומעביר לכם ליד מסודר עם כל פרטי האירוע, במייל ובאופן אוטומטי במערכת.":
      "The intake assistant talks to new clients like a person, from your WhatsApp link or your website. It checks your calendar to see if the date is free, asks the right questions, and hands you a complete lead with all the event details, by email and automatically in the system.",
    "בודק זמינות מול האירועים ויומן Google שלכם": "Checks availability against your events and Google Calendar",
    "עונה בשפה אנושית, שאלה אחת בכל פעם": "Answers in natural language, one question at a time",
    "הפניות מופיעות כליד באפליקציה באופן אוטומטי, עם כל הפרטים": "Inquiries show up as leads in the app automatically, with every detail",
    "מאחורי הקלעים: שאלות ותשובות משלכם": "Behind the scenes: your own Q&A",
    "הגדרות › אוטומציה": "Settings › Automation",
    "כותבים לעוזר את התשובות שלכם, והוא עונה לפיהן במקום להמציא. אפשר גם להוסיף שאלה משלכם שהוא ישאל כל לקוח.":
      "Write your own answers for the assistant, and it replies with them instead of making things up. You can also add your own question for it to ask every client.",
    "מתי מקבלים את התמונות?": "When do we get the photos?",
    "גלריה ראשונה תוך שבוע, וכל התמונות תוך 45 יום.": "A first gallery within a week, and all the photos within 45 days.",
    "מגיעים גם לצפון?": "Do you travel up north?",
    "כן, לכל הארץ. פרטי הנסיעה יופיעו בהצעת המחיר.": "Yes, anywhere in the country. Travel details will be in the price quote.",
    "בכל המסלולים: פרו סטארט עד 100 שיחות בחודש, פרו עד 150, ופרו+ עד 200. צריכים יותר? מוסיפים חבילת שיחות, בלי להחליף מסלול.":
      "On every plan: up to 100 conversations a month on Pro Start, 150 on Pro and 200 on Pro+. Need more? Add a conversation pack without switching plans.",
    "הדגמה: שיחה של לקוח עם עוזר הפניות": "Demo: a client chatting with the intake assistant",
    "שיחה אמיתית עם העוזר, מחשבון הדגמה": "A real conversation with the assistant, from a demo account",

    // Pricing
    "מחיר קבוע, בלי הפתעות": "Flat pricing, no surprises",
    "14 יום ניסיון חינם, בלי כרטיס אשראי. בלי עמלות נסתרות, וביטול בכל עת.": "14-day free trial, no credit card. No hidden fees, cancel anytime.",
    "מחזור חיוב": "Billing cycle",
    "חודשי": "Monthly",
    "שנתי, חוסכים": "Annual, save",
    "שנתי, חוסכים עד 3 חודשים": "Annual, save up to 3 months",
    "לחודש": "/ month",
    "להתחיל ניסיון חינם": "Start free trial",
    "ביטול בכל עת, בלי התחייבות": "Cancel anytime, no commitment",
    "ניהול אירועים, לידים והצעות מחיר": "Events, leads and price quotes",
    "חוזים דיגיטליים ותזכורות תשלום": "Digital contracts and payment reminders",
    "גלריות ללקוחות, 100GB": "Client galleries, 100GB",
    "שמירת גלריה עד 14 יום": "Galleries kept up to 14 days",
    "עוזר פניות: 100 שיחות בחודש": "Intake assistant: 100 conversations a month",
    "כל מה שבפרו סטארט": "Everything in Pro Start",
    "פורטפוליו ציבורי, 750GB": "Public portfolio, 750GB",
    "שמירת גלריה עד 90 יום, עד 2 בצוות": "Galleries kept up to 90 days, team of up to 2",
    "עוזר פניות: 150 שיחות בחודש": "Intake assistant: 150 conversations a month",
    "כל מה שבפרו": "Everything in Pro",
    "אחסון ללא הגבלה": "Unlimited storage",
    "מיתוג מלא: לוגו וצבע בכל הגלריות": "Full branding: your logo and color on every gallery",
    "FTP Live מהמצלמה באירוע, עד 3 בצוות": "FTP Live from your camera at the event, team of up to 3",
    "עוזר פניות: 200 שיחות בחודש": "Intake assistant: 200 conversations a month",

    // Comparison table
    "כלול במסלול": "Included in plan",
    "כלול": "Included",
    "לא כלול": "Not included",
    "גלריות מאובטחות ללקוחות, 5 ערכות עיצוב": "Secure client galleries, 5 design themes",
    "חוזים דיגיטליים לחתימה מרחוק": "Digital contracts, signed remotely",
    "תזכורות תשלום בזמן, מוכנות לשליחה בוואטסאפ": "Timely payment reminders, ready to send on WhatsApp",
    "סנכרון יומן Google / Apple": "Google / Apple calendar sync",
    "עורך אלבומים מובנה": "Built-in album editor",
    "וידאו בגלריה: גודל קובץ מקסימלי": "Gallery video: max file size",
    "עוזר פניות חכם: שיחות בחודש": "Smart intake assistant: conversations a month",
    "נפח אחסון": "Storage",
    "ללא הגבלה": "Unlimited",
    "שמירת גלריה": "Gallery retention",
    "עד 14 יום": "Up to 14 days",
    "עד 90 יום": "Up to 90 days",
    "עד שנה": "Up to a year",
    "חברי צוות": "Team members",
    "עד 1": "Up to 1",
    "עד 2": "Up to 2",
    "עד 3": "Up to 3",
    "מיתוג מלא: לוגו וצבע מותג בכל הגלריות": "Full branding: logo and brand color on every gallery",
    "FTP Live: העלאה חיה מהמצלמה באירוע": "FTP Live: upload live from your camera at the event",

    // Quote section
    "הצעת מחיר, חוזה ואירוע": "Quote, contract and event",
    "מהצעת מחיר לאירוע סגור, בקישור אחד.": "From price quote to booked event, in one link.",
    "בונים הצעה מתוך הליד, הפריטים כבר מוכנים מהשיחה עם הלקוח, ושולחים בוואטסאפ. הלקוח מאשר, ממלא פרטים, חותם, והאירוע מחכה לכם ביומן.":
      "Build a quote right from the lead, with the items already filled in from the client's conversation, and send it on WhatsApp. The client approves, fills in the details, signs, and the event is waiting in your calendar.",
    "שולחים קישור, לא קובץ": "Send a link, not a file",
    "לחיצה על „שליחה ללקוח/ה״ פותחת את וואטסאפ עם הודעה מוכנה: שם הלקוח, האירוע, התאריך והקישור להצעה.":
      "Tapping “Send to client” opens WhatsApp with a ready message: the client's name, the event, the date and the link to the quote.",
    "הלקוח מאשר בטלפון": "The client approves on their phone",
    "ההצעה נפתחת בעמוד מעוצב עם הלוגו שלכם, הפריטים והסכום. לחיצה אחת והיא מאושרת.":
      "The quote opens on a polished page with your logo, the items and the total. One tap and it's approved.",
    "שאלון קצר, אירוע ביומן": "A short questionnaire, an event in your calendar",
    "הלקוח משלים את פרטי האירוע, והאירוע נפתח לבד ביומן שלכם, עם כל השלבים.":
      "The client completes the event details, and the event is created in your calendar automatically, with all its stages.",
    "חוזה באותו קישור": "The contract, in the same link",
    "בוחרים לשלוח גם חוזה, והלקוח חותם עליו בסוף השאלון. מקבלים עדכון לטלפון, והליד יוצא מהרשימה.":
      "Choose to include a contract, and the client signs it at the end of the questionnaire. You get a notification on your phone, and the lead leaves your list.",
    "בכל המסלולים. קובץ ה-PDF של ההצעה זמין להורדה בכרטיס הליד.": "On every plan. The quote's PDF can be downloaded from the lead card.",
    "הדגמה: שליחת הצעת מחיר, אישור הלקוח, שאלון וחתימה על החוזה": "Demo: sending a price quote, client approval, questionnaire and contract signing",
    "המסכים האמיתיים של המערכת, עם נתוני הדגמה": "The system's real screens, with demo data",

    // Album section
    "עיצוב אלבום אוטומטי": "Automatic album design",
    "האלבום כולו מעוצב, בזמן שאתם שותים קפה.": "The whole album, designed while you drink your coffee.",
    "בוחרים מידות, כריכה וסגנון, ומסמנים תמונה אחת של בעלי השמחה, ההורים, האחים והסבים. גילברטו מזהה את הפרצופים, מסדרת את התמונות שהלקוח בחר לפי המשפחה ולפי סדר האירוע, ומעצבת את כל העמודים.":
      "Pick the size, cover and style, and mark one photo each of the celebrants, parents, siblings and grandparents. Gilberto recognizes the faces, arranges the client's picks by family and by the order of the event, and designs every page.",
    "ארבעה סגנונות שונים לגמרי, או תבנית אלבום שמורה משלכם": "Four completely different styles, or your own saved album template",
    "סדר משפחתי: קודם בעלי השמחה, אחר כך ההורים, האחים והסבים, ואז האירוע לפי סדר הצילום":
      "Family order: the celebrants first, then parents, siblings and grandparents, then the event in shooting order",
    "זיהוי הפרצופים רץ במכשיר שלכם, והתמונות לא נשלחות לשום שירות חיצוני": "Face recognition runs on your device, and photos are never sent to any outside service",
    "לא אהבתם עמוד? \"עיצוב מחדש\" נותן פריסה אחרת לאותן תמונות, בלי לחזור על עצמו":
      "Don't like a page? \"Redesign\" gives the same photos a new layout, without repeating itself",
    "מחליפים תמונות בין עמודים בשתי לחיצות, ומכוונים כל פרט בעורך החופשי": "Swap photos between pages in two taps, and fine-tune every detail in the free editor",
    "ייצוא ל-PDF, JPG או PSD, ושליחה ישירה לבית הדפוס": "Export to PDF, JPG or PSD, and send straight to the print lab",
    "במסלולי פרו ופרו+. בזמן הניסיון החינמי זה פתוח לכם.": "On Pro and Pro+. Unlocked for you during the free trial.",

    // Magnet section
    "מסגרת מגנט משלכם, מוכנה להדפסה.": "Your own magnet frame, ready to print.",
    "מעצבים מסגרת לכל אירוע, עם השמות, התאריך והלוגו, ומורידים קובץ שנכנס ישר לתוכנת ההדפסה. בלי תוכנת עיצוב ובלי להתעסק עם מידות.":
      "Design a frame for every event, with the names, the date and your logo, and download a file that goes straight into your printing software. No design software, no fiddling with sizes.",
    "13 עיצובים מוכנים לפי סוג אירוע, שמתמלאים לבד בשמות ובתאריך": "13 ready-made designs by event type, filled in with the names and the date",
    "טקסט בפונטים שונים, עם קו מתאר, צל צבעוני וריווח אותיות": "Text in a range of fonts, with outline, colored shadow and letter spacing",
    "ספריית אלמנטים וטקסטורות, וגם הלוגו והאלמנטים שלכם": "A library of elements and textures, plus your own logo and elements",
    "קוד QR שמוביל את האורחים לתמונות מהאירוע": "A QR code that takes guests to the event photos",
    "הלקוח מאשר את העיצוב בפורטל, לפני האירוע": "The client approves the design in the portal, before the event",
    "5 גדלים להדפסה, קובץ PNG או PSD ב-300 DPI עם חלון שקוף לתמונה": "5 print sizes, a PNG or PSD file at 300 DPI with a transparent window for the photo",

    // Calculator
    "כמה אירועים אתם מצלמים בחודש?": "How many events do you shoot a month?",
    "שעות שחוזרות אליכם בחודש": "Hours back each month",
    "שווי הזמן הזה בחודש": "What that time is worth each month",

    // FAQ
    "איך עובדת תקופת הניסיון?": "How does the free trial work?",
    "14 הימים הראשונים בחינם, בלי כרטיס אשראי. בזמן הניסיון כל האפשרויות של מסלול פרו+ פתוחות, עם מכסת אחסון של 5GB. לקראת הסוף נזכיר לכם לבחור מסלול. כל מה שהכנסתם נשמר עוד 30 יום אחרי הניסיון, כדי שתוכלו להמשיך בדיוק מאיפה שעצרתם. מספר טלפון אחד מקבל תקופת ניסיון אחת":
      "The first 14 days are free, no credit card needed. During the trial every Pro+ feature is unlocked, with 5GB of storage. Near the end we'll remind you to choose a plan. Everything you've added is kept for 30 more days after the trial, so you can pick up exactly where you left off. One free trial per phone number.",
    "אפשר לבטל מתי שרוצים?": "Can I cancel anytime?",
    "כן, ביטול החידוש האוטומטי אפשרי בכל רגע מתוך ההגדרות, בלי התחייבות, והגישה למערכת נשארת פעילה עד תום התקופה ששולמה, כך שהאירועים, הגלריות והחוזים שלכם לא נמחקים":
      "Yes. You can turn off auto-renewal at any moment in Settings, with no commitment, and your access stays active until the end of the period you've paid for. Your events, galleries and contracts aren't deleted.",
    "המידע שלי ושל הלקוחות שלי מאובטח?": "Is my data, and my clients' data, secure?",
    "כן, הנתונים מאוחסנים בשרתים מאובטחים עם הצפנה, וכל גלריית לקוח מוגנת בקישור אישי ייחודי":
      "Yes. Data is stored on secure, encrypted servers, and every client gallery is protected by its own unique private link.",
    "כמה זמן לוקח להתחיל לעבוד עם המערכת?": "How long does it take to get started?",
    "כמה דקות: נרשמים, מגדירים את החבילות והמחירים שלכם, ומיד אפשר להתחיל להוסיף אירועים":
      "A few minutes: sign up, set your packages and prices, and you can start adding events right away.",
    "המערכת בעברית?": "Is Gilberto available in English?",
    "כן, כל המערכת בעברית ובנויה במיוחד לצלמי אירועים בישראל, כולל התאמה לוואטסאפ ולמסלולי תשלום מקומיים":
      "Yes. You can use Gilberto in English, Hebrew or Russian. It's built especially for event photographers in Israel, including WhatsApp and local payment methods.",
    "מה קורה לתמונות והאירועים שלי אם אני מבטל את המנוי?": "What happens to my photos and events if I cancel?",
    "כלום לא נמחק, האירועים, הגלריות והחוזים שלכם נשארים שמורים במערכת ומחכים לכם. אפשר להפעיל את המנוי מחדש בכל עת ולחזור בדיוק מאיפה שעצרתם":
      "Nothing is deleted. Your events, galleries and contracts stay saved and waiting for you. You can reactivate your subscription anytime and pick up exactly where you left off.",
    "אפשר לעבור בין מסלולים?": "Can I switch plans?",
    "כן, בכל שלב אפשר לשדרג או לרדת מסלול מתוך הגדרות > מנוי. המעבר מתוזמן כך שלא משלמים כפול על מה שכבר שולם במחזור הנוכחי":
      "Yes. You can upgrade or downgrade at any time from Settings > Subscription. The switch is timed so you never pay twice for what you've already paid this cycle.",
    "יש הגבלה על נפח האחסון?": "Is there a storage limit?",
    "תלוי במסלול: פרו סטארט עד 100GB, פרו עד 750GB, ופרו+ ללא הגבלה. הנפח בפועל שבשימוש תמיד מוצג בהגדרות, כך שאף פעם לא מגלים בהפתעה":
      "It depends on the plan: up to 100GB on Pro Start, up to 750GB on Pro, and unlimited on Pro+. Your actual usage is always shown in Settings, so there are never any surprises.",
    "אפשר להתקין את המערכת כאפליקציה בנייד?": "Can I install it as an app on my phone?",
    "כן, מתקינים ישירות מהדפדפן בלי חנות אפליקציות, ומקבלים חוויה מלאה של אפליקציה, כולל אייקון על המסך הראשי וטעינה מהירה יותר":
      "Yes. Install it straight from your browser, no app store needed, and get the full app experience, including a home-screen icon and faster loading.",

    // Footer
    "כניסה למשתמשים קיימים": "Log in to your account",
    "מדיניות פרטיות": "Privacy policy",
    "מדיניות עוגיות": "Cookie policy",
    "מדיניות ביטולים": "Cancellation policy",
    "הצהרת נגישות": "Accessibility statement",
    "פרטי העסק": "Business details",
    // Landing sketch 2 (2026-10-11): hero, pain/solution, process, calculator, last call
    "מערכת ניהול לצלמי אירועים, שפותחה בידי צלם אירועים": "A management system for event photographers, developed by an event photographer",
    "צלמים, אתם מתמקדים בצילום,": "Photographers, you focus on the shooting,",
    "ואת הניהול אנחנו לוקחים על עצמנו.": "and we take the management off your hands.",
    "הפכתם לצלמים מתוך אהבה לצילום ומתוך כישרון אמיתי, ולא כדי להעביר את הערבים בהודעות וואטסאפ, בחוזים ובתזכורות תשלום.": "You became photographers out of a love for the craft and real talent, not to spend your evenings on WhatsApp messages, contracts and payment reminders.",
    "אך מאחורי כל אירוע מסתתרות **כארבע וחצי שעות של עבודה מנהלית**, מהפנייה הראשונה ועד מסירת האלבום. צלם שמצלם שישה אירועים בחודש מאבד כך **יותר מ-40 ימי עבודה בשנה**. גילברטו לוקחת על עצמה את רוב העבודה הזו, כדי שתוכלו לחזור לעיסוק שבשבילו פתחתם את העסק.": "But behind every event hide **about four and a half hours of admin work**, from the first inquiry to the album delivery. A photographer who shoots six events a month loses **more than 40 working days a year** this way. Gilberto takes most of that work on itself, so you can get back to what you started the business for.",
    "להתחיל 14 ימי ניסיון חינם": "Start your 14-day free trial",
    "כמה זמן אתם משקיעים בעבודה מנהלית?": "How much time goes into admin?",
    "ללא כרטיס אשראי. החישוב: כ-270 דקות של עבודה מנהלית לאירוע (הפירוט בהמשך העמוד), שישה אירועים בחודש ויום עבודה בן שמונה שעות.": "No credit card needed. The math: about 270 minutes of admin per event (broken down below), six events a month and an eight-hour working day.",
    "מה המערכת עושה": "What the system does",
    "עוזר חכם שמשיב ללקוחות גם בלילה": "A smart assistant that answers clients, even at night",
    "הצעת מחיר וחוזה בקישור אחד": "Quote and contract in one link",
    "תהליך עבודה לפי השיטה שלכם": "A workflow built around your method",
    "תזכורות תשלום וקבלות": "Payment reminders and receipts",
    "גלריה ועיצוב אלבום אוטומטי": "Galleries and automatic album design",
    "סנכרון עם יומן Google ו-Apple": "Syncs with Google and Apple Calendar",
    "פיתחתי את גילברטו משום שאחרי כל אירוע חיכו לי עוד שעות ארוכות של הודעות, קבצים ותזכורות. היום כל אלה מסודרים ומוכנים מראש, ואני מתפנה לצלם.": "I developed Gilberto because after every event, long hours of messages, files and reminders were still waiting for me. Today all of it is organized and ready in advance, and I'm free to shoot.",
    "דוגמה להודעות שמחכות אחרי אירוע": "Example of messages waiting after an event",
    "01:12, בדרך הביתה מחתונה": "1:12 AM, driving home from a wedding",
    "היי, ה-14.12 עדיין פנוי? מחפשים צלם לבר מצווה": "Hi, is December 14 still free? We're looking for a bar mitzvah photographer",
    "פנייה חדשה, לפני שעתיים": "New inquiry, 2 hours ago",
    "אפשר לקבל את הצעת המחיר שוב? לא מוצאת אותה": "Can you send the quote again? I can't find it",
    "לקוחה, אתמול": "Client, yesterday",
    "מתי הגלריה מהחינה מוכנה? 🙏": "When will the henna gallery be ready? 🙏",
    "לקוחה, לפני 3 ימים": "Client, 3 days ago",
    "הכאב והפתרון": "The problem and the fix",
    "כך זה נראה היום, וכך זה נראה עם גילברטו": "How it looks today, and how it looks with Gilberto",
    "כל צלם אירועים מכיר את הרשימה הזו היטב. ההבדל הוא מי מבצע את העבודה.": "Every event photographer knows this list well. The difference is who does the work.",
    "עם גילברטו": "With Gilberto",
    "פנייה חדשה": "A new inquiry",
    "הצעת מחיר וחוזה": "Quote and contract",
    "לפני האירוע ואחריו": "Before and after the event",
    "גלריה ובחירת תמונות": "Gallery and photo selection",
    "עיצוב ואישור אלבום": "Album design and approval",
    "לקוח פונה בעשר בלילה ושואל אם התאריך פנוי. אתם רואים את ההודעה רק למחרת בבוקר, ובינתיים הוא כבר פנה לשני צלמים נוספים. ועל כל אירוע שנסגר יש עוד כמה פניות שלא הבשילו, וגם עליהן עניתם.": "A client writes at ten at night asking if the date is free. You only see the message the next morning, and by then they've already contacted two other photographers. And for every event you book there are several inquiries that went nowhere, and you answered those too.",
    "כ-45 דקות לאירוע, כולל פניות שלא נסגרו": "About 45 minutes per event, including inquiries that didn't book",
    "עוזר הפניות משיב לו מיד, בודק ביומן שלכם שהתאריך פנוי, שואל את השאלות הנחוצות ומעביר אליכם ליד מסודר עם הטלפון וכל הפרטים.": "The intake assistant replies right away, checks your calendar that the date is free, asks the questions that matter and hands you a clean lead with the phone number and every detail.",
    "הצעת מחיר בקובץ אחד, חוזה בקובץ אחר, תיקונים לפי בקשת הלקוח, ולאחר מכן כמה ימים של תזכורות עד שהוא חותם ומעביר את פרטי האירוע.": "A quote in one file, a contract in another, edits at the client's request, and then several days of reminders until they sign and send the event details.",
    "כ-40 דקות לאירוע": "About 40 minutes per event",
    "ההצעה נשלחת כקישור בוואטסאפ. הלקוח מאשר בטלפון, ממלא את פרטי האירוע וחותם על החוזה באותו הקישור, והאירוע נפתח אצלכם ונכנס ליומן.": "The quote goes out as a WhatsApp link. The client approves on their phone, fills in the event details and signs the contract in the same link, and the event opens on your side and goes into your calendar.",
    "לעקוב אחר מי ששילם מקדמה, לזכור למי ומתי יש להזכיר את היתרה, ולהפיק קבלה בתוכנה נפרדת, לעיתים פעמיים ושלוש לאותו אירוע.": "Tracking who paid a deposit, remembering whom to remind about the balance and when, and issuing a receipt in separate software, sometimes two or three times for the same event.",
    "כ-25 דקות לאירוע": "About 25 minutes per event",
    "בכל אירוע רואים מה שולם ומה נותר. כשמגיע מועד היתרה, ממתינה לכם תזכורת מוכנה לשליחה, והקבלה מופקת מהמערכת ומגיעה ללקוח בקישור קצר.": "Every event shows what's been paid and what's left. When the balance is due, a reminder is waiting for you, ready to send, and the receipt is issued from the system and reaches the client as a short link.",
    "שיחות תיאום על השעות, המקום וצילומי המשפחה, תיאום עם האולם ועם צלם נוסף, שאלות הלקוח בשבוע האחרון, ולבסוף סבב הודעות נוסף כדי לסגור את המסירה.": "Calls to agree on the hours, the location and the family photos, coordinating with the venue and a second shooter, the client's questions in the final week, and finally another round of messages to wrap up delivery.",
    "כ-60 דקות לאירוע": "About 60 minutes per event",
    "ללקוח יש פורטל אישי עם כל הפרטים והשלבים, וביום הצילום מרוכזים אצלכם במסך אחד המקום עם ניווט, השעות, הטלפון והחבילה.": "The client has a personal portal with every detail and stage, and on the shoot day you have the location with navigation, the hours, the phone number and the package on one screen.",
    "שולחים גלריה, ממתינים שבועות לבחירה ושולחים תזכורות, ולבסוף מקבלים בוואטסאפ רשימה של עשרות מספרי קבצים, שאותם יש לאתר אחד אחד.": "You send a gallery, wait weeks for the selection while sending reminders, and finally get a WhatsApp list of dozens of file numbers you have to find one by one.",
    "כ-50 דקות לאירוע": "About 50 minutes per event",
    "הלקוח מסמן את התמונות האהובות עליו בגלריה עצמה, ואתם רואים את הבחירה מסודרת במקום אחד, מוכנה לאלבום.": "The client marks their favorite photos right in the gallery, and you see the selection organized in one place, ready for the album.",
    "ערב או שניים של עימוד, ולאחריהם סבבי הערות בהודעות עד שהלקוח מאשר, ולבסוף שליחת הקבצים לבית הדפוס.": "An evening or two of layout, then rounds of comments over messages until the client approves, and finally sending the files to the print house.",
    "כ-50 דקות של תיאום לאירוע, לא כולל העיצוב עצמו": "About 50 minutes of coordination per event, not counting the design itself",
    "העיצוב האוטומטי מסדר את האלבום מהתמונות שהלקוח בחר, ואתם משנים כרצונכם. הלקוח עובר על העיצוב ומאשר בפורטל האישי, והקבצים נשלחים לבית הדפוס ישירות מהמערכת.": "Automatic design lays out the album from the photos the client chose, and you change whatever you like. The client reviews and approves the design in their personal portal, and the files go to the print house straight from the system.",
    "שעות (אחרי מספר)": "hours",
    "דקות": "minutes",
    "ימי עבודה": "working days",
    "של עבודה מנהלית על אירוע אחד, ללא מערכת": "of admin work on a single event, without a system",
    "מה שנותר עם גילברטו, בעיקר מענה לשאלות אמיתיות של לקוחות": "what's left with Gilberto, mostly answering real client questions",
    "שחוזרים אליכם בשנה, בשישה אירועים בחודש": "back to you each year, at six events a month",
    "הזמנים הם הערכה לאירוע ממוצע, מהפנייה הראשונה ועד המסירה, כולל פניות שלא נסגרו. כל צלם עובד אחרת, ולכן במחשבון שלמטה אפשר להתאים אותם לעסק שלכם.": "The times are an estimate for an average event, from the first inquiry to delivery, including inquiries that didn't book. Every photographer works differently, so the calculator below lets you adjust them to your business.",
    "מהפנייה הראשונה ועד המסירה": "From the first inquiry to delivery",
    "מערכת שמתאימה את עצמה לתהליך שלכם": "A system that adapts to your process",
    "אין צורך לשנות את הדרך שבה אתם עובדים. בונים את החבילות ואת שלבי העבודה כפי שאתם רגילים, ובכל אירוע רואים מהו הצעד הבא.": "There's no need to change how you work. You build your packages and workflow stages the way you're used to, and every event shows you the next step.",
    "דוגמה לחבילה מותאמת": "Example of a custom package",
    "החבילה שלכם, ״חתונה מלאה״": "Your package: “Full wedding”",
    "בחירת תמונות לאלבום": "Photo selection for the album",
    "שלב שלכם": "Your stage",
    "קבוע בכל חבילה": "In every package",
    "+ שלב משלכם": "+ Add your own stage",
    "החבילות והמחירים שלכם": "Your packages and prices",
    "חבילות ללא הגבלה, כל אחת עם השלבים המתאימים לה.": "Unlimited packages, each with the stages that fit it.",
    "ההודעות ללקוח בניסוח שלכם": "Client messages in your own words",
    "בסיום כל שלב, ההודעה ללקוח כבר כתובה וממתינה לשליחה בוואטסאפ, במילים שבחרתם.": "When a stage is done, the client message is already written and waiting to be sent on WhatsApp, in the words you chose.",
    "תמונת מצב מלאה של העסק": "A full picture of your business",
    "במסך הבית מוצגים הצילום הקרוב, הסכומים שנותרו לגבייה והמצב של כל אירוע.": "The home screen shows your next shoot, the amounts still to collect and where every event stands.",
    "מחשבון": "Calculator",
    "כמה זמן וכסף העבודה המנהלית עולה לכם?": "How much time and money does admin cost you?",
    "הזיזו את הסמנים בהתאם לעסק שלכם, וקבלו את המספרים שלכם.": "Move the sliders to match your business and get your own numbers.",
    "זמן עבודה מנהלית על כל אירוע": "Admin time per event",
    "מה שווי שעת העבודה שלכם?": "What's an hour of your work worth?",
    "ימי עבודה שחוזרים אליכם בשנה": "Working days back each year",
    "החישוב מניח שגם עם גילברטו נשארות כ-40 דקות לאירוע, ושיום עבודה הוא שמונה שעות. זו הערכה, לא התחייבות.": "The math assumes about 40 minutes per event still remain with Gilberto, and an eight-hour working day. It's an estimate, not a guarantee.",
    "השאירו לנו את הניהול, וחזרו לצלם": "Leave the management to us, and get back to shooting",
    "14 ימי ניסיון חינם עם כל האפשרויות, ללא כרטיס אשראי וללא התחייבות.": "A 14-day free trial with every feature, no credit card and no commitment.",
  },
  ru: {
    // Metadata
    "גילברטו | ניהול תהליך צילום אירועים": "Гилберто | Управление работой фотографа мероприятий",
    "מערכת לניהול תהליך צילום אירועים מסגירה עד מסירה": "Система, которая ведёт ваш фотобизнес от бронирования до сдачи заказа",

    // Header + hero
    "איך זה עובד": "Как это работает",
    "מחירים": "Цены",
    "שאלות": "Вопросы",
    "הרשמה": "Регистрация",

    // Founder
    "רועי גלברט, צלם אירועים ומייסד גילברטו": "Рои Гелберт, фотограф мероприятий и основатель Гилберто",

    // Journey (the first step's name is used elsewhere too)
    "פנייה": "Обращение",

    // More
    "ועוד דברים שתשתמשו בהם כל שבוע": "И ещё то, чем вы будете пользоваться каждую неделю",
    "לידים והצעות מחיר": "Заявки и ценовые предложения",
    "כל פנייה במקום אחד, והצעת מחיר בקישור שהלקוח מאשר בטלפון.": "Все обращения в одном месте, а предложение отправляется ссылкой, которую клиент подтверждает в телефоне.",
    "חבילות ושלבים משלכם": "Ваши пакеты и этапы",
    "מחירים, שלבי עבודה ונוסח ההודעות ללקוח, מותאמים לשיטה שלכם.": "Цены, этапы работы и тексты сообщений клиенту под ваш подход.",
    "תיק עבודות לשיתוף, מתמלא מהגלריות שלכם בלחיצה (פרו ופרו+).": "Портфолио, которым можно поделиться, наполняется из ваших галерей в один клик (Про и Про+).",
    "הכנסות לפי חודש, מגמה, ותשלומים פתוחים.": "Доход по месяцам, динамика и неоплаченные счета.",
    "צוות": "Команда",
    "עוזרים וצלמים נוספים, כל אחד רואה רק את האירועים שלו.": "Ассистенты и вторые фотографы, каждый видит только свои мероприятия.",
    "ייבוא מיומן Google": "Импорт из Google Календаря",
    "אירועים שכבר ביומן נכנסים למערכת בסריקה אחת, בלי להקליד מחדש.": "Мероприятия, которые уже есть в календаре, переносятся в систему за одно сканирование, без повторного ввода.",

    // Intake assistant
    "עוזר פניות חכם": "Умный ассистент обращений",
    "לקוח כותב בשתיים בלילה. מישהו כבר עונה לו.": "Клиент пишет в два часа ночи. Ему уже отвечают.",
    "עוזר הפניות מדבר עם לקוחות חדשים כמו בן אדם, מהקישור בוואטסאפ או באתר שלכם. הוא בודק ביומן אם התאריך פנוי, שואל את השאלות הנכונות, ומעביר לכם ליד מסודר עם כל פרטי האירוע, במייל ובאופן אוטומטי במערכת.":
      "Ассистент обращений общается с новыми клиентами по-человечески, по ссылке в WhatsApp или на вашем сайте. Он проверяет в календаре, свободна ли дата, задаёт нужные вопросы и передаёт вам готовую заявку со всеми деталями мероприятия, по почте и автоматически в системе.",
    "בודק זמינות מול האירועים ויומן Google שלכם": "Проверяет занятость по вашим мероприятиям и Google Календарю",
    "עונה בשפה אנושית, שאלה אחת בכל פעם": "Отвечает живым языком, по одному вопросу за раз",
    "הפניות מופיעות כליד באפליקציה באופן אוטומטי, עם כל הפרטים": "Обращения автоматически появляются в приложении как заявки, со всеми деталями",
    "מאחורי הקלעים: שאלות ותשובות משלכם": "За кулисами: ваши вопросы и ответы",
    "הגדרות › אוטומציה": "Настройки › Автоматизация",
    "כותבים לעוזר את התשובות שלכם, והוא עונה לפיהן במקום להמציא. אפשר גם להוסיף שאלה משלכם שהוא ישאל כל לקוח.":
      "Вы пишете ассистенту свои ответы, и он отвечает по ним, а не выдумывает. Можно добавить и собственный вопрос, который он задаст каждому клиенту.",
    "מתי מקבלים את התמונות?": "Когда мы получим фотографии?",
    "גלריה ראשונה תוך שבוע, וכל התמונות תוך 45 יום.": "Первая галерея в течение недели, все фотографии в течение 45 дней.",
    "מגיעים גם לצפון?": "Вы приезжаете на север?",
    "כן, לכל הארץ. פרטי הנסיעה יופיעו בהצעת המחיר.": "Да, по всей стране. Условия выезда будут указаны в ценовом предложении.",
    "בכל המסלולים: פרו סטארט עד 100 שיחות בחודש, פרו עד 150, ופרו+ עד 200. צריכים יותר? מוסיפים חבילת שיחות, בלי להחליף מסלול.":
      "Во всех тарифах: Про Старт до 100 диалогов в месяц, Про до 150, Про+ до 200. Нужно больше? Докупите пакет диалогов, не меняя тариф.",
    "הדגמה: שיחה של לקוח עם עוזר הפניות": "Демо: диалог клиента с ассистентом обращений",
    "שיחה אמיתית עם העוזר, מחשבון הדגמה": "Настоящий диалог с ассистентом из демо-аккаунта",

    // Pricing
    "מחיר קבוע, בלי הפתעות": "Фиксированная цена, без сюрпризов",
    "14 יום ניסיון חינם, בלי כרטיס אשראי. בלי עמלות נסתרות, וביטול בכל עת.": "14 дней бесплатно, без банковской карты. Без скрытых комиссий, отмена в любое время.",
    "מחזור חיוב": "Период оплаты",
    "חודשי": "Помесячно",
    "שנתי, חוסכים": "На год, выгоднее",
    "שנתי, חוסכים עד 3 חודשים": "На год, экономия до 3 месяцев",
    "לחודש": "в месяц",
    "להתחיל ניסיון חינם": "Начать бесплатно",
    "ביטול בכל עת, בלי התחייבות": "Отмена в любое время, без обязательств",
    "ניהול אירועים, לידים והצעות מחיר": "Мероприятия, заявки и ценовые предложения",
    "חוזים דיגיטליים ותזכורות תשלום": "Электронные договоры и напоминания об оплате",
    "גלריות ללקוחות, 100GB": "Галереи для клиентов, 100GB",
    "שמירת גלריה עד 14 יום": "Хранение галереи до 14 дней",
    "עוזר פניות: 100 שיחות בחודש": "Ассистент обращений: 100 диалогов в месяц",
    "כל מה שבפרו סטארט": "Всё, что в Про Старт",
    "פורטפוליו ציבורי, 750GB": "Публичное портфолио, 750GB",
    "שמירת גלריה עד 90 יום, עד 2 בצוות": "Хранение галереи до 90 дней, команда до 2 человек",
    "עוזר פניות: 150 שיחות בחודש": "Ассистент обращений: 150 диалогов в месяц",
    "כל מה שבפרו": "Всё, что в Про",
    "אחסון ללא הגבלה": "Безлимитное хранилище",
    "מיתוג מלא: לוגו וצבע בכל הגלריות": "Полный брендинг: логотип и цвет во всех галереях",
    "FTP Live מהמצלמה באירוע, עד 3 בצוות": "FTP Live с камеры на мероприятии, команда до 3 человек",
    "עוזר פניות: 200 שיחות בחודש": "Ассистент обращений: 200 диалогов в месяц",

    // Comparison table
    "כלול במסלול": "Входит в тариф",
    "כלול": "Входит",
    "לא כלול": "Не входит",
    "גלריות מאובטחות ללקוחות, 5 ערכות עיצוב": "Защищённые галереи для клиентов, 5 тем оформления",
    "חוזים דיגיטליים לחתימה מרחוק": "Электронные договоры с удалённой подписью",
    "תזכורות תשלום בזמן, מוכנות לשליחה בוואטסאפ": "Своевременные напоминания об оплате, готовые к отправке в WhatsApp",
    "סנכרון יומן Google / Apple": "Синхронизация с календарём Google / Apple",
    "עורך אלבומים מובנה": "Встроенный редактор альбомов",
    "וידאו בגלריה: גודל קובץ מקסימלי": "Видео в галерее: максимальный размер файла",
    "עוזר פניות חכם: שיחות בחודש": "Умный ассистент обращений: диалогов в месяц",
    "נפח אחסון": "Объём хранилища",
    "ללא הגבלה": "Без ограничений",
    "שמירת גלריה": "Хранение галереи",
    "עד 14 יום": "До 14 дней",
    "עד 90 יום": "До 90 дней",
    "עד שנה": "До года",
    "חברי צוות": "Участники команды",
    "עד 1": "До 1",
    "עד 2": "До 2",
    "עד 3": "До 3",
    "מיתוג מלא: לוגו וצבע מותג בכל הגלריות": "Полный брендинг: логотип и фирменный цвет во всех галереях",
    "FTP Live: העלאה חיה מהמצלמה באירוע": "FTP Live: загрузка с камеры прямо во время мероприятия",

    // Quote section
    "הצעת מחיר, חוזה ואירוע": "Предложение, договор и мероприятие",
    "מהצעת מחיר לאירוע סגור, בקישור אחד.": "От ценового предложения до забронированного мероприятия одной ссылкой.",
    "בונים הצעה מתוך הליד, הפריטים כבר מוכנים מהשיחה עם הלקוח, ושולחים בוואטסאפ. הלקוח מאשר, ממלא פרטים, חותם, והאירוע מחכה לכם ביומן.":
      "Составьте предложение прямо из заявки, позиции уже подставлены из диалога с клиентом, и отправьте в WhatsApp. Клиент подтверждает, заполняет детали, подписывает, и мероприятие уже ждёт вас в календаре.",
    "שולחים קישור, לא קובץ": "Отправляйте ссылку, а не файл",
    "לחיצה על „שליחה ללקוח/ה״ פותחת את וואטסאפ עם הודעה מוכנה: שם הלקוח, האירוע, התאריך והקישור להצעה.":
      "Кнопка «Отправить клиенту» открывает WhatsApp с готовым сообщением: имя клиента, мероприятие, дата и ссылка на предложение.",
    "הלקוח מאשר בטלפון": "Клиент подтверждает в телефоне",
    "ההצעה נפתחת בעמוד מעוצב עם הלוגו שלכם, הפריטים והסכום. לחיצה אחת והיא מאושרת.":
      "Предложение открывается на красивой странице с вашим логотипом, позициями и суммой. Одно нажатие, и оно подтверждено.",
    "שאלון קצר, אירוע ביומן": "Короткая анкета, мероприятие в календаре",
    "הלקוח משלים את פרטי האירוע, והאירוע נפתח לבד ביומן שלכם, עם כל השלבים.":
      "Клиент дополняет детали мероприятия, и оно само появляется в вашем календаре со всеми этапами.",
    "חוזה באותו קישור": "Договор по той же ссылке",
    "בוחרים לשלוח גם חוזה, והלקוח חותם עליו בסוף השאלון. מקבלים עדכון לטלפון, והליד יוצא מהרשימה.":
      "Добавьте договор, и клиент подпишет его в конце анкеты. Вы получите уведомление на телефон, а заявка уйдёт из списка.",
    "בכל המסלולים. קובץ ה-PDF של ההצעה זמין להורדה בכרטיס הליד.": "Во всех тарифах. PDF предложения можно скачать в карточке заявки.",
    "הדגמה: שליחת הצעת מחיר, אישור הלקוח, שאלון וחתימה על החוזה": "Демо: отправка ценового предложения, подтверждение клиента, анкета и подписание договора",
    "המסכים האמיתיים של המערכת, עם נתוני הדגמה": "Настоящие экраны системы с демо-данными",

    // Album section
    "עיצוב אלבום אוטומטי": "Автоматический дизайн альбома",
    "האלבום כולו מעוצב, בזמן שאתם שותים קפה.": "Весь альбом свёрстан, пока вы пьёте кофе.",
    "בוחרים מידות, כריכה וסגנון, ומסמנים תמונה אחת של בעלי השמחה, ההורים, האחים והסבים. גילברטו מזהה את הפרצופים, מסדרת את התמונות שהלקוח בחר לפי המשפחה ולפי סדר האירוע, ומעצבת את כל העמודים.":
      "Выберите размер, обложку и стиль и отметьте по одному фото виновников торжества, родителей, братьев и сестёр, бабушек и дедушек. Гилберто распознаёт лица, расставляет выбранные клиентом снимки по семье и по ходу мероприятия и верстает все страницы.",
    "ארבעה סגנונות שונים לגמרי, או תבנית אלבום שמורה משלכם": "Четыре совершенно разных стиля или ваш собственный сохранённый шаблон альбома",
    "סדר משפחתי: קודם בעלי השמחה, אחר כך ההורים, האחים והסבים, ואז האירוע לפי סדר הצילום":
      "Семейный порядок: сначала виновники торжества, затем родители, братья и сёстры, бабушки и дедушки, а потом мероприятие по порядку съёмки",
    "זיהוי הפרצופים רץ במכשיר שלכם, והתמונות לא נשלחות לשום שירות חיצוני": "Распознавание лиц работает на вашем устройстве, и фотографии не отправляются ни в какой внешний сервис",
    "לא אהבתם עמוד? \"עיצוב מחדש\" נותן פריסה אחרת לאותן תמונות, בלי לחזור על עצמו":
      "Не понравилась страница? «Переверстать» даёт тем же фото новую раскладку, без повторов",
    "מחליפים תמונות בין עמודים בשתי לחיצות, ומכוונים כל פרט בעורך החופשי": "Меняйте фото между страницами в два касания и настраивайте каждую деталь в свободном редакторе",
    "ייצוא ל-PDF, JPG או PSD, ושליחה ישירה לבית הדפוס": "Экспорт в PDF, JPG или PSD и отправка прямо в типографию",
    "במסלולי פרו ופרו+. בזמן הניסיון החינמי זה פתוח לכם.": "В тарифах Про и Про+. В бесплатный пробный период доступно и вам.",

    // Magnet section
    "מסגרת מגנט משלכם, מוכנה להדפסה.": "Ваша рамка для магнитов, готовая к печати.",
    "מעצבים מסגרת לכל אירוע, עם השמות, התאריך והלוגו, ומורידים קובץ שנכנס ישר לתוכנת ההדפסה. בלי תוכנת עיצוב ובלי להתעסק עם מידות.":
      "Оформляйте рамку для каждого мероприятия, с именами, датой и логотипом, и скачивайте файл, который сразу идёт в программу печати. Без графических программ и возни с размерами.",
    "13 עיצובים מוכנים לפי סוג אירוע, שמתמלאים לבד בשמות ובתאריך": "13 готовых дизайнов по типу мероприятия, с уже подставленными именами и датой",
    "טקסט בפונטים שונים, עם קו מתאר, צל צבעוני וריווח אותיות": "Текст разными шрифтами, с обводкой, цветной тенью и межбуквенным интервалом",
    "ספריית אלמנטים וטקסטורות, וגם הלוגו והאלמנטים שלכם": "Библиотека элементов и текстур, а также ваш логотип и элементы",
    "קוד QR שמוביל את האורחים לתמונות מהאירוע": "QR-код, который ведёт гостей к фото с мероприятия",
    "הלקוח מאשר את העיצוב בפורטל, לפני האירוע": "Клиент утверждает дизайн в портале до мероприятия",
    "5 גדלים להדפסה, קובץ PNG או PSD ב-300 DPI עם חלון שקוף לתמונה": "5 размеров для печати, файл PNG или PSD с разрешением 300 DPI и прозрачным окном для фото",

    // Calculator
    "כמה אירועים אתם מצלמים בחודש?": "Сколько мероприятий вы снимаете в месяц?",
    "שעות שחוזרות אליכם בחודש": "Часов возвращается к вам в месяц",
    "שווי הזמן הזה בחודש": "Стоимость этого времени в месяц",

    // FAQ
    "איך עובדת תקופת הניסיון?": "Как работает пробный период?",
    "14 הימים הראשונים בחינם, בלי כרטיס אשראי. בזמן הניסיון כל האפשרויות של מסלול פרו+ פתוחות, עם מכסת אחסון של 5GB. לקראת הסוף נזכיר לכם לבחור מסלול. כל מה שהכנסתם נשמר עוד 30 יום אחרי הניסיון, כדי שתוכלו להמשיך בדיוק מאיפה שעצרתם. מספר טלפון אחד מקבל תקופת ניסיון אחת":
      "Первые 14 дней бесплатно, без банковской карты. В пробный период открыты все возможности тарифа Про+, с хранилищем 5GB. Ближе к концу мы напомним вам выбрать тариф. Всё, что вы внесли, хранится ещё 30 дней после пробного периода, чтобы вы могли продолжить с того же места. Один пробный период на один номер телефона.",
    "אפשר לבטל מתי שרוצים?": "Можно отменить в любой момент?",
    "כן, ביטול החידוש האוטומטי אפשרי בכל רגע מתוך ההגדרות, בלי התחייבות, והגישה למערכת נשארת פעילה עד תום התקופה ששולמה, כך שהאירועים, הגלריות והחוזים שלכם לא נמחקים":
      "Да. Автопродление можно отключить в любой момент в настройках, без обязательств, а доступ к системе сохраняется до конца оплаченного периода. Ваши мероприятия, галереи и договоры не удаляются.",
    "המידע שלי ושל הלקוחות שלי מאובטח?": "Мои данные и данные клиентов защищены?",
    "כן, הנתונים מאוחסנים בשרתים מאובטחים עם הצפנה, וכל גלריית לקוח מוגנת בקישור אישי ייחודי":
      "Да. Данные хранятся на защищённых серверах с шифрованием, а каждая галерея клиента защищена уникальной личной ссылкой.",
    "כמה זמן לוקח להתחיל לעבוד עם המערכת?": "Сколько времени нужно, чтобы начать работать?",
    "כמה דקות: נרשמים, מגדירים את החבילות והמחירים שלכם, ומיד אפשר להתחיל להוסיף אירועים":
      "Несколько минут: регистрируетесь, задаёте свои пакеты и цены и сразу можете добавлять мероприятия.",
    "המערכת בעברית?": "Система доступна на русском?",
    "כן, כל המערכת בעברית ובנויה במיוחד לצלמי אירועים בישראל, כולל התאמה לוואטסאפ ולמסלולי תשלום מקומיים":
      "Да. Гилберто работает на русском, иврите и английском. Система создана специально для фотографов мероприятий в Израиле, с поддержкой WhatsApp и местных способов оплаты.",
    "מה קורה לתמונות והאירועים שלי אם אני מבטל את המנוי?": "Что будет с моими фото и мероприятиями, если я отменю подписку?",
    "כלום לא נמחק, האירועים, הגלריות והחוזים שלכם נשארים שמורים במערכת ומחכים לכם. אפשר להפעיל את המנוי מחדש בכל עת ולחזור בדיוק מאיפה שעצרתם":
      "Ничего не удаляется: ваши мероприятия, галереи и договоры остаются в системе и ждут вас. Подписку можно возобновить в любой момент и продолжить с того же места.",
    "אפשר לעבור בין מסלולים?": "Можно сменить тариф?",
    "כן, בכל שלב אפשר לשדרג או לרדת מסלול מתוך הגדרות > מנוי. המעבר מתוזמן כך שלא משלמים כפול על מה שכבר שולם במחזור הנוכחי":
      "Да, в любой момент можно перейти на тариф выше или ниже в разделе Настройки > Подписка. Переход рассчитан так, чтобы вы не платили дважды за уже оплаченный период.",
    "יש הגבלה על נפח האחסון?": "Есть ли ограничение на объём хранилища?",
    "תלוי במסלול: פרו סטארט עד 100GB, פרו עד 750GB, ופרו+ ללא הגבלה. הנפח בפועל שבשימוש תמיד מוצג בהגדרות, כך שאף פעם לא מגלים בהפתעה":
      "Зависит от тарифа: Про Старт до 100GB, Про до 750GB, Про+ без ограничений. Фактически занятый объём всегда виден в настройках, так что сюрпризов не будет.",
    "אפשר להתקין את המערכת כאפליקציה בנייד?": "Можно установить систему как приложение на телефон?",
    "כן, מתקינים ישירות מהדפדפן בלי חנות אפליקציות, ומקבלים חוויה מלאה של אפליקציה, כולל אייקון על המסך הראשי וטעינה מהירה יותר":
      "Да, установка прямо из браузера, без магазина приложений. Вы получаете полноценное приложение с иконкой на главном экране и более быстрой загрузкой.",

    // Footer
    "כניסה למשתמשים קיימים": "Вход для зарегистрированных пользователей",
    "מדיניות פרטיות": "Политика конфиденциальности",
    "מדיניות עוגיות": "Политика cookie",
    "מדיניות ביטולים": "Политика отмены",
    "הצהרת נגישות": "Заявление о доступности",
    "פרטי העסק": "Реквизиты компании",

    // Landing sketch 2 (2026-10-11): hero, pain/solution, process, calculator, last call
    "מערכת ניהול לצלמי אירועים, שפותחה בידי צלם אירועים": "Система управления для фотографов мероприятий, созданная фотографом мероприятий",
    "צלמים, אתם מתמקדים בצילום,": "Фотографы, вы сосредоточены на съёмке,",
    "ואת הניהול אנחנו לוקחים על עצמנו.": "а всё управление мы берём на себя.",
    "הפכתם לצלמים מתוך אהבה לצילום ומתוך כישרון אמיתי, ולא כדי להעביר את הערבים בהודעות וואטסאפ, בחוזים ובתזכורות תשלום.": "Вы стали фотографами из любви к съёмке и благодаря настоящему таланту, а не для того, чтобы проводить вечера за сообщениями в WhatsApp, договорами и напоминаниями об оплате.",
    "אך מאחורי כל אירוע מסתתרות **כארבע וחצי שעות של עבודה מנהלית**, מהפנייה הראשונה ועד מסירת האלבום. צלם שמצלם שישה אירועים בחודש מאבד כך **יותר מ-40 ימי עבודה בשנה**. גילברטו לוקחת על עצמה את רוב העבודה הזו, כדי שתוכלו לחזור לעיסוק שבשבילו פתחתם את העסק.": "Но за каждым мероприятием скрываются **около четырёх с половиной часов административной работы**, от первого обращения до сдачи альбома. Фотограф, который снимает шесть мероприятий в месяц, теряет так **более 40 рабочих дней в год**. Гилберто берёт большую часть этой работы на себя, чтобы вы могли вернуться к делу, ради которого открыли свой бизнес.",
    "להתחיל 14 ימי ניסיון חינם": "Начать 14 дней бесплатно",
    "כמה זמן אתם משקיעים בעבודה מנהלית?": "Сколько времени уходит на администрирование?",
    "ללא כרטיס אשראי. החישוב: כ-270 דקות של עבודה מנהלית לאירוע (הפירוט בהמשך העמוד), שישה אירועים בחודש ויום עבודה בן שמונה שעות.": "Без банковской карты. Расчёт: около 270 минут административной работы на мероприятие (подробности ниже), шесть мероприятий в месяц и восьмичасовой рабочий день.",
    "מה המערכת עושה": "Что делает система",
    "עוזר חכם שמשיב ללקוחות גם בלילה": "Умный ассистент, который отвечает клиентам даже ночью",
    "הצעת מחיר וחוזה בקישור אחד": "Предложение и договор по одной ссылке",
    "תהליך עבודה לפי השיטה שלכם": "Рабочий процесс по вашему методу",
    "תזכורות תשלום וקבלות": "Напоминания об оплате и квитанции",
    "גלריה ועיצוב אלבום אוטומטי": "Галереи и автоматический дизайн альбома",
    "סנכרון עם יומן Google ו-Apple": "Синхронизация с Google и Apple Календарём",
    "פיתחתי את גילברטו משום שאחרי כל אירוע חיכו לי עוד שעות ארוכות של הודעות, קבצים ותזכורות. היום כל אלה מסודרים ומוכנים מראש, ואני מתפנה לצלם.": "Я создал Гилберто, потому что после каждого мероприятия меня ждали долгие часы сообщений, файлов и напоминаний. Сегодня всё это упорядочено и готово заранее, а я свободен снимать.",
    "דוגמה להודעות שמחכות אחרי אירוע": "Пример сообщений, которые ждут после мероприятия",
    "01:12, בדרך הביתה מחתונה": "01:12, по дороге домой со свадьбы",
    "היי, ה-14.12 עדיין פנוי? מחפשים צלם לבר מצווה": "Привет, 14.12 ещё свободно? Ищем фотографа на бар-мицву",
    "פנייה חדשה, לפני שעתיים": "Новое обращение, 2 часа назад",
    "אפשר לקבל את הצעת המחיר שוב? לא מוצאת אותה": "Можно ещё раз прислать предложение? Не могу его найти",
    "לקוחה, אתמול": "Клиентка, вчера",
    "מתי הגלריה מהחינה מוכנה? 🙏": "Когда будет готова галерея с хны? 🙏",
    "לקוחה, לפני 3 ימים": "Клиентка, 3 дня назад",
    "הכאב והפתרון": "Проблема и решение",
    "כך זה נראה היום, וכך זה נראה עם גילברטו": "Как это выглядит сегодня и как это выглядит с Гилберто",
    "כל צלם אירועים מכיר את הרשימה הזו היטב. ההבדל הוא מי מבצע את העבודה.": "Каждый фотограф мероприятий хорошо знает этот список. Разница в том, кто выполняет работу.",
    "עם גילברטו": "С Гилберто",
    "פנייה חדשה": "Новое обращение",
    "הצעת מחיר וחוזה": "Предложение и договор",
    "לפני האירוע ואחריו": "До и после мероприятия",
    "גלריה ובחירת תמונות": "Галерея и выбор фото",
    "עיצוב ואישור אלבום": "Дизайн и утверждение альбома",
    "לקוח פונה בעשר בלילה ושואל אם התאריך פנוי. אתם רואים את ההודעה רק למחרת בבוקר, ובינתיים הוא כבר פנה לשני צלמים נוספים. ועל כל אירוע שנסגר יש עוד כמה פניות שלא הבשילו, וגם עליהן עניתם.": "Клиент пишет в десять вечера и спрашивает, свободна ли дата. Вы видите сообщение только на следующее утро, а он уже обратился к двум другим фотографам. А на каждое закрытое мероприятие приходится ещё несколько обращений, которые ни к чему не привели, но на них вы тоже ответили.",
    "כ-45 דקות לאירוע, כולל פניות שלא נסגרו": "Около 45 минут на мероприятие, включая обращения, которые не закрылись",
    "עוזר הפניות משיב לו מיד, בודק ביומן שלכם שהתאריך פנוי, שואל את השאלות הנחוצות ומעביר אליכם ליד מסודר עם הטלפון וכל הפרטים.": "Ассистент обращений отвечает сразу, проверяет по вашему календарю, что дата свободна, задаёт нужные вопросы и передаёт вам аккуратный лид с телефоном и всеми деталями.",
    "הצעת מחיר בקובץ אחד, חוזה בקובץ אחר, תיקונים לפי בקשת הלקוח, ולאחר מכן כמה ימים של תזכורות עד שהוא חותם ומעביר את פרטי האירוע.": "Предложение в одном файле, договор в другом, правки по просьбе клиента, а потом несколько дней напоминаний, пока он не подпишет и не пришлёт данные мероприятия.",
    "כ-40 דקות לאירוע": "Около 40 минут на мероприятие",
    "ההצעה נשלחת כקישור בוואטסאפ. הלקוח מאשר בטלפון, ממלא את פרטי האירוע וחותם על החוזה באותו הקישור, והאירוע נפתח אצלכם ונכנס ליומן.": "Предложение отправляется ссылкой в WhatsApp. Клиент подтверждает его в телефоне, заполняет данные мероприятия и подписывает договор по той же ссылке, а мероприятие открывается у вас и попадает в календарь.",
    "לעקוב אחר מי ששילם מקדמה, לזכור למי ומתי יש להזכיר את היתרה, ולהפיק קבלה בתוכנה נפרדת, לעיתים פעמיים ושלוש לאותו אירוע.": "Следить, кто внёс предоплату, помнить, кому и когда напомнить об остатке, и выписывать квитанцию в отдельной программе, иногда два-три раза за одно мероприятие.",
    "כ-25 דקות לאירוע": "Около 25 минут на мероприятие",
    "בכל אירוע רואים מה שולם ומה נותר. כשמגיע מועד היתרה, ממתינה לכם תזכורת מוכנה לשליחה, והקבלה מופקת מהמערכת ומגיעה ללקוח בקישור קצר.": "В каждом мероприятии видно, что оплачено и что осталось. Когда приходит срок остатка, вас ждёт готовое напоминание, а квитанция выписывается в системе и приходит клиенту короткой ссылкой.",
    "שיחות תיאום על השעות, המקום וצילומי המשפחה, תיאום עם האולם ועם צלם נוסף, שאלות הלקוח בשבוע האחרון, ולבסוף סבב הודעות נוסף כדי לסגור את המסירה.": "Звонки, чтобы согласовать время, место и семейные фото, координация с залом и вторым фотографом, вопросы клиента в последнюю неделю и, наконец, ещё один круг сообщений, чтобы завершить сдачу.",
    "כ-60 דקות לאירוע": "Около 60 минут на мероприятие",
    "ללקוח יש פורטל אישי עם כל הפרטים והשלבים, וביום הצילום מרוכזים אצלכם במסך אחד המקום עם ניווט, השעות, הטלפון והחבילה.": "У клиента есть личный портал со всеми деталями и этапами, а в день съёмки у вас на одном экране место с навигацией, время, телефон и пакет.",
    "שולחים גלריה, ממתינים שבועות לבחירה ושולחים תזכורות, ולבסוף מקבלים בוואטסאפ רשימה של עשרות מספרי קבצים, שאותם יש לאתר אחד אחד.": "Вы отправляете галерею, неделями ждёте выбора и шлёте напоминания, а в итоге получаете в WhatsApp список из десятков номеров файлов, которые нужно искать по одному.",
    "כ-50 דקות לאירוע": "Около 50 минут на мероприятие",
    "הלקוח מסמן את התמונות האהובות עליו בגלריה עצמה, ואתם רואים את הבחירה מסודרת במקום אחד, מוכנה לאלבום.": "Клиент отмечает любимые фото прямо в галерее, а вы видите выбор упорядоченным в одном месте, готовым для альбома.",
    "ערב או שניים של עימוד, ולאחריהם סבבי הערות בהודעות עד שהלקוח מאשר, ולבסוף שליחת הקבצים לבית הדפוס.": "Вечер-два вёрстки, затем круги правок в сообщениях, пока клиент не утвердит, и наконец отправка файлов в типографию.",
    "כ-50 דקות של תיאום לאירוע, לא כולל העיצוב עצמו": "Около 50 минут согласований на мероприятие, не считая самого дизайна",
    "העיצוב האוטומטי מסדר את האלבום מהתמונות שהלקוח בחר, ואתם משנים כרצונכם. הלקוח עובר על העיצוב ומאשר בפורטל האישי, והקבצים נשלחים לבית הדפוס ישירות מהמערכת.": "Автоматический дизайн собирает альбом из фото, выбранных клиентом, а вы меняете что угодно. Клиент просматривает и утверждает дизайн в личном портале, а файлы отправляются в типографию прямо из системы.",
    "שעות (אחרי מספר)": "часа",
    "דקות": "минут",
    "ימי עבודה": "рабочих дней",
    "של עבודה מנהלית על אירוע אחד, ללא מערכת": "административной работы на одно мероприятие без системы",
    "מה שנותר עם גילברטו, בעיקר מענה לשאלות אמיתיות של לקוחות": "столько остаётся с Гилберто, в основном ответы на настоящие вопросы клиентов",
    "שחוזרים אליכם בשנה, בשישה אירועים בחודש": "возвращаются к вам за год при шести мероприятиях в месяц",
    "הזמנים הם הערכה לאירוע ממוצע, מהפנייה הראשונה ועד המסירה, כולל פניות שלא נסגרו. כל צלם עובד אחרת, ולכן במחשבון שלמטה אפשר להתאים אותם לעסק שלכם.": "Время указано ориентировочно для среднего мероприятия, от первого обращения до сдачи, включая обращения, которые не закрылись. Каждый фотограф работает по-своему, поэтому в калькуляторе ниже их можно подстроить под ваш бизнес.",
    "מהפנייה הראשונה ועד המסירה": "От первого обращения до сдачи",
    "מערכת שמתאימה את עצמה לתהליך שלכם": "Система, которая подстраивается под ваш процесс",
    "אין צורך לשנות את הדרך שבה אתם עובדים. בונים את החבילות ואת שלבי העבודה כפי שאתם רגילים, ובכל אירוע רואים מהו הצעד הבא.": "Не нужно менять то, как вы работаете. Вы составляете пакеты и этапы работы так, как привыкли, и в каждом мероприятии видите следующий шаг.",
    "דוגמה לחבילה מותאמת": "Пример собственного пакета",
    "החבילה שלכם, ״חתונה מלאה״": "Ваш пакет «Полная свадьба»",
    "בחירת תמונות לאלבום": "Выбор фото для альбома",
    "שלב שלכם": "Ваш этап",
    "קבוע בכל חבילה": "В каждом пакете",
    "+ שלב משלכם": "+ Свой этап",
    "החבילות והמחירים שלכם": "Ваши пакеты и цены",
    "חבילות ללא הגבלה, כל אחת עם השלבים המתאימים לה.": "Неограниченное число пакетов, у каждого свои этапы.",
    "ההודעות ללקוח בניסוח שלכם": "Сообщения клиентам вашими словами",
    "בסיום כל שלב, ההודעה ללקוח כבר כתובה וממתינה לשליחה בוואטסאפ, במילים שבחרתם.": "По завершении каждого этапа сообщение клиенту уже написано и ждёт отправки в WhatsApp, теми словами, которые вы выбрали.",
    "תמונת מצב מלאה של העסק": "Полная картина вашего бизнеса",
    "במסך הבית מוצגים הצילום הקרוב, הסכומים שנותרו לגבייה והמצב של כל אירוע.": "На главном экране — ближайшая съёмка, суммы, которые осталось получить, и статус каждого мероприятия.",
    "מחשבון": "Калькулятор",
    "כמה זמן וכסף העבודה המנהלית עולה לכם?": "Сколько времени и денег стоит вам административная работа?",
    "הזיזו את הסמנים בהתאם לעסק שלכם, וקבלו את המספרים שלכם.": "Передвиньте ползунки под свой бизнес и получите свои цифры.",
    "זמן עבודה מנהלית על כל אירוע": "Административная работа на мероприятие",
    "מה שווי שעת העבודה שלכם?": "Сколько стоит ваш рабочий час?",
    "ימי עבודה שחוזרים אליכם בשנה": "Рабочих дней возвращается к вам за год",
    "החישוב מניח שגם עם גילברטו נשארות כ-40 דקות לאירוע, ושיום עבודה הוא שמונה שעות. זו הערכה, לא התחייבות.": "Расчёт исходит из того, что и с Гилберто на мероприятие остаётся около 40 минут, а рабочий день длится восемь часов. Это оценка, а не обязательство.",
    "השאירו לנו את הניהול, וחזרו לצלם": "Оставьте управление нам и возвращайтесь к съёмке",
    "14 ימי ניסיון חינם עם כל האפשרויות, ללא כרטיס אשראי וללא התחייבות.": "14 дней бесплатно со всеми возможностями, без банковской карты и без обязательств.",
  },
};

export default dict;
