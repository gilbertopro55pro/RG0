import type { AreaDict } from "@/i18n/types";

// Area "magnetApproval" (see src/i18n/dict/index.ts): magnet frames, stage 3 — the client approves
// a frame in the portal (PortalMagnetFrames), the photographer's status, sending and email
// (MagnetApprovalChip, ClientApprovalBar, SendForApprovalSheet, MagnetFramesList,
// api/portal/[token]/magnet-frames/[id]).
const dict: AreaDict = {
  en: {
    // Status (photographer)
    "ממתין לאישור הלקוח": "Waiting for the client",
    "הלקוח אישר": "Approved by the client",
    "הערה מהלקוח": "Client comment",
    "שונה אחרי שהלקוח אישר": "Changed after approval",
    "שיניתם את המסגרת אחרי שהלקוח אישר. כדאי לשלוח לו אותה שוב לאישור.": "You changed the frame after the client approved it. Send it to them again for approval.",
    // Sending (photographer)
    "שליחה ללקוח לאישור": "Send to the client for approval",
    "שליחה שוב ללקוח": "Send to the client again",
    "הפסקת השיתוף": "Stop sharing",
    "שליחת עיצוב המגנטים ל{name}": "Send the magnet design to {name}",
    "הלקוח יראה את המסגרת בפורטל, ויוכל לאשר אותה או להשאיר הערה. אפשר לערוך את ההודעה לפני השליחה.":
      "The client will see the frame in their portal and can approve it or leave a comment. You can edit the message before sending.",
    "לא הצלחנו לטעון את פרטי הלקוח. נסו שוב": "Couldn't load the client's details. Try again",
    // Portal (client)
    "המגנטים לאירוע": "Your event's magnets",
    "זה עיצוב המגנטים לאירוע שלכם. אם הכל נראה טוב, אשרו אותו. רוצים לשנות משהו? כתבו הערה.":
      "This is the magnet design for your event. If everything looks good, approve it. Want to change something? Leave a comment.",
    "עיצוב {n}": "Design {n}",
    "לרוחב": "Landscape",
    "לאורך": "Portrait",
    "הגדלת המסגרת": "Enlarge the frame",
    "התמונה מהאירוע תופיע במקום המשבצות. לחיצה על מסגרת מגדילה אותה.": "Your event photo goes where the checkered area is. Tap a frame to enlarge it.",
    "אישור העיצוב": "Approve the design",
    "מאשרים...": "Approving...",
    "אישרתם את העיצוב ב-{date}": "You approved the design on {date}",
    "העיצוב עודכן אחרי שאישרתם אותו. אפשר לאשר אותו שוב.": "The design was updated after you approved it. You can approve it again.",
    "יש לי הערה": "I have a comment",
    "הערה נוספת": "Another comment",
    "רוצים לשנות משהו? כתבו הערה": "Want to change something? Leave a comment",
    "מה תרצו לשנות?": "What would you like to change?",
    "שליחת ההערה": "Send the comment",
    "ההערה שלכם נשלחה ב-{date}:": "Your comment was sent on {date}:",
    "נעדכן את העיצוב ונשלח לכם הודעה.": "We'll update the design and let you know.",
    // Email to the photographer
    "{client} אישרו את עיצוב המגנטים": "{client} approved the magnet design",
    "הערה על עיצוב המגנטים | {client}": "Comment on the magnet design | {client}",
    '{client} אישרו בפורטל את עיצוב המגנטים "{frame}".': '{client} approved the magnet design "{frame}" in the portal.',
    '{client} השאירו בפורטל הערה על עיצוב המגנטים "{frame}":': '{client} left a comment on the magnet design "{frame}" in the portal:',
    "לפתיחת המסגרת: {link}": "Open the frame: {link}",
  },
  ru: {
    // Status (photographer)
    "ממתין לאישור הלקוח": "Ждёт клиента",
    "הלקוח אישר": "Клиент утвердил",
    "הערה מהלקוח": "Комментарий клиента",
    "שונה אחרי שהלקוח אישר": "Изменено после утверждения",
    "שיניתם את המסגרת אחרי שהלקוח אישר. כדאי לשלוח לו אותה שוב לאישור.": "Вы изменили рамку после того, как клиент её утвердил. Отправьте её клиенту на утверждение ещё раз.",
    // Sending (photographer)
    "שליחה ללקוח לאישור": "Отправить клиенту на утверждение",
    "שליחה שוב ללקוח": "Отправить клиенту ещё раз",
    "הפסקת השיתוף": "Закрыть доступ",
    "שליחת עיצוב המגנטים ל{name}": "Отправить дизайн магнитов: {name}",
    "הלקוח יראה את המסגרת בפורטל, ויוכל לאשר אותה או להשאיר הערה. אפשר לערוך את ההודעה לפני השליחה.":
      "Клиент увидит рамку в личном кабинете и сможет утвердить её или оставить комментарий. Сообщение можно отредактировать перед отправкой.",
    "לא הצלחנו לטעון את פרטי הלקוח. נסו שוב": "Не удалось загрузить данные клиента. Попробуйте ещё раз",
    // Portal (client)
    "המגנטים לאירוע": "Магниты для вашего мероприятия",
    "זה עיצוב המגנטים לאירוע שלכם. אם הכל נראה טוב, אשרו אותו. רוצים לשנות משהו? כתבו הערה.":
      "Это дизайн магнитов для вашего мероприятия. Если всё нравится, утвердите его. Хотите что-то изменить? Оставьте комментарий.",
    "עיצוב {n}": "Дизайн {n}",
    "לרוחב": "Горизонтальная",
    "לאורך": "Вертикальная",
    "הגדלת המסגרת": "Увеличить рамку",
    "התמונה מהאירוע תופיע במקום המשבצות. לחיצה על מסגרת מגדילה אותה.": "Фото с мероприятия будет на месте клетчатого поля. Нажмите на рамку, чтобы увеличить её.",
    "אישור העיצוב": "Утвердить дизайн",
    "מאשרים...": "Утверждаем...",
    "אישרתם את העיצוב ב-{date}": "Вы утвердили дизайн {date}",
    "העיצוב עודכן אחרי שאישרתם אותו. אפשר לאשר אותו שוב.": "Дизайн изменился после вашего утверждения. Его можно утвердить ещё раз.",
    "יש לי הערה": "У меня есть комментарий",
    "הערה נוספת": "Ещё комментарий",
    "רוצים לשנות משהו? כתבו הערה": "Хотите что-то изменить? Оставьте комментарий",
    "מה תרצו לשנות?": "Что бы вы хотели изменить?",
    "שליחת ההערה": "Отправить комментарий",
    "ההערה שלכם נשלחה ב-{date}:": "Ваш комментарий отправлен {date}:",
    "נעדכן את העיצוב ונשלח לכם הודעה.": "Мы обновим дизайн и сообщим вам.",
    // Email to the photographer
    "{client} אישרו את עיצוב המגנטים": "{client}: дизайн магнитов утверждён",
    "הערה על עיצוב המגנטים | {client}": "Комментарий к дизайну магнитов | {client}",
    '{client} אישרו בפורטל את עיצוב המגנטים "{frame}".': "{client} утвердили в личном кабинете дизайн магнитов «{frame}».",
    '{client} השאירו בפורטל הערה על עיצוב המגנטים "{frame}":': "{client} оставили в личном кабинете комментарий к дизайну магнитов «{frame}»:",
    "לפתיחת המסגרת: {link}": "Открыть рамку: {link}",
  },
};

export default dict;
