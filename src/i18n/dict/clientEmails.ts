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
    // WhatsApp texts prepared by the scheduled-messages confirm routes.
    "שלום {name},\nתודה שבחרתם בנו! נשמח מאוד אם תוכלו להשאיר לנו כמה מילים וביקורת 🙏\n\n{link}":
      "Hello {name},\nThank you for choosing us! We'd really appreciate it if you could leave us a few words and a review 🙏\n\n{link}",
    "שלום {name},\nשלחתי אלייך הצעת מחיר ואשמח לשמוע אם יש שאלות או שתרצו לתאם את תאריך האירוע.":
      "Hello {name},\nI sent you a price quote and would love to hear if you have any questions, or if you'd like to book the date of your event.",
    // Album design ready (events/[id]/album-design).
    // Gallery share messages (GalleryShareModal / GalleryManageView).
    "{name} - צילום אירועים": "{name} - Event Photography",
    "גלריה מהאירוע": "Your event gallery",
  },
  ru: {
    'תזכורת: הגלריה "{title}" תפוג בקרוב': "Напоминание: срок действия галереи «{title}» скоро истекает",
    'שלום,\n\nהגלריה "{title}"{label} תהיה זמינה לצפייה והורדה עד {date}.\nלאחר מכן היא תוסר ולא תהיה נגישה יותר. מומלץ להוריד את התמונות שרציתם לפני כן.':
      "Здравствуйте!\n\nГалерея «{title}»{label} будет доступна для просмотра и скачивания до {date}.\nПосле этого она будет удалена и станет недоступна, поэтому рекомендуем заранее скачать фотографии, которые вы хотите сохранить.",
    "שלום {name},\nתודה שבחרתם בנו! נשמח מאוד אם תוכלו להשאיר לנו כמה מילים וביקורת 🙏\n\n{link}":
      "Здравствуйте, {name}!\nСпасибо, что выбрали нас! Будем очень благодарны, если вы оставите нам пару слов и отзыв 🙏\n\n{link}",
    "שלום {name},\nשלחתי אלייך הצעת מחיר ואשמח לשמוע אם יש שאלות או שתרצו לתאם את תאריך האירוע.":
      "Здравствуйте, {name}!\nНедавно мы отправили вам ценовое предложение. Будем рады ответить на ваши вопросы или согласовать дату мероприятия.",
    "{name} - צילום אירועים": "{name} — фотосъёмка мероприятий",
    "גלריה מהאירוע": "Галерея с мероприятия",
  },
};

export default dict;
