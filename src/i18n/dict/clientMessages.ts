import type { AreaDict } from "@/i18n/types";

// Area "clientMessages" (UI languages phase 3: text sent to the client; see src/i18n/dict/index.ts).
// Hebrew source text → translation. The client update templates themselves (long, multi-line) are
// typed constants next to the Hebrew ones in src/lib/stages.ts; this file holds the settings chrome.
const dict: AreaDict = {
  en: {
    // The album / film reminders (api/scheduled-messages/[id]/confirm-client-reminder): only the body;
    // the greeting, link line and signature come from lib/clientMessageFormat.ts.
    "עיצוב האלבום שלכם ממתין לאישורכם.\nאפשר לדפדף בו, ובסוף לאשר את העיצוב או לסמן תיקונים, כשיתאפשר לכם.": "Your album design is awaiting your approval.\nYou can page through it, and at the end approve the design or mark corrections, whenever it suits you.",
    "עיצוב האלבום שלכם ממתין לאישורכם.\nאפשר לצפות בו ולאשר אותו בפורטל האישי שלכם, ואם תרצו לשנות משהו, נשמח לשמוע.": "Your album design is awaiting your approval.\nYou can view and approve it in your personal portal, and if you'd like to change anything, we'd be glad to hear.",
    "רצינו לעדכן שהסרט המלא ממתין לכם להורדה בפורטל האישי שלכם.\nכדי שנוכל להתחיל בעריכת הקליפ, נשמח שתבחרו שיר או שניים: שיר שקט ושיר קצבי 🎵": "We wanted to let you know that your full film is waiting for you to download in your personal portal.\nSo we can start editing the clip, we'd love for you to choose one or two songs: a calm one and an upbeat one 🎵",
    "שליחת תזכורת ללקוח": "Send the client a reminder",
    "תזכורת לבחור את השירים בפורטל, עם הקישור לפורטל של האירוע.": "A reminder to choose the songs in the portal, with the link to the event's portal.",
    "תזכורת לבחירת שירים ל{name}": "Song reminder for {name}",
    "הלקוח יפתח את הפורטל בקישור ויבחר שם את השירים לקליפ. אפשר לערוך את ההודעה לפני השליחה.": "The client opens the portal from the link and chooses the songs for the clip there. You can edit the message before sending.",
    "שפת ההודעה": "Message language",
    "הנוסח הזה נשלח ללקוחות שהשפה שלהם באירוע היא {lang}. ללקוחות בעברית נשלח הנוסח בעברית.":
      "This version is sent to clients whose event language is {lang}. Hebrew-speaking clients get the Hebrew version.",
    // Quote follow-up email to the lead (cron/send-scheduled-messages): subject and body.
    "בהמשך להצעת המחיר ששלחנו לכם":
      "Following up on the quote we sent you",
    "רצינו לעדכן שהצעת המחיר ששלחנו לכם עדיין בתוקף.\nנשמח לענות על כל שאלה ולתאם איתכם את הפרטים, כשיתאפשר לכם.":
      "We wanted to let you know that the quote we sent you is still valid.\nWe'd be glad to answer any questions and arrange the details with you, whenever it suits you.",
    // Album design ready (events/[id]/album-design): the body of the message with the PDF link.
    "עיצוב האלבום שלכם מוכן לאישור 🎉\nבקישור אפשר לצפות בקובץ העיצוב, ונשמח לשמוע מה דעתכם.":
      "Your album design is ready for your approval 🎉\nYou can view the design file at the link, and we'd love to hear what you think.",
    // The quote link message (lib/quoteDefaults.ts quoteLinkMessage): the lines under the caption.
    "קישור להצעת המחיר:": "Quote link:",
    "יש ללחוץ על הקישור לצפייה ואישור הצעת המחיר.": "Tap the link to view and approve the quote.",
    "יש ללחוץ על הקישור לצפייה בהצעת המחיר.": "Tap the link to view the quote.",
    "תיק העבודות שלי:": "My portfolio:",
    "לאחר האישור ממלאים כמה פרטים קצרים על האירוע וחותמים על החוזה, הכל באותו קישור.":
      "After approving, you fill in a few short details about the event and sign the contract, all at the same link.",
    // Gallery share messages (GalleryShareModal / GalleryManageView): the bodies; greeting, link line and signature come from lib/clientMessageFormat.ts.
    "הגלריה מהאירוע שלכם מוכנה לצפייה 📸\nאפשר ליהנות מהתמונות, לבחור את האהובות עליכם, להוריד ולשתף.":
      "Your event gallery is ready to view 📸\nYou can enjoy the photos, choose your favorites, download and share.",
    "היה אירוע מעולה, תודה על הזכות לצלם לכם. שנפגש רק בשמחות 🙏🏼\nאפשר להוריד את התמונות ולשתף, ולא לשכוח לתייג.":
      "It was a wonderful event, thank you for the privilege of photographing it for you. Wishing you only happy occasions 🙏🏼\nYou can download and share the photos, and don't forget to tag us.",
    "הגלריה זמינה למשך {period}.":
      "The gallery is available for {period}.",
    "רצינו לעדכן שנוספו לגלריה שלכם {count} תמונות חדשות 📸":
      "We wanted to let you know that {count} new photos were added to your gallery 📸",
    // A finished album export shared with the client (GalleryShareModal buildExportReadyMessage).
    "האלבום שלכם מוכן להורדה בפורמט {format}.":
      "Your album is ready to download as {format}.",
    "קבצי האלבום שלכם מוכנים להורדה.":
      "Your album files are ready to download.",
  },
  ru: {
    "עיצוב האלבום שלכם ממתין לאישורכם.\nאפשר לדפדף בו, ובסוף לאשר את העיצוב או לסמן תיקונים, כשיתאפשר לכם.": "Дизайн вашего альбома ждёт вашего утверждения.\nЕго можно пролистать, а в конце утвердить дизайн или отметить исправления, когда вам будет удобно.",
    "עיצוב האלבום שלכם ממתין לאישורכם.\nאפשר לצפות בו ולאשר אותו בפורטל האישי שלכם, ואם תרצו לשנות משהו, נשמח לשמוע.": "Дизайн вашего альбома ждёт вашего утверждения.\nПосмотреть и утвердить его можно в вашем личном портале, а если захотите что-то изменить, будем рады услышать.",
    "רצינו לעדכן שהסרט המלא ממתין לכם להורדה בפורטל האישי שלכם.\nכדי שנוכל להתחיל בעריכת הקליפ, נשמח שתבחרו שיר או שניים: שיר שקט ושיר קצבי 🎵": "Хотим сообщить, что полный фильм ждёт вас для скачивания в вашем личном портале.\nЧтобы мы могли начать монтаж клипа, просим вас выбрать одну-две песни: спокойную и ритмичную 🎵",
    "שליחת תזכורת ללקוח": "Отправить клиенту напоминание",
    "תזכורת לבחור את השירים בפורטל, עם הקישור לפורטל של האירוע.": "Напоминание выбрать песни в портале, со ссылкой на портал мероприятия.",
    "תזכורת לבחירת שירים ל{name}": "Напоминание о песнях для {name}",
    "הלקוח יפתח את הפורטל בקישור ויבחר שם את השירים לקליפ. אפשר לערוך את ההודעה לפני השליחה.": "Клиент откроет портал по ссылке и выберет там песни для клипа. Сообщение можно изменить перед отправкой.",
    "שפת ההודעה": "Язык сообщения",
    "הנוסח הזה נשלח ללקוחות שהשפה שלהם באירוע היא {lang}. ללקוחות בעברית נשלח הנוסח בעברית.":
      "Этот текст отправляется клиентам, у которых в мероприятии выбран язык {lang}. Клиенты на иврите получают текст на иврите.",
    "בהמשך להצעת המחיר ששלחנו לכם":
      "По поводу ценового предложения, которое мы вам отправили",
    "רצינו לעדכן שהצעת המחיר ששלחנו לכם עדיין בתוקף.\nנשמח לענות על כל שאלה ולתאם איתכם את הפרטים, כשיתאפשר לכם.":
      "Хотим сообщить, что ценовое предложение, которое мы вам отправили, всё ещё в силе.\nБудем рады ответить на любые вопросы и согласовать с вами детали, когда вам будет удобно.",
    "עיצוב האלבום שלכם מוכן לאישור 🎉\nבקישור אפשר לצפות בקובץ העיצוב, ונשמח לשמוע מה דעתכם.":
      "Дизайн вашего альбома готов к утверждению 🎉\nПо ссылке можно посмотреть файл дизайна, и будем рады узнать ваше мнение.",
    "קישור להצעת המחיר:": "Ссылка на предложение:",
    "יש ללחוץ על הקישור לצפייה ואישור הצעת המחיר.": "Нажмите на ссылку, чтобы посмотреть и подтвердить предложение.",
    "יש ללחוץ על הקישור לצפייה בהצעת המחיר.": "Нажмите на ссылку, чтобы посмотреть предложение.",
    "תיק העבודות שלי:": "Моё портфолио:",
    "לאחר האישור ממלאים כמה פרטים קצרים על האירוע וחותמים על החוזה, הכל באותו קישור.":
      "После подтверждения нужно заполнить несколько коротких деталей о мероприятии и подписать договор — всё по той же ссылке.",
    "הגלריה מהאירוע שלכם מוכנה לצפייה 📸\nאפשר ליהנות מהתמונות, לבחור את האהובות עליכם, להוריד ולשתף.":
      "Галерея с вашего мероприятия готова к просмотру 📸\nМожно наслаждаться фотографиями, выбрать любимые, скачивать и делиться.",
    "היה אירוע מעולה, תודה על הזכות לצלם לכם. שנפגש רק בשמחות 🙏🏼\nאפשר להוריד את התמונות ולשתף, ולא לשכוח לתייג.":
      "Это было замечательное мероприятие, спасибо, что доверили нам его снимать. Пусть впереди будут только радостные события 🙏🏼\nФотографии можно скачивать и делиться ими, и не забудьте отметить нас.",
    "הגלריה זמינה למשך {period}.":
      "Галерея доступна {period}.",
    "רצינו לעדכן שנוספו לגלריה שלכם {count} תמונות חדשות 📸":
      "Хотим сообщить, что в вашу галерею добавлены новые фотографии: {count} 📸",
    "האלבום שלכם מוכן להורדה בפורמט {format}.":
      "Ваш альбом готов к скачиванию в формате {format}.",
    "קבצי האלבום שלכם מוכנים להורדה.":
      "Файлы вашего альбома готовы к скачиванию.",
  },
};

export default dict;
