import type { AreaDict } from "@/i18n/types";

// Area "clientQuoteSend" (UI languages phase 3: text sent to the client; see src/i18n/dict/index.ts).
// The price quote as the client gets it: the WhatsApp link message (lib/quoteDefaults.ts), the quote
// PDF (lib/priceQuotePdf.ts), the send route's email/WhatsApp text, and the note above the Hebrew
// contract terms (ContractSignForm). Labels shared with the quote page live in clientQuote.ts.
// Hebrew source text → translation.
const dict: AreaDict = {
  en: {
    // WhatsApp link message
    "הצעת מחיר עבור {name}": "Price quote for {name}",
    "קישור להצעת המחיר: {url}": "Your price quote: {url}",
    "יש ללחוץ על הקישור לצפייה ואישור הצעת המחיר.": "Tap the link to view and approve the quote.",
    "אחרי האישור ממלאים כמה פרטים קצרים על האירוע וחותמים על החוזה, הכל באותו קישור.":
      "After approving, you'll fill in a few short event details and sign the contract, all on the same link.",

    // PDF
    "לתשלום (עוסק פטור)": "Total to pay (VAT-exempt)",
    "הצעת-מחיר.pdf": "Price-quote.pdf",

    // Send route (email / WhatsApp with the PDF link)
    "הצעת מחיר מ{name}": "Price quote from {name}",
    "שלום,\n\nמצורפת הצעת מחיר מ{name}.\n\nבברכה,\n{name}":
      "Hello,\n\nPlease find attached a price quote from {name}.\n\nBest regards,\n{name}",
    "לכבוד: {name}": "For: {name}",

    // Contract page
    "נוסח ההסכם כתוב בעברית, כפי שהצלם ניסח אותו. לשאלות על התנאים אפשר לפנות ישירות לצלם.":
      "The agreement below is in Hebrew, as written by the photographer. If you have any questions about the terms, please contact the photographer directly.",
  },
  ru: {
    // WhatsApp link message
    "הצעת מחיר עבור {name}": "Ценовое предложение для {name}",
    "קישור להצעת המחיר: {url}": "Ваше ценовое предложение: {url}",
    "יש ללחוץ על הקישור לצפייה ואישור הצעת המחיר.": "Откройте ссылку, чтобы посмотреть и подтвердить предложение.",
    "אחרי האישור ממלאים כמה פרטים קצרים על האירוע וחותמים על החוזה, הכל באותו קישור.":
      "После подтверждения вы укажете пару деталей о мероприятии и подпишете договор — всё по той же ссылке.",

    // PDF
    "לתשלום (עוסק פטור)": "К оплате (без НДС)",
    "הצעת-מחיר.pdf": "Ценовое-предложение.pdf",

    // Send route (email / WhatsApp with the PDF link)
    "הצעת מחיר מ{name}": "Ценовое предложение от {name}",
    "שלום,\n\nמצורפת הצעת מחיר מ{name}.\n\nבברכה,\n{name}":
      "Здравствуйте!\n\nВо вложении ценовое предложение от {name}.\n\nС уважением,\n{name}",
    "לכבוד: {name}": "Для: {name}",

    // Contract page
    "נוסח ההסכם כתוב בעברית, כפי שהצלם ניסח אותו. לשאלות על התנאים אפשר לפנות ישירות לצלם.":
      "Текст договора ниже — на иврите, в том виде, как его составил фотограф. Если у вас есть вопросы по условиям, пожалуйста, обратитесь напрямую к фотографу.",
  },
};

export default dict;
