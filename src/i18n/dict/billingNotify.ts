import type { AreaDict } from "@/i18n/types";

// Area "billingNotify" (2026-10-04; see src/i18n/dict/index.ts): billing/account emails to the
// photographer (src/lib/billingEmails.ts). Hebrew source text → translation.
const dict: AreaDict = {
  en: {
    "המנוי שלך יחודש בקרוב | {date}": "Your subscription renews soon | {date}",
    "שלום {name},\n\nהמנוי {plan} שלך במערכת גילברטו יחודש אוטומטית בתאריך {date} בסך ₪{amount}.\nאם ברצונך לכבות את החידוש האוטומטי, ניתן לעשות זאת בכל עת מתוך הגדרות > מנוי.\n\nתודה שאת/ה חלק מהמערכת!":
      "Hi {name},\n\nYour Gilberto {plan} subscription will renew automatically on {date} for ₪{amount}.\nIf you'd like to turn off auto-renewal, you can do it any time in Settings > Subscription.\n\nThank you for being part of Gilberto!",
    "זהו החיוב עבור החודשים ה-11 וה-12 של תקופת המנוי הקודמת שלך, בעקבות המעבר למסלול {plan} שביקשת, במקום שיהיו חינמיים כמו במסלול הקודם. החל מהמחזור שאחרי כן תחויב/י ₪{price} מדי חודש כמסלול {plan} רגיל.":
      "This is the charge for months 11 and 12 of your previous subscription period, following the switch to the {plan} plan you requested, instead of them being free as on your previous plan. From the following cycle on, you'll be charged ₪{price} a month as a regular {plan} plan.",
    "כפי שביקשת, המנוי שלך עובר למסלול {plan} (₪{amount}) החל מהמחזור הבא.":
      "As you requested, your subscription is moving to the {plan} plan (₪{amount}) starting next cycle.",
    "המעבר למסלול החדש שלך | נדרשת השלמת תשלום": "Your new plan | Payment needs to be completed",
    "שלום {name},\n\n{reason}\n\nלהשלמת התשלום: {link}\n\nתודה!":
      "Hi {name},\n\n{reason}\n\nTo complete the payment: {link}\n\nThank you!",
    "תקופת הניסיון בגילברטו מסתיימת מחר": "Your Gilberto free trial ends tomorrow",
    "שלום {name},\n\nתקופת הניסיון שלך במערכת גילברטו מסתיימת מחר. כדי להמשיך לעבוד בלי הפסקה, בוחרים מסלול כאן:\n{url}/billing\n\nכל האירועים, הגלריות והלקוחות שהכנסת נשמרים 30 יום אחרי סוף הניסיון, ואחרי התשלום ממשיכים בדיוק מאיפה שעצרת. בלי תשלום עד אז, החשבון והנתונים נמחקים.\n\nצוות גילברטו":
      "Hi {name},\n\nYour Gilberto free trial ends tomorrow. To keep working without a break, choose a plan here:\n{url}/billing\n\nAll the events, galleries and clients you've added are kept for 30 days after the trial ends, and once you pay you continue exactly where you left off. Without a payment by then, the account and its data are deleted.\n\nThe Gilberto team",
    "החשבון שלך בגילברטו יימחק ב-{date}": "Your Gilberto account will be deleted on {date}",
    "שלום {name},\n\nתקופת הניסיון שלך בגילברטו הסתיימה, ועדיין לא נבחר מסלול. כפי שמופיע בתנאי השימוש, הנתונים נשמרים {days} יום מסוף הניסיון, ולכן ב-{date} החשבון וכל מה שבו יימחקו לצמיתות: האירועים, הלקוחות, הגלריות והתמונות.\n\nכדי לשמור הכל ולהמשיך בדיוק מאיפה שעצרת, בוחרים מסלול כאן:\n{url}/billing\n\nצוות גילברטו":
      "Hi {name},\n\nYour Gilberto free trial has ended and no plan has been chosen yet. As stated in the terms of use, data is kept for {days} days after the trial ends, so on {date} the account and everything in it will be permanently deleted: events, clients, galleries and photos.\n\nTo keep everything and continue exactly where you left off, choose a plan here:\n{url}/billing\n\nThe Gilberto team",
    "תזכורת אחרונה: החשבון שלך בגילברטו יימחק מחר": "Final reminder: your Gilberto account will be deleted tomorrow",
    "שלום {name},\n\nמחר החשבון שלך בגילברטו וכל הנתונים שבו יימחקו לצמיתות, כי תקופת הניסיון הסתיימה ולא נבחר מסלול. אחרי המחיקה אי אפשר לשחזר אותם.\n\nכדי לשמור הכל, בוחרים מסלול היום:\n{url}/billing\n\nצוות גילברטו":
      "Hi {name},\n\nTomorrow your Gilberto account and all its data will be permanently deleted, because the free trial has ended and no plan was chosen. Once deleted, they can't be restored.\n\nTo keep everything, choose a plan today:\n{url}/billing\n\nThe Gilberto team",
  },
  ru: {
    "המנוי שלך יחודש בקרוב | {date}": "Ваша подписка скоро продлится | {date}",
    "שלום {name},\n\nהמנוי {plan} שלך במערכת גילברטו יחודש אוטומטית בתאריך {date} בסך ₪{amount}.\nאם ברצונך לכבות את החידוש האוטומטי, ניתן לעשות זאת בכל עת מתוך הגדרות > מנוי.\n\nתודה שאת/ה חלק מהמערכת!":
      "Здравствуйте, {name}!\n\nВаша подписка Гилберто ({plan}) будет автоматически продлена {date} на сумму ₪{amount}.\nЕсли вы хотите отключить автопродление, это можно сделать в любое время в разделе Настройки > Подписка.\n\nСпасибо, что вы с Гилберто!",
    "זהו החיוב עבור החודשים ה-11 וה-12 של תקופת המנוי הקודמת שלך, בעקבות המעבר למסלול {plan} שביקשת, במקום שיהיו חינמיים כמו במסלול הקודם. החל מהמחזור שאחרי כן תחויב/י ₪{price} מדי חודש כמסלול {plan} רגיל.":
      "Это оплата за 11-й и 12-й месяцы вашего предыдущего периода подписки в связи с запрошенным вами переходом на тариф {plan}: на прежнем тарифе они были бы бесплатными. Начиная со следующего цикла с вас будет списываться ₪{price} в месяц как за обычный тариф {plan}.",
    "כפי שביקשת, המנוי שלך עובר למסלול {plan} (₪{amount}) החל מהמחזור הבא.":
      "Как вы и просили, со следующего цикла ваша подписка переходит на тариф {plan} (₪{amount}).",
    "המעבר למסלול החדש שלך | נדרשת השלמת תשלום": "Переход на новый тариф | Нужно завершить оплату",
    "שלום {name},\n\n{reason}\n\nלהשלמת התשלום: {link}\n\nתודה!":
      "Здравствуйте, {name}!\n\n{reason}\n\nЗавершить оплату: {link}\n\nСпасибо!",
    "תקופת הניסיון בגילברטו מסתיימת מחר": "Пробный период в Гилберто заканчивается завтра",
    "שלום {name},\n\nתקופת הניסיון שלך במערכת גילברטו מסתיימת מחר. כדי להמשיך לעבוד בלי הפסקה, בוחרים מסלול כאן:\n{url}/billing\n\nכל האירועים, הגלריות והלקוחות שהכנסת נשמרים 30 יום אחרי סוף הניסיון, ואחרי התשלום ממשיכים בדיוק מאיפה שעצרת. בלי תשלום עד אז, החשבון והנתונים נמחקים.\n\nצוות גילברטו":
      "Здравствуйте, {name}!\n\nВаш пробный период в Гилберто заканчивается завтра. Чтобы продолжить работу без перерыва, выберите тариф здесь:\n{url}/billing\n\nВсе добавленные вами мероприятия, галереи и клиенты хранятся 30 дней после окончания пробного периода, а после оплаты вы продолжите ровно с того места, где остановились. Если оплаты не будет до этого срока, аккаунт и данные будут удалены.\n\nКоманда Гилберто",
    "החשבון שלך בגילברטו יימחק ב-{date}": "Ваш аккаунт в Гилберто будет удалён {date}",
    "שלום {name},\n\nתקופת הניסיון שלך בגילברטו הסתיימה, ועדיין לא נבחר מסלול. כפי שמופיע בתנאי השימוש, הנתונים נשמרים {days} יום מסוף הניסיון, ולכן ב-{date} החשבון וכל מה שבו יימחקו לצמיתות: האירועים, הלקוחות, הגלריות והתמונות.\n\nכדי לשמור הכל ולהמשיך בדיוק מאיפה שעצרת, בוחרים מסלול כאן:\n{url}/billing\n\nצוות גילברטו":
      "Здравствуйте, {name}!\n\nВаш пробный период в Гилберто закончился, а тариф ещё не выбран. Согласно условиям использования, данные хранятся {days} дней после окончания пробного периода, поэтому {date} аккаунт и всё его содержимое будут удалены безвозвратно: мероприятия, клиенты, галереи и фотографии.\n\nЧтобы всё сохранить и продолжить ровно с того места, где вы остановились, выберите тариф здесь:\n{url}/billing\n\nКоманда Гилберто",
    "תזכורת אחרונה: החשבון שלך בגילברטו יימחק מחר": "Последнее напоминание: ваш аккаунт в Гилберто будет удалён завтра",
    "שלום {name},\n\nמחר החשבון שלך בגילברטו וכל הנתונים שבו יימחקו לצמיתות, כי תקופת הניסיון הסתיימה ולא נבחר מסלול. אחרי המחיקה אי אפשר לשחזר אותם.\n\nכדי לשמור הכל, בוחרים מסלול היום:\n{url}/billing\n\nצוות גילברטו":
      "Здравствуйте, {name}!\n\nЗавтра ваш аккаунт в Гилберто и все его данные будут удалены безвозвратно, так как пробный период закончился, а тариф не выбран. После удаления восстановить их будет невозможно.\n\nЧтобы всё сохранить, выберите тариф сегодня:\n{url}/billing\n\nКоманда Гилберто",
  },
};

export default dict;
