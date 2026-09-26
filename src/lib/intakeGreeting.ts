export const GREETING_MAX_CHARS = 1000;

export function chatLinkFor(chatPath: string): string {
  return `https://myframeflow.com${chatPath}`;
}

// The default greeting for the WhatsApp Business app (settings > automation): sends every new
// client to the intake assistant, and promises a reply by hand within 45 minutes for anyone who
// keeps writing in WhatsApp.
export function defaultWhatsAppGreeting(studio: string, chatPath: string): string {
  return `היי, תודה שפניתם ל${studio}! 📸
רוצים לדעת עכשיו אם התאריך שלכם פנוי?
בצ'אט הזה תקבלו תשובה תוך שניות, בלי לחכות:
👈 ${chatLinkFor(chatPath)}
בודקים את התאריך, אוספים את הפרטים, והצעה אישית בדרך אליכם.
ומעדיפים לכתוב כאן? נחזור אליכם בוואטסאפ תוך 45 דקות לכל היותר.`;
}
