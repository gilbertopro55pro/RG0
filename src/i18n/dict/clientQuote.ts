import type { AreaDict } from "@/i18n/types";

// Area "clientQuote" (UI languages phase 2, client-facing; see src/i18n/dict/index.ts).
// The client's quote page (QuoteApprovalFlow), the contract signing page and form
// (ContractSignForm, SignaturePad), and the error strings their API routes return.
// Hebrew source text → translation.
const dict: AreaDict = {
  en: {
    // The WhatsApp card for a receipt's short link (app/r/[token])
    "קבלה על תשלום": "Payment receipt",
    "לצפייה בקבלה ולהורדה שלה": "View and download your receipt",

    // Page states
    "הצעת המחיר לא נמצאה.": "The price quote was not found.",
    "חוזה הזמנת צילום": "Photography booking contract",

    // API errors (approve / submit-questionnaire / contract sign), translated client-side
    "הצעת המחיר לא נמצאה": "The price quote was not found",
    "יש לאשר קודם את הצעת המחיר": "Please approve the price quote first",
    "יש להקליד שם מלא": "Please type your full name",
    "יש לחתום בשדה החתימה": "Please sign in the signature box",
    "החוזה לא נמצא": "The contract was not found",
    "החוזה כבר נחתם": "The contract has already been signed",
    "האישור נכשל": "The approval failed",
    "יש למלא שם מלא ותאריך אירוע": "Please fill in your full name and the event date",
    "שליחת הפרטים נכשלה": "Sending the details failed",

    // Quote
    "{amount} ש״ח": "₪{amount}",
    "עוסק פטור {id}": "VAT-exempt {id}",
    "עוסק מורשה {id}": "VAT-registered {id}",
    "הצעת מחיר": "Price quote",
    "לכבוד": "To",
    "תאריך": "Date",
    "מיקום": "Location",
    "שעות העבודה": "Working hours",
    "פירוט ההצעה": "Quote details",
    "סה״כ לפני מע״מ": "Total before VAT",
    "מע״מ 18%": "VAT 18%",
    "לתשלום": "Total to pay",
    "לתשלום, כולל מע״מ": "Total to pay, incl. VAT",
    "אישור ההצעה": "Approve the quote",
    "שאלות לפני שמאשרים?": "Questions before approving?",

    // Steps
    "שלבים": "Steps",
    "פרטי האירוע": "Event details",
    "חתימה": "Signature",

    // Questionnaire
    "ההצעה אושרה, תודה!": "The quote is approved, thank you!",
    "עוד רגע אחד: נבדוק יחד את פרטי האירוע, והוא ייכנס ליומן של {name}.":
      "Just one more moment: let's check the event details together, and it will go into {name}'s calendar.",
    "שעות הצילום": "Shooting hours",
    "אירוע ערב": "evening event",
    "אירוע בוקר": "morning event",
    "אפשר לשנות לפי מה שמתאים לכם.": "You can change them to whatever suits you.",
    "תחילת האירוע": "Event start",
    "צילומי משפחה:": "Family photos:",
    "(30 דקות לפני תחילת האירוע)": "(30 minutes before the event starts)",
    "הערות נוספות (אופציונלי)": "Additional notes (optional)",
    "שליחת הפרטים": "Send the details",
    "שעה נוספת": "1 extra hour",
    "{n} שעות נוספות": "{n} extra hours",
    "אירוע ערב הוא עד {n} שעות צילום. מעבר לזה יש תשלום נוסף של {price} ₪ לשעה לכל צלם ({extra}).":
      "An evening event includes up to {n} shooting hours. Beyond that there is an extra charge of ₪{price} per hour per photographer ({extra}).",
    "החבילות הן ל-{n} שעות צילום. מסגרת ארוכה יותר כרוכה בתשלום נוסף של {price} ₪ לשעה לכל צלם ({extra}).":
      "The packages are for {n} shooting hours. A longer time frame has an extra charge of ₪{price} per hour per photographer ({extra}).",

    // Contract step and done
    "שלב אחרון: חתימה על החוזה": "Last step: signing the contract",
    "האירוע נכנס ליומן של {name}. נשאר רק לקרוא את החוזה ולחתום עליו.":
      "The event is in {name}'s calendar. All that's left is to read the contract and sign it.",
    "תודה, האירוע נקבע!": "Thank you, the event is booked!",
    "{name} קיבל את הפרטים, והאירוע נכנס ליומן.": "{name} has received the details, and the event is in the calendar.",
    "החוזה נחתם.": "The contract is signed.",
    "מעבר לעמוד האירוע שלכם": "Go to your event page",

    // Contract form
    "לפירוט המלא": "Full details",
    "החוזה נחתם על ידי {name} בתאריך {date}": "The contract was signed by {name} on {date}",
    "חתימה (חתמו עם האצבע או העכבר)": "Signature (sign with your finger or the mouse)",
    "קראתי את תנאי ההסכם ואני מסכים/ה לתוכנו": "I have read the terms of the agreement and I agree to them",
    "חותם...": "Signing...",
    "חתימה על החוזה": "Sign the contract",
    "חתמו כאן עם האצבע או העכבר": "Sign here with your finger or the mouse",
    "נקה וחתום מחדש": "Clear and sign again",
  },
  ru: {
    // The WhatsApp card for a receipt's short link (app/r/[token])
    "קבלה על תשלום": "Квитанция об оплате",
    "לצפייה בקבלה ולהורדה שלה": "Просмотр и скачивание квитанции",

    // Page states
    "הצעת המחיר לא נמצאה.": "Ценовое предложение не найдено.",
    "חוזה הזמנת צילום": "Договор на фотосъёмку",

    // API errors
    "הצעת המחיר לא נמצאה": "Ценовое предложение не найдено",
    "יש לאשר קודם את הצעת המחיר": "Сначала подтвердите ценовое предложение",
    "יש להקליד שם מלא": "Введите полное имя",
    "יש לחתום בשדה החתימה": "Поставьте подпись в поле для подписи",
    "החוזה לא נמצא": "Договор не найден",
    "החוזה כבר נחתם": "Договор уже подписан",
    "האישור נכשל": "Не удалось подтвердить",
    "יש למלא שם מלא ותאריך אירוע": "Укажите полное имя и дату мероприятия",
    "שליחת הפרטים נכשלה": "Не удалось отправить данные",

    // Quote
    "{amount} ש״ח": "{amount} ₪",
    "עוסק פטור {id}": "Освобождён от НДС {id}",
    "עוסק מורשה {id}": "Плательщик НДС {id}",
    "הצעת מחיר": "Ценовое предложение",
    "לכבוד": "Для",
    "תאריך": "Дата",
    "מיקום": "Место",
    "שעות העבודה": "Часы работы",
    "פירוט ההצעה": "Состав предложения",
    "סה״כ לפני מע״מ": "Итого без НДС",
    "מע״מ 18%": "НДС 18%",
    "לתשלום": "К оплате",
    "לתשלום, כולל מע״מ": "К оплате, включая НДС",
    "אישור ההצעה": "Подтвердить предложение",
    "שאלות לפני שמאשרים?": "Есть вопросы перед подтверждением?",

    // Steps
    "שלבים": "Этапы",
    "פרטי האירוע": "Детали мероприятия",
    "חתימה": "Подпись",

    // Questionnaire
    "ההצעה אושרה, תודה!": "Предложение подтверждено, спасибо!",
    "עוד רגע אחד: נבדוק יחד את פרטי האירוע, והוא ייכנס ליומן של {name}.":
      "Ещё минутка: давайте вместе проверим детали мероприятия, и оно попадёт в календарь {name}.",
    "שעות הצילום": "Часы съёмки",
    "אירוע ערב": "вечернее мероприятие",
    "אירוע בוקר": "утреннее мероприятие",
    "אפשר לשנות לפי מה שמתאים לכם.": "Можно изменить, как вам удобно.",
    "תחילת האירוע": "Начало мероприятия",
    "צילומי משפחה:": "Семейные фото:",
    "(30 דקות לפני תחילת האירוע)": "(за 30 минут до начала мероприятия)",
    "הערות נוספות (אופציונלי)": "Дополнительные пожелания (необязательно)",
    "שליחת הפרטים": "Отправить данные",
    "שעה נוספת": "дополнительный час: 1",
    "{n} שעות נוספות": "дополнительных часов: {n}",
    "אירוע ערב הוא עד {n} שעות צילום. מעבר לזה יש תשלום נוסף של {price} ₪ לשעה לכל צלם ({extra}).":
      "Вечернее мероприятие включает до {n} часов съёмки. Сверх этого взимается доплата {price} ₪ в час за каждого фотографа ({extra}).",
    "החבילות הן ל-{n} שעות צילום. מסגרת ארוכה יותר כרוכה בתשלום נוסף של {price} ₪ לשעה לכל צלם ({extra}).":
      "Пакеты рассчитаны на {n} часа съёмки. За более длительное время взимается доплата {price} ₪ в час за каждого фотографа ({extra}).",

    // Contract step and done
    "שלב אחרון: חתימה על החוזה": "Последний шаг: подписание договора",
    "האירוע נכנס ליומן של {name}. נשאר רק לקרוא את החוזה ולחתום עליו.":
      "Мероприятие добавлено в календарь {name}. Осталось только прочитать договор и подписать его.",
    "תודה, האירוע נקבע!": "Спасибо, мероприятие забронировано!",
    "{name} קיבל את הפרטים, והאירוע נכנס ליומן.": "{name} получил(а) данные, и мероприятие добавлено в календарь.",
    "החוזה נחתם.": "Договор подписан.",
    "מעבר לעמוד האירוע שלכם": "Перейти на страницу вашего мероприятия",

    // Contract form
    "לפירוט המלא": "Полные условия",
    "החוזה נחתם על ידי {name} בתאריך {date}": "Договор подписан: {name}, {date}",
    "חתימה (חתמו עם האצבע או העכבר)": "Подпись (распишитесь пальцем или мышью)",
    "קראתי את תנאי ההסכם ואני מסכים/ה לתוכנו": "Я прочитал(а) условия договора и согласен(на) с ними",
    "חותם...": "Подписание...",
    "חתימה על החוזה": "Подписать договор",
    "חתמו כאן עם האצבע או העכבר": "Распишитесь здесь пальцем или мышью",
    "נקה וחתום מחדש": "Очистить и подписать заново",
  },
};

export default dict;
