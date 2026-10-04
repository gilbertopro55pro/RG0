import type { AreaDict } from "@/i18n/types";

// Area "photographerNotify" (2026-10-04; see src/i18n/dict/index.ts). Hebrew source text → translation.
// Emails and phone notifications the system sends TO THE PHOTOGRAPHER about their work (new leads,
// the intake assistant's usage alerts, quote/contract/album/gallery activity, exports, reminders),
// in their own language (photographers.ui_lang). Also imported directly by lib/albumExportJobs.ts
// (the Fly worker's render graph), so keep this file free of imports beyond the type.
const dict: AreaDict = {
  en: {
    // Shared lines
    "שלום {name},": "Hi {name},",
    "שלום,": "Hi,",
    "לחצו לפתיחת הלידים": "Tap to open your leads",
    "לחצו לפתיחת האירוע": "Tap to open the event",
    "לכל הלידים: {url}": "All leads: {url}",
    "פרטי האירוע:": "Event details:",
    "שם: {v}": "Name: {v}",
    "טלפון: {v}": "Phone: {v}",
    "אירוע: {v}": "Event: {v}",
    "תאריך: {v}": "Date: {v}",
    "מקום: {v}": "Location: {v}",
    "מיקום: {v}": "Location: {v}",
    "אורחים: {v}": "Guests: {v}",
    "חלק ביום: {v}": "Time of day: {v}",
    "לכלול: {v}": "To include: {v}",
    "צלם וידאו נוסף: {v}": "Separate videographer: {v}",
    "שעות: {v}": "Hours: {v}",
    "חשוב להם: {v}": "What matters to them: {v}",
    "הערות: {v}": "Notes: {v}",
    "חבילה: {v}": "Package: {v}",
    "שם הלקוח/ה: {v}": "Client name: {v}",
    "טלפון הלקוח/ה: {v}": "Client phone: {v}",
    "שם מלא: {v}": "Full name: {v}",
    "תאריך האירוע: {v}": "Event date: {v}",
    "סוג האירוע: {v}": "Event type: {v}",
    "סכום ההצעה: {v}": "Quote amount: {v}",
    "לא הוזן": "Not entered",
    "לא צוין": "Not specified",
    "יעודכן": "To be updated",
    "האירוע": "the event",

    // Intake assistant: lead details (labels, also the conversation PDF)
    "בוקר": "Morning",
    "ערב": "Evening",
    "מקום": "Location",
    "אורחים": "Guests",
    "חלק ביום": "Time of day",
    "מה ייכלל בצילום": "Coverage",
    "צלם וידאו נוסף": "Separate videographer",
    "חשוב להם": "What matters to them",
    "מספר אורחים משוער": "Approximate number of guests",
    "האם צריך צלם וידאו נוסף": "Whether a separate videographer is needed",
    "אירוע בוקר או ערב": "Morning or evening event",
    "בדיקת התאריך": "the date check",
    "(תפוס)": "(taken)",
    "טרם נקבע": "Not set yet",
    "טרם נקבע (בערך {approx})": "Not set yet (around {approx})",
    "(תאריך טרם נקבע)": "(date not set yet)",

    // Intake assistant: new lead push and emails
    "פנייה חדשה מהעוזר: {name}": "New inquiry from the assistant: {name}",
    "פנייה מהעוזר": "Inquiry from the assistant",
    "פנייה חדשה מהעוזר: {name}, {type} {date}": "New inquiry from the assistant: {name}, {type} {date}",
    "מצורף סיכום השיחה כקובץ PDF. אפשר להעביר אותו ללקוח בוואטסאפ.": "The conversation summary is attached as a PDF. You can forward it to the client on WhatsApp.",
    "העוזר אסף את כל פרטי האירוע. הליד מחכה להצעת מחיר ממך.": "The assistant collected all the event details. The lead is waiting for your price quote.",
    "העוזר אסף את כל פרטי האירוע. הלקוח/ה לא ענה/תה על השאלה האחרונה, אז הפנייה מועברת אליך עכשיו. הליד מחכה להצעת מחיר ממך.":
      "The assistant collected all the event details. The client didn't answer the last question, so the inquiry is being passed to you now. The lead is waiting for your price quote.",
    "פנייה לתאריך תפוס נכנסה לרשימת ההמתנה: {name}": "Inquiry for a taken date added to the waitlist: {name}",
    "לקוח/ה פנה/תה לתאריך שכבר תפוס אצלך, ונכנס/ה לרשימת ההמתנה.": "A client asked about a date you're already booked on and was added to the waitlist.",
    "פנייה חלקית מהעוזר: {name}": "Partial inquiry from the assistant: {name}",
    "לקוח/ה התחיל/ה שיחה עם העוזר והשאיר/ה טלפון, אבל לא סיים/ה. חסר: {missing}. כדאי ליצור קשר.":
      "A client started a conversation with the assistant and left a phone number, but didn't finish. Missing: {missing}. It's worth getting in touch.",

    // Intake assistant: conversation PDF
    "סיכום-השיחה": "conversation-summary",
    "סיכום השיחה": "Conversation summary",
    "השיחה עם {name}": "Conversation with {name}",
    "השיחה עם הלקוח": "Conversation with the client",
    "השיחה": "The conversation",
    "הלקוח": "Client",
    "העוזר של {studio}": "{studio}'s assistant",
    "השיחה נשמרה אוטומטית ע״י העוזר של {studio}": "Saved automatically by {studio}'s assistant",

    // Intake assistant: monthly cap alerts
    "עוזר הפניות: נוצלו 90% מהמכסה": "Intake assistant: 90% of the quota used",
    "{used} מתוך {cap} שיחות החודש. נשארו {left}, ועוד {extra} שיחות שרכשת.": "{used} of {cap} conversations this month. {left} left, plus {extra} conversations you bought.",
    "{used} מתוך {cap} שיחות החודש. נשארו {left}. אחרי המכסה הלקוחות יקבלו טופס פנייה רגיל. אפשר לרכוש שיחות נוספות בהגדרות.":
      "{used} of {cap} conversations this month. {left} left. After the quota, clients will get a regular inquiry form. You can buy more conversations in Settings.",
    "עוזר הפניות: המכסה החודשית נוצלה": "Intake assistant: monthly quota used up",
    "נוצלו כל {cap} השיחות של החודש. העוזר ממשיך עם {extra} השיחות שרכשת.": "All {cap} conversations for this month have been used. The assistant continues with the {extra} conversations you bought.",
    "נוצלו כל {cap} השיחות של החודש. מעכשיו לקוחות חדשים מקבלים טופס פנייה רגיל עד תחילת החודש הבא. אפשר לרכוש שיחות נוספות בהגדרות.":
      "All {cap} conversations for this month have been used. From now on, new clients get a regular inquiry form until the start of next month. You can buy more conversations in Settings.",
    "עוזר הפניות: השיחות שרכשת נגמרו": "Intake assistant: your bought conversations ran out",
    "השתמשת בשיחה האחרונה שרכשת, ומכסת {cap} השיחות של החודש כבר נוצלה. מעכשיו לקוחות חדשים מקבלים טופס פנייה רגיל עד תחילת החודש הבא, או עד שתרכוש שיחות נוספות בהגדרות.":
      "You've used the last conversation you bought, and this month's quota of {cap} conversations is already used up. From now on, new clients get a regular inquiry form until the start of next month, or until you buy more conversations in Settings.",
    "הגדרות העוזר:": "Assistant settings:",

    // Inquiry form
    "פנייה חדשה: {name}": "New inquiry: {name}",
    "פנייה חדשה מהטופס: {name}": "New inquiry from the form: {name}",
    "התקבלה פנייה חדשה בטופס הפנייה שלך.": "A new inquiry came in through your inquiry form.",

    // Test notification
    "ההתראות עובדות. ככה תדעו על פנייה חדשה או אישור של לקוח.": "Notifications are working. This is how you'll hear about a new inquiry or a client's approval.",

    // Quote approved / questionnaire
    "{name} אישרו את הצעת המחיר": "{name} approved the price quote",
    "אירוע חדש נוצר אוטומטית | {name}": "New event created automatically | {name}",
    "הלקוח/ה {name} אישר/ה את הצעת המחיר ומילא/ה שאלון פרטים. האירוע נוסף אוטומטית ליומן שלך.":
      "{name} approved the price quote and filled in the details questionnaire. The event was added to your calendar automatically.",
    "מקדמה: {deposit} · יתרה לתשלום: {balance}": "Deposit: {deposit} · Balance due: {balance}",
    "(החבילה נבחרה לפי פריטי ההצעה. אפשר לשנות אותה בעמוד האירוע.)": "(The package was chosen from the quote's items. You can change it on the event page.)",
    "החוזה הוצג ללקוח/ה לחתימה כשלב האחרון בשאלון. כשייחתם, שלב סגירת האירוע יסומן כבוצע ותקבל/י עדכון.":
      "The contract was shown to the client for signing as the questionnaire's last step. Once it's signed, the booking stage will be marked as done and you'll get an update.",
    "ניתן לעדכן את פרטי המקדמה/יתרה ולעקוב אחרי האירוע בעמוד האירוע במערכת.": "You can update the deposit/balance and follow the event on its event page.",

    // Contract signed
    "{name} חתמו על החוזה": "{name} signed the contract",
    "האירוע ב-{date}. לחצו לפתיחת האירוע": "The event is on {date}. Tap to open the event",
    "החוזה עם {name} נחתם": "The contract with {name} was signed",
    "החוזה עבור האירוע של {name} נחתם דיגיטלית על ידי {signer}.": "The contract for {name}'s event was signed digitally by {signer}.",
    "מעבר לעמוד האירוע לשליחת הודעת פתיחה ללקוח/ה:": "Go to the event page to send the client a welcome message:",

    // Album activity (the action phrase the album routes pass)
    "אישרו את עיצוב האלבום הסופי": "approved the final album design",
    "הערה חדשה על עיצוב האלבום": "new comment on the album design",

    // Gallery selection / upload
    "{name} סיימו לבחור תמונות מהגלריה": "{name} finished selecting photos from the gallery",
    "הלקוח/ה של \"{name}\" ({date}) סיימו לבחור תמונות מהגלריה.": "The client of \"{name}\" ({date}) finished selecting photos from the gallery.",
    "הלקוח/ה של \"{name}\" סיימו לבחור תמונות מהגלריה.": "The client of \"{name}\" finished selecting photos from the gallery.",
    "נבחרו {n} תמונות.": "{n} photos were selected.",
    "לצפייה והורדה של התמונות שנבחרו:": "View and download the selected photos:",
    "העלאת התמונות ל\"{title}\" הסתיימה": "Upload to \"{title}\" finished",
    "העלאת התמונות לגלריה \"{title}\" הסתיימה.": "The photo upload to the gallery \"{title}\" finished.",
    "העלאת התמונות לגלריה \"{title}\" הסתיימה, {ok} מתוך {total} תמונות הועלו בהצלחה.": "The photo upload to the gallery \"{title}\" finished, {ok} of {total} photos uploaded successfully.",
    "לצפייה בגלריה:": "View the gallery:",

    // Album export ready
    "ייצוא {format} מוכן להורדה | {title}": "{format} export ready to download | {title}",
    "ייצוא ה-{format} של האלבום \"{title}\" הסתיים ומוכן להורדה:": "The {format} export of the album \"{title}\" is done and ready to download:",
    "הקישור בתוקף לשבוע ימים.": "The link is valid for one week.",

    // Analytics export
    "נתוני הכנסות | {month} | גילברטו": "Revenue data | {month} | Gilberto",
    "מצורף קובץ הנתונים עבור {month}.\n\nנשלח ממערכת גילברטו, ניהול אירועים לצלמים.": "Attached is the data file for {month}.\n\nSent from Gilberto, event management for photographers.",

    // Gallery archived
    "הגלריה של {name} עברה לארכיון": "{name}'s gallery was archived",
    "תוקף הגלריה \"{title}\" ({client}) הסתיים והיא עברה לארכיון.": "The gallery \"{title}\" ({client}) has expired and was moved to the archive.",
    "הגלריה תימחק סופית מהאחסון בתאריך {date}, כולל כל התמונות שבה.": "The gallery will be permanently deleted from storage on {date}, including all its photos.",
    "אם תרצה/י לחדש את תוקף הגלריה לפני המחיקה, אפשר לעשות זאת מתוך כרטיס האירוע במערכת.": "If you'd like to extend the gallery before it's deleted, you can do it from the event's page.",

    // Quote follow-up reminder
    "תזכורת מעקב אחרי הצעת מחיר | {name}": "Price quote follow-up reminder | {name}",
    "עברו יומיים מאז שנשלחה הצעת מחיר ל{name} ועדיין לא התקבלה תשובה. כדאי לבצע פולואפ:": "Two days have passed since a price quote was sent to {name} and there's no answer yet. Worth following up:",
    "אפשר לבצע את הפולואפ ישירות מהאפליקציה, בעמוד הלידים.": "You can follow up right from the app, on the Leads page.",
  },
  ru: {
    // Shared lines
    "שלום {name},": "Здравствуйте, {name}!",
    "שלום,": "Здравствуйте!",
    "לחצו לפתיחת הלידים": "Нажмите, чтобы открыть заявки",
    "לחצו לפתיחת האירוע": "Нажмите, чтобы открыть мероприятие",
    "לכל הלידים: {url}": "Все заявки: {url}",
    "פרטי האירוע:": "Детали мероприятия:",
    "שם: {v}": "Имя: {v}",
    "טלפון: {v}": "Телефон: {v}",
    "אירוע: {v}": "Мероприятие: {v}",
    "תאריך: {v}": "Дата: {v}",
    "מקום: {v}": "Место: {v}",
    "מיקום: {v}": "Место: {v}",
    "אורחים: {v}": "Гости: {v}",
    "חלק ביום: {v}": "Время дня: {v}",
    "לכלול: {v}": "Включить: {v}",
    "צלם וידאו נוסף: {v}": "Отдельный видеооператор: {v}",
    "שעות: {v}": "Часы: {v}",
    "חשוב להם: {v}": "Для них важно: {v}",
    "הערות: {v}": "Примечания: {v}",
    "חבילה: {v}": "Пакет: {v}",
    "שם הלקוח/ה: {v}": "Имя клиента: {v}",
    "טלפון הלקוח/ה: {v}": "Телефон клиента: {v}",
    "שם מלא: {v}": "Полное имя: {v}",
    "תאריך האירוע: {v}": "Дата мероприятия: {v}",
    "סוג האירוע: {v}": "Тип мероприятия: {v}",
    "סכום ההצעה: {v}": "Сумма предложения: {v}",
    "לא הוזן": "Не указан",
    "לא צוין": "Не указано",
    "יעודכן": "Будет уточнено",
    "האירוע": "мероприятия",

    // Intake assistant: lead details
    "בוקר": "Утро",
    "ערב": "Вечер",
    "מקום": "Место",
    "אורחים": "Гости",
    "חלק ביום": "Время дня",
    "מה ייכלל בצילום": "Что включить в съёмку",
    "צלם וידאו נוסף": "Отдельный видеооператор",
    "חשוב להם": "Для них важно",
    "מספר אורחים משוער": "Примерное число гостей",
    "האם צריך צלם וידאו נוסף": "Нужен ли отдельный видеооператор",
    "אירוע בוקר או ערב": "Утреннее или вечернее мероприятие",
    "בדיקת התאריך": "проверка даты",
    "(תפוס)": "(занято)",
    "טרם נקבע": "Ещё не назначена",
    "טרם נקבע (בערך {approx})": "Ещё не назначена (примерно {approx})",
    "(תאריך טרם נקבע)": "(дата ещё не назначена)",

    // Intake assistant: new lead push and emails
    "פנייה חדשה מהעוזר: {name}": "Новое обращение от ассистента: {name}",
    "פנייה מהעוזר": "Обращение от ассистента",
    "פנייה חדשה מהעוזר: {name}, {type} {date}": "Новое обращение от ассистента: {name}, {type} {date}",
    "מצורף סיכום השיחה כקובץ PDF. אפשר להעביר אותו ללקוח בוואטסאפ.": "Итоги разговора приложены в PDF. Вы можете переслать их клиенту в WhatsApp.",
    "העוזר אסף את כל פרטי האירוע. הליד מחכה להצעת מחיר ממך.": "Ассистент собрал все детали мероприятия. Заявка ждёт вашего ценового предложения.",
    "העוזר אסף את כל פרטי האירוע. הלקוח/ה לא ענה/תה על השאלה האחרונה, אז הפנייה מועברת אליך עכשיו. הליד מחכה להצעת מחיר ממך.":
      "Ассистент собрал все детали мероприятия. Клиент не ответил на последний вопрос, поэтому обращение передаётся вам сейчас. Заявка ждёт вашего ценового предложения.",
    "פנייה לתאריך תפוס נכנסה לרשימת ההמתנה: {name}": "Обращение на занятую дату добавлено в лист ожидания: {name}",
    "לקוח/ה פנה/תה לתאריך שכבר תפוס אצלך, ונכנס/ה לרשימת ההמתנה.": "Клиент обратился на дату, которая у вас уже занята, и добавлен в лист ожидания.",
    "פנייה חלקית מהעוזר: {name}": "Неполное обращение от ассистента: {name}",
    "לקוח/ה התחיל/ה שיחה עם העוזר והשאיר/ה טלפון, אבל לא סיים/ה. חסר: {missing}. כדאי ליצור קשר.":
      "Клиент начал разговор с ассистентом и оставил телефон, но не закончил. Не хватает: {missing}. Стоит связаться с ним.",

    // Intake assistant: conversation PDF
    "סיכום-השיחה": "итоги-разговора",
    "סיכום השיחה": "Итоги разговора",
    "השיחה עם {name}": "Разговор с {name}",
    "השיחה עם הלקוח": "Разговор с клиентом",
    "השיחה": "Разговор",
    "הלקוח": "Клиент",
    "העוזר של {studio}": "Ассистент {studio}",
    "השיחה נשמרה אוטומטית ע״י העוזר של {studio}": "Разговор автоматически сохранён ассистентом {studio}",

    // Intake assistant: monthly cap alerts
    "עוזר הפניות: נוצלו 90% מהמכסה": "Ассистент обращений: использовано 90% лимита",
    "{used} מתוך {cap} שיחות החודש. נשארו {left}, ועוד {extra} שיחות שרכשת.": "{used} из {cap} разговоров в этом месяце. Осталось {left}, и ещё {extra} купленных разговоров.",
    "{used} מתוך {cap} שיחות החודש. נשארו {left}. אחרי המכסה הלקוחות יקבלו טופס פנייה רגיל. אפשר לרכוש שיחות נוספות בהגדרות.":
      "{used} из {cap} разговоров в этом месяце. Осталось {left}. После лимита клиенты получат обычную форму обращения. Дополнительные разговоры можно купить в настройках.",
    "עוזר הפניות: המכסה החודשית נוצלה": "Ассистент обращений: месячный лимит исчерпан",
    "נוצלו כל {cap} השיחות של החודש. העוזר ממשיך עם {extra} השיחות שרכשת.": "Все {cap} разговоров этого месяца использованы. Ассистент продолжает работать за счёт {extra} купленных вами разговоров.",
    "נוצלו כל {cap} השיחות של החודש. מעכשיו לקוחות חדשים מקבלים טופס פנייה רגיל עד תחילת החודש הבא. אפשר לרכוש שיחות נוספות בהגדרות.":
      "Все {cap} разговоров этого месяца использованы. Теперь новые клиенты будут получать обычную форму обращения до начала следующего месяца. Дополнительные разговоры можно купить в настройках.",
    "עוזר הפניות: השיחות שרכשת נגמרו": "Ассистент обращений: купленные разговоры закончились",
    "השתמשת בשיחה האחרונה שרכשת, ומכסת {cap} השיחות של החודש כבר נוצלה. מעכשיו לקוחות חדשים מקבלים טופס פנייה רגיל עד תחילת החודש הבא, או עד שתרכוש שיחות נוספות בהגדרות.":
      "Вы использовали последний купленный разговор, а месячный лимит в {cap} разговоров уже исчерпан. Теперь новые клиенты будут получать обычную форму обращения до начала следующего месяца или пока вы не купите дополнительные разговоры в настройках.",
    "הגדרות העוזר:": "Настройки ассистента:",

    // Inquiry form
    "פנייה חדשה: {name}": "Новое обращение: {name}",
    "פנייה חדשה מהטופס: {name}": "Новое обращение из формы: {name}",
    "התקבלה פנייה חדשה בטופס הפנייה שלך.": "Через вашу форму обращения пришло новое обращение.",

    // Test notification
    "ההתראות עובדות. ככה תדעו על פנייה חדשה או אישור של לקוח.": "Уведомления работают. Так вы узнаете о новом обращении или одобрении клиента.",

    // Quote approved / questionnaire
    "{name} אישרו את הצעת המחיר": "{name}: ценовое предложение одобрено",
    "אירוע חדש נוצר אוטומטית | {name}": "Новое мероприятие создано автоматически | {name}",
    "הלקוח/ה {name} אישר/ה את הצעת המחיר ומילא/ה שאלון פרטים. האירוע נוסף אוטומטית ליומן שלך.":
      "Клиент {name} одобрил ценовое предложение и заполнил анкету. Мероприятие автоматически добавлено в ваш календарь.",
    "מקדמה: {deposit} · יתרה לתשלום: {balance}": "Предоплата: {deposit} · Остаток к оплате: {balance}",
    "(החבילה נבחרה לפי פריטי ההצעה. אפשר לשנות אותה בעמוד האירוע.)": "(Пакет выбран по позициям предложения. Его можно изменить на странице мероприятия.)",
    "החוזה הוצג ללקוח/ה לחתימה כשלב האחרון בשאלון. כשייחתם, שלב סגירת האירוע יסומן כבוצע ותקבל/י עדכון.":
      "Договор был показан клиенту на подпись как последний шаг анкеты. Когда он будет подписан, этап закрытия мероприятия отметится как выполненный, и вы получите уведомление.",
    "ניתן לעדכן את פרטי המקדמה/יתרה ולעקוב אחרי האירוע בעמוד האירוע במערכת.": "Предоплату и остаток можно изменить, а мероприятие отслеживать на его странице в системе.",

    // Contract signed
    "{name} חתמו על החוזה": "{name}: договор подписан",
    "האירוע ב-{date}. לחצו לפתיחת האירוע": "Мероприятие {date}. Нажмите, чтобы открыть мероприятие",
    "החוזה עם {name} נחתם": "Договор с {name} подписан",
    "החוזה עבור האירוע של {name} נחתם דיגיטלית על ידי {signer}.": "Договор на мероприятие {name} подписан в электронном виде: {signer}.",
    "מעבר לעמוד האירוע לשליחת הודעת פתיחה ללקוח/ה:": "Перейдите на страницу мероприятия, чтобы отправить клиенту приветственное сообщение:",

    // Album activity
    "אישרו את עיצוב האלבום הסופי": "одобрили финальный дизайн альбома",
    "הערה חדשה על עיצוב האלבום": "новый комментарий к дизайну альбома",

    // Gallery selection / upload
    "{name} סיימו לבחור תמונות מהגלריה": "{name}: выбор фото из галереи завершён",
    "הלקוח/ה של \"{name}\" ({date}) סיימו לבחור תמונות מהגלריה.": "Клиент «{name}» ({date}) закончил выбирать фото из галереи.",
    "הלקוח/ה של \"{name}\" סיימו לבחור תמונות מהגלריה.": "Клиент «{name}» закончил выбирать фото из галереи.",
    "נבחרו {n} תמונות.": "Выбрано фото: {n}.",
    "לצפייה והורדה של התמונות שנבחרו:": "Просмотр и скачивание выбранных фото:",
    "העלאת התמונות ל\"{title}\" הסתיימה": "Загрузка фото в «{title}» завершена",
    "העלאת התמונות לגלריה \"{title}\" הסתיימה.": "Загрузка фото в галерею «{title}» завершена.",
    "העלאת התמונות לגלריה \"{title}\" הסתיימה, {ok} מתוך {total} תמונות הועלו בהצלחה.": "Загрузка фото в галерею «{title}» завершена, успешно загружено {ok} из {total}.",
    "לצפייה בגלריה:": "Открыть галерею:",

    // Album export ready
    "ייצוא {format} מוכן להורדה | {title}": "Экспорт {format} готов к скачиванию | {title}",
    "ייצוא ה-{format} של האלבום \"{title}\" הסתיים ומוכן להורדה:": "Экспорт {format} альбома «{title}» завершён и готов к скачиванию:",
    "הקישור בתוקף לשבוע ימים.": "Ссылка действует одну неделю.",

    // Analytics export
    "נתוני הכנסות | {month} | גילברטו": "Данные о доходах | {month} | Гилберто",
    "מצורף קובץ הנתונים עבור {month}.\n\nנשלח ממערכת גילברטו, ניהול אירועים לצלמים.": "Во вложении файл с данными за {month}.\n\nОтправлено из Гилберто — системы управления мероприятиями для фотографов.",

    // Gallery archived
    "הגלריה של {name} עברה לארכיון": "Галерея {name} перемещена в архив",
    "תוקף הגלריה \"{title}\" ({client}) הסתיים והיא עברה לארכיון.": "Срок действия галереи «{title}» ({client}) истёк, и она перемещена в архив.",
    "הגלריה תימחק סופית מהאחסון בתאריך {date}, כולל כל התמונות שבה.": "Галерея будет окончательно удалена из хранилища {date} вместе со всеми фото.",
    "אם תרצה/י לחדש את תוקף הגלריה לפני המחיקה, אפשר לעשות זאת מתוך כרטיס האירוע במערכת.": "Если вы хотите продлить галерею до удаления, это можно сделать на странице мероприятия в системе.",

    // Quote follow-up reminder
    "תזכורת מעקב אחרי הצעת מחיר | {name}": "Напоминание о ценовом предложении | {name}",
    "עברו יומיים מאז שנשלחה הצעת מחיר ל{name} ועדיין לא התקבלה תשובה. כדאי לבצע פולואפ:": "Прошло два дня с тех пор, как {name} получил ценовое предложение, а ответа всё нет. Стоит напомнить о себе:",
    "אפשר לבצע את הפולואפ ישירות מהאפליקציה, בעמוד הלידים.": "Напомнить можно прямо из приложения, на странице заявок.",
  },
};

export default dict;
