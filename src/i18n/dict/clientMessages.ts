import type { AreaDict } from "@/i18n/types";

// Area "clientMessages" (UI languages phase 3: text sent to the client; see src/i18n/dict/index.ts).
// Hebrew source text → translation. The client update templates themselves (long, multi-line) are
// typed constants next to the Hebrew ones in src/lib/stages.ts; this file holds the settings chrome.
const dict: AreaDict = {
  en: {
    "היי {name} 😊\nרק מזכירים שעיצוב האלבום מחכה לאישור שלכם. אפשר לצפות ולאשר בפורטל האישי:\n{link}\n\nרוצים לשנות משהו? פשוט כתבו לי כאן.": "Hi {name} 😊\nJust a reminder that your album design is waiting for your approval. You can view and approve it in your personal portal:\n{link}\n\nWant to change something? Just message me here.",
    "היי {name} 😊\nרק מזכירים שהסרט המלא מחכה לכם להורדה בפורטל האישי.\nוגם, אשמח שתבחרו שיר או שניים לקליפ: שיר שקט ושיר קצבי 🎵\n{link}": "Hi {name} 😊\nJust a reminder that your full film is waiting for you to download in your personal portal.\nAlso, I'd love for you to pick one or two songs for the clip: a calm one and an upbeat one 🎵\n{link}",
    "שפת ההודעה": "Message language",
    "הנוסח הזה נשלח ללקוחות שהשפה שלהם באירוע היא {lang}. ללקוחות בעברית נשלח הנוסח בעברית.":
      "This version is sent to clients whose event language is {lang}. Hebrew-speaking clients get the Hebrew version.",
  },
  ru: {
    "היי {name} 😊\nרק מזכירים שעיצוב האלבום מחכה לאישור שלכם. אפשר לצפות ולאשר בפורטל האישי:\n{link}\n\nרוצים לשנות משהו? פשוט כתבו לי כאן.": "Здравствуйте, {name} 😊\nНапоминаем, что дизайн альбома ждёт вашего утверждения. Посмотреть и утвердить его можно в личном портале:\n{link}\n\nХотите что-то изменить? Просто напишите мне здесь.",
    "היי {name} 😊\nרק מזכירים שהסרט המלא מחכה לכם להורדה בפורטל האישי.\nוגם, אשמח שתבחרו שיר או שניים לקליפ: שיר שקט ושיר קצבי 🎵\n{link}": "Здравствуйте, {name} 😊\nНапоминаем, что полный фильм ждёт вас для скачивания в личном портале.\nИ ещё: выберите, пожалуйста, одну-две песни для клипа — спокойную и ритмичную 🎵\n{link}",
    "שפת ההודעה": "Язык сообщения",
    "הנוסח הזה נשלח ללקוחות שהשפה שלהם באירוע היא {lang}. ללקוחות בעברית נשלח הנוסח בעברית.":
      "Этот текст отправляется клиентам, у которых в мероприятии выбран язык {lang}. Клиенты на иврите получают текст на иврите.",
  },
};

export default dict;
