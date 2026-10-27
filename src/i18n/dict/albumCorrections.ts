import type { AreaDict } from "@/i18n/types";

// Area "albumCorrections" (see src/i18n/dict/index.ts): the client's corrections on the album design,
// as the photographer gets them — the email and phone notification (api/gallery/[token]/album/
// corrections) and the corrections page (app/album-corrections/[id], AlbumCorrectionsView). The
// client's own side of the tool is in clientGallery.ts.
const dict: AreaDict = {
  en: {
    "יש תיקונים לביצוע באלבום {name}": "There are changes to make in the album: {name}",
    "עמודים עם תיקונים: {pages}": "Pages with changes: {pages}",
    "הכריכה": "the cover",
    "לחצו לצפייה בתיקונים": "Tap to see the changes",
    "{client} סימנו תיקונים בעיצוב האלבום.": "{client} marked changes on the album design.",
    "לצפייה בתיקונים:": "See the changes:",
    "האלבום": "The album",
    "תיקונים מהלקוח · {name}": "Changes from the client · {name}",
    "נשלחו ב-{date}": "Sent on {date}",
    "לעריכת האלבום": "Edit the album",
    "הלקוח שלח מאז תיקונים חדשים יותר.": "The client has sent newer changes since.",
    "העיצוב המעודכן כבר נשלח שוב ללקוח.": "The updated design was already sent to the client again.",
    "הלקוח אישר בינתיים את העיצוב.": "The client has since approved the design.",
    "הם גם שינו בעצמם את העיצוב בעמודים: {pages}.": "They also changed the design themselves on pages: {pages}.",
    "לפני האישור הם שינו בעצמם את העיצוב בעמודים: {pages}.": "Before approving, they changed the design themselves on pages: {pages}.",
  },
  ru: {
    "יש תיקונים לביצוע באלבום {name}": "Есть правки в альбоме: {name}",
    "עמודים עם תיקונים: {pages}": "Страницы с правками: {pages}",
    "הכריכה": "обложка",
    "לחצו לצפייה בתיקונים": "Нажмите, чтобы посмотреть правки",
    "{client} סימנו תיקונים בעיצוב האלבום.": "{client} отметили правки в дизайне альбома.",
    "לצפייה בתיקונים:": "Посмотреть правки:",
    "האלבום": "Альбом",
    "תיקונים מהלקוח · {name}": "Правки от клиента · {name}",
    "נשלחו ב-{date}": "Отправлены {date}",
    "לעריכת האלבום": "Редактировать альбом",
    "הלקוח שלח מאז תיקונים חדשים יותר.": "С тех пор клиент прислал более новые правки.",
    "העיצוב המעודכן כבר נשלח שוב ללקוח.": "Обновлённый дизайн уже снова отправлен клиенту.",
    "הלקוח אישר בינתיים את העיצוב.": "Клиент тем временем утвердил дизайн.",
    "הם גם שינו בעצמם את העיצוב בעמודים: {pages}.": "Они также сами изменили дизайн на страницах: {pages}.",
    "לפני האישור הם שינו בעצמם את העיצוב בעמודים: {pages}.": "Перед утверждением они сами изменили дизайн на страницах: {pages}.",
  },
};

export default dict;
