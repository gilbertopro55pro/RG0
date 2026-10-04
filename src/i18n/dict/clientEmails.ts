import type { AreaDict } from "@/i18n/types";

// Area "clientEmails" (UI languages phase 3: text sent to the client; see src/i18n/dict/index.ts).
// Hebrew source text → translation. Server-sent emails and the WhatsApp texts the server prepares
// for the photographer to send (payment reminder, review request, lead follow-up, album design),
// plus the gallery share messages. The Hebrew keys are exactly the Hebrew output, placeholders
// included, so Hebrew stays byte-for-byte identical.
const dict: AreaDict = {
  en: {
    // Gallery expiry reminder email (cron/gallery-lifecycle).
    'תזכורת: הגלריה "{title}" תפוג בקרוב': 'Reminder: your gallery "{title}" expires soon',
    'שלום,\n\nהגלריה "{title}"{label} תהיה זמינה לצפייה והורדה עד {date}.\nלאחר מכן היא תוסר ולא תהיה נגישה יותר. מומלץ להוריד את התמונות שרציתם לפני כן.':
      'Hello,\n\nThe gallery "{title}"{label} will be available to view and download until {date}.\nAfter that it will be removed and will no longer be accessible, so we recommend downloading the photos you want before then.',
    // Quote follow-up email to the lead (cron/send-scheduled-messages).
    "רק מזכירים את ההצעה שלנו": "Just a reminder about our quote",
    "שלום {name},\n\nרצינו להזכיר שההצעת מחיר ששלחנו לכם עדיין פתוחה, ונשמח לעמוד לרשותכם לכל שאלה או לתיאום.":
      "Hello {name},\n\nWe just wanted to remind you that the price quote we sent you is still open. We'd be happy to help with any questions or to set things up.",
    // WhatsApp texts prepared by the scheduled-messages confirm routes.
    "שלום {name},\nתזכורת ידידותית, נשארה יתרה של ₪{amount} לתשלום עבור האירוע שלכם.\n\nלצפייה בפרטי התשלום ניתן להיכנס לפורטל האישי שלכם:\n{link}":
      "Hello {name},\nJust a friendly reminder that a balance of ₪{amount} is still due for your event.\n\nYou can see the payment details in your personal portal:\n{link}",
    "שלום {name},\nתודה שבחרתם בנו! נשמח מאוד אם תוכלו להשאיר לנו כמה מילים וביקורת 🙏\n\n{link}":
      "Hello {name},\nThank you for choosing us! We'd really appreciate it if you could leave us a few words and a review 🙏\n\n{link}",
    "שלום {name},\nשלחתי אלייך הצעת מחיר ואשמח לשמוע אם יש שאלות או שתרצו לתאם את תאריך האירוע.":
      "Hello {name},\nI sent you a price quote and would love to hear if you have any questions, or if you'd like to book the date of your event.",
    // Album design ready (events/[id]/album-design).
    "שלום {name},\nעיצוב האלבום מוכן לאישור ✓\n{url}": "Hello {name},\nYour album design is ready for your approval ✓\n{url}",
    // Gallery share messages (GalleryShareModal / GalleryManageView).
    "היי,\nהיה אירוע מעולה, תודה על הזכות לצלם לכם, שנפגש רק בשמחות 🙏🏼😊\nקישור לגלריית התמונות: {url}\n\n{expiry}ניתן להוריד את התמונות, לשתף ולא לשכוח לתייג 😁\n{name} - צילום אירועים":
      "Hi,\nIt was a wonderful event, thank you for the privilege of photographing it for you. Wishing you only happy occasions 🙏🏼😊\nLink to your photo gallery: {url}\n\n{expiry}You can download the photos and share them, and don't forget to tag us 😁\n{name} - Event Photography",
    "{name}, הגלריה מהאירוע שלכם מוכנה לצפייה ובחירת תמונות 📸\nקישור לגלריית התמונות: {url}\n\n{expiry}אפשר להוריד ולשתף את התמונות בכל שלב.":
      "{name}, your event gallery is ready for you to view and choose photos 📸\nLink to your photo gallery: {url}\n\n{expiry}You can download and share the photos at any time.",
    "הגלריה מהאירוע שלכם מוכנה לצפייה ובחירת תמונות 📸\nקישור לגלריית התמונות: {url}\n\n{expiry}אפשר להוריד ולשתף את התמונות בכל שלב.":
      "Your event gallery is ready for you to view and choose photos 📸\nLink to your photo gallery: {url}\n\n{expiry}You can download and share the photos at any time.",
    "הקישור בתוקף ל-{period}, ": "The link is valid for {period}. ",
    "{name} - צילום אירועים": "{name} - Event Photography",
    "{name}, עודכנו {count} תמונות חדשות בגלריה שלכם 📸\n{url}": "{name}, new photos were added to your gallery: {count} 📸\n{url}",
    "עודכנו {count} תמונות חדשות בגלריה שלכם 📸\n{url}": "New photos were added to your gallery: {count} 📸\n{url}",
    "גלריה מהאירוע": "Your event gallery",
    "{label} מוכן להורדה:\n{url}": "Your album ({label}) is ready to download:\n{url}",
    "הקבצים מוכנים להורדה:\n{url}": "Your files are ready to download:\n{url}",
  },
  ru: {
    'תזכורת: הגלריה "{title}" תפוג בקרוב': "Напоминание: срок действия галереи «{title}» скоро истекает",
    'שלום,\n\nהגלריה "{title}"{label} תהיה זמינה לצפייה והורדה עד {date}.\nלאחר מכן היא תוסר ולא תהיה נגישה יותר. מומלץ להוריד את התמונות שרציתם לפני כן.':
      "Здравствуйте!\n\nГалерея «{title}»{label} будет доступна для просмотра и скачивания до {date}.\nПосле этого она будет удалена и станет недоступна, поэтому рекомендуем заранее скачать фотографии, которые вы хотите сохранить.",
    "רק מזכירים את ההצעה שלנו": "Напоминаем о нашем предложении",
    "שלום {name},\n\nרצינו להזכיר שההצעת מחיר ששלחנו לכם עדיין פתוחה, ונשמח לעמוד לרשותכם לכל שאלה או לתיאום.":
      "Здравствуйте, {name}!\n\nХотим напомнить, что ценовое предложение, которое мы вам отправили, всё ещё в силе. Будем рады ответить на любые вопросы или обо всём договориться.",
    "שלום {name},\nתזכורת ידידותית, נשארה יתרה של ₪{amount} לתשלום עבור האירוע שלכם.\n\nלצפייה בפרטי התשלום ניתן להיכנס לפורטל האישי שלכם:\n{link}":
      "Здравствуйте, {name}!\nДружеское напоминание: за ваше мероприятие осталось оплатить ₪{amount}.\n\nПодробности оплаты можно посмотреть в вашем личном кабинете:\n{link}",
    "שלום {name},\nתודה שבחרתם בנו! נשמח מאוד אם תוכלו להשאיר לנו כמה מילים וביקורת 🙏\n\n{link}":
      "Здравствуйте, {name}!\nСпасибо, что выбрали нас! Будем очень благодарны, если вы оставите нам пару слов и отзыв 🙏\n\n{link}",
    "שלום {name},\nשלחתי אלייך הצעת מחיר ואשמח לשמוע אם יש שאלות או שתרצו לתאם את תאריך האירוע.":
      "Здравствуйте, {name}!\nНедавно мы отправили вам ценовое предложение. Будем рады ответить на ваши вопросы или согласовать дату мероприятия.",
    "שלום {name},\nעיצוב האלבום מוכן לאישור ✓\n{url}": "Здравствуйте, {name}!\nДизайн вашего альбома готов и ждёт вашего утверждения ✓\n{url}",
    "היי,\nהיה אירוע מעולה, תודה על הזכות לצלם לכם, שנפגש רק בשמחות 🙏🏼😊\nקישור לגלריית התמונות: {url}\n\n{expiry}ניתן להוריד את התמונות, לשתף ולא לשכוח לתייג 😁\n{name} - צילום אירועים":
      "Привет!\nЭто было замечательное мероприятие, спасибо, что доверили нам его снимать. Пусть впереди будут только радостные поводы 🙏🏼😊\nСсылка на галерею с фотографиями: {url}\n\n{expiry}Фотографии можно скачивать и делиться ими, и не забудьте нас отметить 😁\n{name} — фотосъёмка мероприятий",
    "{name}, הגלריה מהאירוע שלכם מוכנה לצפייה ובחירת תמונות 📸\nקישור לגלריית התמונות: {url}\n\n{expiry}אפשר להוריד ולשתף את התמונות בכל שלב.":
      "{name}, галерея с вашего мероприятия готова: можно смотреть и выбирать фотографии 📸\nСсылка на галерею с фотографиями: {url}\n\n{expiry}Фотографии можно скачивать и делиться ими в любой момент.",
    "הגלריה מהאירוע שלכם מוכנה לצפייה ובחירת תמונות 📸\nקישור לגלריית התמונות: {url}\n\n{expiry}אפשר להוריד ולשתף את התמונות בכל שלב.":
      "Галерея с вашего мероприятия готова: можно смотреть и выбирать фотографии 📸\nСсылка на галерею с фотографиями: {url}\n\n{expiry}Фотографии можно скачивать и делиться ими в любой момент.",
    "הקישור בתוקף ל-{period}, ": "Ссылка действует {period}. ",
    "{name} - צילום אירועים": "{name} — фотосъёмка мероприятий",
    "{name}, עודכנו {count} תמונות חדשות בגלריה שלכם 📸\n{url}": "{name}, в вашей галерее появились новые фотографии: {count} 📸\n{url}",
    "עודכנו {count} תמונות חדשות בגלריה שלכם 📸\n{url}": "В вашей галерее появились новые фотографии: {count} 📸\n{url}",
    "גלריה מהאירוע": "Галерея с мероприятия",
    "{label} מוכן להורדה:\n{url}": "Ваш альбом ({label}) готов к скачиванию:\n{url}",
    "הקבצים מוכנים להורדה:\n{url}": "Ваши файлы готовы к скачиванию:\n{url}",
  },
};

export default dict;
