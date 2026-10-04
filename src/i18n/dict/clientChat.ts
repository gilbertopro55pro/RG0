import type { AreaDict } from "@/i18n/types";

// Area "clientChat" (UI languages phase 2, client-facing; see src/i18n/dict/index.ts).
// Hebrew source text → translation.
// The public intake chat (/chat/<key>): page chrome, the fallback form, the opening greeting, the
// assistant's fixed replies, and the API's error strings (translated on the page by their text).
const dict: AreaDict = {
  en: {
    // Page metadata (the studio's own title stays as written)
    "בדיקת תאריך ומענה מיידי": "Date check and instant reply",
    "כתבו עכשיו ותקבלו תשובה תוך שניות: בודקים אם התאריך פנוי ואוספים את פרטי האירוע להצעה אישית.":
      "Write now and get an answer within seconds: we check if your date is free and collect your event details for a personal quote.",
    "בדיקת תאריך בצ'אט, תשובה תוך שניות": "Check your date in the chat, answers within seconds",
    // Chat
    "היי 👋 כאן העוזר של {studio}. מה חוגגים, ומתי?": "Hi 👋 This is {studio}'s assistant. What are you celebrating, and when?",
    "טופס פנייה": "Inquiry form",
    "עונה מיד": "Replies instantly",
    "מקליד": "Typing",
    "הפרטים הועברו ל{studio}, תשובה תוך {hours} שעות": "Your details were sent to {studio}. You'll hear back within {hours} hours",
    "הודעה": "Message",
    "כתבו הודעה…": "Write a message…",
    "ההודעה לא נשלחה. נסו שוב": "The message wasn't sent. Please try again",
    "אין חיבור. נסו שוב": "No connection. Please try again",
    // Fallback inquiry form
    "הפנייה נשלחה": "Your inquiry was sent",
    "{studio} יחזור אליך בהקדם.": "{studio} will get back to you soon.",
    "השאירו פרטים ו{studio} יחזור אליכם עם כל המידע.": "Leave your details and {studio} will get back to you with all the information.",
    "עוד פרטים": "More details",
    "חתונה, בר מצווה…": "Wedding, bar mitzvah…",
    "שולח…": "Sending…",
    "שליחת פנייה": "Send inquiry",
    "השליחה נכשלה. נסו שוב": "Sending failed. Please try again",
    // The assistant's fixed replies (lib/intakeAssistant.ts, api/intake-chat)
    "סליחה, משהו השתבש אצלי. אפשר לנסות שוב, או להשאיר שם וטלפון ו{studio} יחזור אליכם.":
      "Sorry, something went wrong on my side. You can try again, or leave your name and phone and {studio} will get back to you.",
    "את זה {studio} יענה לכם ישירות. נמשיך עם פרטי האירוע?": "{studio} will answer that for you directly. Shall we continue with the event details?",
    "קיבלתי את כל מה שכתבתם, ו{studio} יחזור אליכם בהקדם.": "I've got everything you wrote, and {studio} will get back to you soon.",
    // API errors
    "יותר מדי הודעות. נסו שוב בעוד כמה דקות": "Too many messages. Please try again in a few minutes",
    "הודעה ריקה": "Empty message",
    "ההודעה ארוכה מדי": "The message is too long",
    "יותר מדי שיחות חדשות מהמכשיר הזה היום": "Too many new conversations from this device today",
    "שגיאה בפתיחת השיחה": "Couldn't start the conversation",
    "יותר מדי פניות. נסו שוב מאוחר יותר": "Too many inquiries. Please try again later",
    "צריך שם וטלפון": "Name and phone are required",
    "שגיאה בשליחת הפנייה": "Couldn't send the inquiry",
  },
  ru: {
    // Page metadata (the studio's own title stays as written)
    "בדיקת תאריך ומענה מיידי": "Проверка даты и мгновенный ответ",
    "כתבו עכשיו ותקבלו תשובה תוך שניות: בודקים אם התאריך פנוי ואוספים את פרטי האירוע להצעה אישית.":
      "Напишите сейчас и получите ответ за секунды: проверим, свободна ли дата, и соберём детали мероприятия для персонального предложения.",
    "בדיקת תאריך בצ'אט, תשובה תוך שניות": "Проверка даты в чате, ответ за секунды",
    // Chat
    "היי 👋 כאן העוזר של {studio}. מה חוגגים, ומתי?": "Здравствуйте 👋 Это помощник {studio}. Что празднуете и когда?",
    "טופס פנייה": "Форма заявки",
    "עונה מיד": "Отвечает сразу",
    "מקליד": "Печатает",
    "הפרטים הועברו ל{studio}, תשובה תוך {hours} שעות": "Данные переданы {studio}, ответ в течение {hours} ч.",
    "הודעה": "Сообщение",
    "כתבו הודעה…": "Напишите сообщение…",
    "ההודעה לא נשלחה. נסו שוב": "Сообщение не отправлено. Попробуйте ещё раз",
    "אין חיבור. נסו שוב": "Нет соединения. Попробуйте ещё раз",
    // Fallback inquiry form
    "הפנייה נשלחה": "Заявка отправлена",
    "{studio} יחזור אליך בהקדם.": "{studio} скоро свяжется с вами.",
    "השאירו פרטים ו{studio} יחזור אליכם עם כל המידע.": "Оставьте свои данные, и {studio} свяжется с вами со всей информацией.",
    "עוד פרטים": "Дополнительные детали",
    "חתונה, בר מצווה…": "Свадьба, бар-мицва…",
    "שולח…": "Отправка…",
    "שליחת פנייה": "Отправить заявку",
    "השליחה נכשלה. נסו שוב": "Не удалось отправить. Попробуйте ещё раз",
    // The assistant's fixed replies (lib/intakeAssistant.ts, api/intake-chat)
    "סליחה, משהו השתבש אצלי. אפשר לנסות שוב, או להשאיר שם וטלפון ו{studio} יחזור אליכם.":
      "Извините, у меня что-то пошло не так. Попробуйте ещё раз или оставьте имя и телефон, и {studio} свяжется с вами.",
    "את זה {studio} יענה לכם ישירות. נמשיך עם פרטי האירוע?": "На это {studio} ответит вам лично. Продолжим с деталями мероприятия?",
    "קיבלתי את כל מה שכתבתם, ו{studio} יחזור אליכם בהקדם.": "Я получил всё, что вы написали, и {studio} скоро свяжется с вами.",
    // API errors
    "יותר מדי הודעות. נסו שוב בעוד כמה דקות": "Слишком много сообщений. Попробуйте через несколько минут",
    "הודעה ריקה": "Пустое сообщение",
    "ההודעה ארוכה מדי": "Сообщение слишком длинное",
    "יותר מדי שיחות חדשות מהמכשיר הזה היום": "Слишком много новых разговоров с этого устройства сегодня",
    "שגיאה בפתיחת השיחה": "Не удалось начать разговор",
    "יותר מדי פניות. נסו שוב מאוחר יותר": "Слишком много заявок. Попробуйте позже",
    "צריך שם וטלפון": "Нужны имя и телефон",
    "שגיאה בשליחת הפנייה": "Не удалось отправить заявку",
  },
};

export default dict;
