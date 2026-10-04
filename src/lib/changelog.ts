import type { Lang } from "@/i18n/config";

export type ChangelogEntry = {
  version: string;
  date: string;
  // Hebrew, the source text (and the fallback for any language without a translation).
  changes: string[];
  // Translations for the photographer's screen language (Settings › מראה › שפת הממשק): same
  // order and length as `changes`. Missing → the Hebrew `changes` is shown.
  en?: string[];
  ru?: string[];
};

// The entry's lines in the viewer's UI language, falling back to Hebrew when the translation is
// missing or doesn't line up with the Hebrew list.
export function changesFor(entry: ChangelogEntry, lang: Lang): string[] {
  const tr = lang === "en" ? entry.en : lang === "ru" ? entry.ru : undefined;
  return tr && tr.length === entry.changes.length ? tr : entry.changes;
}

// Newest first. CURRENT_VERSION is derived from entries[0] — bump a version by adding a new
// entry at the top, not by editing this constant directly.
// Every new entry should include `en` and `ru` alongside the Hebrew `changes` (same order and
// length; product terms per src/i18n/GLOSSARY.md), so English/Russian users don't get a Hebrew
// "מה חדש" popup.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2.12.1",
    date: "2026-10-04",
    changes: [
      "תזכורת לאישור עיצוב האלבום: 3 ימים אחרי ששלחתם ללקוח שהעיצוב מוכן, אם הוא עוד לא אישר בפורטל, תקבלו התראה וחלון במסך הראשי עם תזכורת מוכנה לשליחה בוואטסאפ",
      "תזכורת לבחירת שירים לקליפ: 3 ימים אחרי ההודעה שהסרט המלא מוכן, אם הלקוח עוד לא בחר שירים, תקבלו תזכורת לבקש ממנו להוריד את הסרט ולבחור שיר שקט ושיר קצבי",
      "אם הלקוח כבר אישר או בחר שירים בתוך 3 הימים, לא תקבלו תזכורת. בפורטל הלקוח אפשר עכשיו לאשר את עיצוב האלבום ואת בחירת השירים גם בחבילות מותאמות",
    ],
    en: [
      "Album design approval reminder: 3 days after you tell the client the design is ready, if they haven't approved it in the portal yet, you get a notification and a prompt on the home screen with a reminder ready to send on WhatsApp",
      "Clip song reminder: 3 days after the \"full film is ready\" message, if the client hasn't picked songs yet, you get a reminder to ask them to download the film and pick a calm song and an upbeat one",
      "If the client already approved or picked songs within the 3 days, there's no reminder. In the client portal, clients can now approve the album design and the song choice in custom packages too",
    ],
    ru: [
      "Напоминание об утверждении дизайна альбома: через 3 дня после того, как вы сообщили клиенту, что дизайн готов, если он ещё не утвердил его в портале, вы получите уведомление и окно на главном экране с готовым напоминанием для отправки в WhatsApp",
      "Напоминание о выборе песен для клипа: через 3 дня после сообщения «полный фильм готов», если клиент ещё не выбрал песни, вы получите напоминание попросить его скачать фильм и выбрать спокойную и ритмичную песню",
      "Если клиент уже утвердил дизайн или выбрал песни в течение 3 дней, напоминания не будет. В портале клиента теперь можно утвердить дизайн альбома и выбор песен и в индивидуальных пакетах",
    ],
  },
  {
    version: "2.12.0",
    date: "2026-10-04",
    changes: [
      "המערכת זמינה עכשיו גם באנגלית וברוסית: בוחרים את שפת הממשק בהגדרות › מראה › \"שפת הממשק\". הבחירה נשמרת לכל מכשיר",
      "שפת הלקוח: בבונה הצעות המחיר, בכרטיס הליד ובעריכת אירוע אפשר לבחור את שפת הלקוח. דף ההצעה, השאלון, החוזה, הפורטל והגלריה יוצגו לו בשפה הזו",
      "גם מה שנשלח ללקוח יוצא בשפה שלו: הודעת הצעת המחיר וקובץ ה-PDF, הודעות העדכון בוואטסאפ (בהגדרות › הודעות ללקוח/ה אפשר לערוך נוסח לכל שפה), שיתוף הגלריה ותזכורות. תנאי החוזה נשארים כפי שכתבתם אותם",
      "עוזר הפניות עונה ללקוח בשפה שבה הוא כותב (עברית, אנגלית או רוסית), ושומר אותה על הליד",
      "עוזר הפניות בודק שמקום האירוע באמת קיים, ושואל את הלקוח אם השם לא מוכר או כתוב עם שגיאה",
    ],
    en: [
      "Gilberto is now available in English and Russian too: choose the interface language in Settings › Appearance › \"Interface language\". The choice is saved per device",
      "Client language: in the price quote builder, on the lead card and when editing an event you can choose the client's language. The quote page, questionnaire, contract, portal and gallery will be shown to them in that language",
      "What you send to the client goes out in their language too: the price quote message and PDF, the WhatsApp update messages (in Settings › Client messages you can edit a version for each language), gallery sharing and reminders. Contract terms stay as you wrote them",
      "The intake assistant replies to the client in the language they write in (Hebrew, English or Russian) and saves it on the lead",
      "The intake assistant checks that the event venue really exists, and asks the client if the name is unfamiliar or misspelled",
    ],
    ru: [
      "Гилберто теперь доступен на английском и русском: выберите язык интерфейса в разделе Настройки › Внешний вид › «Язык интерфейса». Выбор сохраняется для каждого устройства",
      "Язык клиента: в конструкторе ценовых предложений, в карточке заявки и при редактировании мероприятия можно выбрать язык клиента. Страница предложения, анкета, договор, портал и галерея будут показаны ему на этом языке",
      "То, что отправляется клиенту, тоже уходит на его языке: сообщение с ценовым предложением и PDF, обновления в WhatsApp (в Настройки › Сообщения клиенту можно отредактировать текст для каждого языка), ссылка на галерею и напоминания. Условия договора остаются такими, как вы их написали",
      "Ассистент обращений отвечает клиенту на языке, на котором тот пишет (иврит, английский или русский), и сохраняет его в заявке",
      "Ассистент обращений проверяет, что место мероприятия действительно существует, и переспрашивает клиента, если название незнакомое или написано с ошибкой",
    ],
  },
  {
    version: "2.11.73",
    date: "2026-10-01",
    changes: [
      "הצעת מחיר נשלחת ללקוח כקישור בוואטסאפ: לחיצה על \"שליחה ללקוח/ה\" פותחת את וואטסאפ עם הודעה מוכנה, שם הלקוח, סוג האירוע והתאריך, הקישור והחתימה שלך",
      "הלקוח רואה את ההצעה בעמוד מעוצב, מאשר אותה, וממלא שאלון קצר על האירוע. האירוע נפתח לבד ביומן שלך",
      "חוזה באותו קישור: לפני השליחה נשאלים אם לשלוח גם חוזה. אם כן, הלקוח חותם עליו בסוף השאלון, השלב \"סגירת האירוע\" מסומן כבוצע, ומקבלים עדכון לטלפון ובמייל",
      "ליד שהפך לאירוע (ושחתם על החוזה, כשנשלח) יוצא מרשימת הלידים. בכרטיס הליד אפשר להוריד את קובץ ה-PDF של ההצעה",
      "עוזר הפניות: מונה שיחות בהגדרות › אוטומציה, התראה ב-90% מהמכסה וכשהיא נגמרת, ואפשרות לרכוש חבילות שיחות נוספות שלא פגות (10 ב-₪10 ועד 50 ב-₪40)",
    ],
    en: [
      "Price quotes are sent to the client as a WhatsApp link: tapping \"Send to client\" opens WhatsApp with a ready message, the client's name, event type and date, the link and your signature",
      "The client sees the quote on a designed page, approves it and fills in a short questionnaire about the event. The event opens in your calendar on its own",
      "Contract in the same link: before sending you're asked whether to send a contract too. If so, the client signs it at the end of the questionnaire, the \"Event closing\" stage is marked as done, and you get a phone notification and an email",
      "A lead that became an event (and signed the contract, when one was sent) leaves the leads list. You can download the quote PDF from the lead card",
      "Intake assistant: a conversation counter in Settings › Automation, alerts at 90% of the quota and when it runs out, and the option to buy extra conversation packs that never expire (10 for ₪10 up to 50 for ₪40)",
    ],
    ru: [
      "Ценовое предложение отправляется клиенту ссылкой в WhatsApp: кнопка «Отправить клиенту» открывает WhatsApp с готовым сообщением — имя клиента, тип и дата мероприятия, ссылка и ваша подпись",
      "Клиент видит предложение на оформленной странице, подтверждает его и заполняет короткую анкету о мероприятии. Мероприятие само появляется в вашем календаре",
      "Договор по той же ссылке: перед отправкой вас спросят, отправить ли и договор. Если да, клиент подписывает его в конце анкеты, этап «Закрытие мероприятия» отмечается как выполненный, а вы получаете уведомление на телефон и письмо",
      "Заявка, ставшая мероприятием (и подписавшая договор, если он был отправлен), уходит из списка заявок. В карточке заявки можно скачать PDF предложения",
      "Ассистент обращений: счётчик разговоров в Настройки › Автоматизация, уведомления при 90% лимита и когда он исчерпан, и возможность купить дополнительные пакеты разговоров без срока действия (от 10 за ₪10 до 50 за ₪40)",
    ],
  },
  {
    version: "2.11.72",
    date: "2026-09-30",
    changes: [
      "עיצוב אוטומטי של כל האלבום (ממסלול פרו ומעלה): בוחרים מידות, כריכה וסגנון (קו נקי, קטלוג, מקושקש, מודרני או תבנית שמורה שלכם), מסמנים תמונה של בעלי השמחה, ההורים, האחים והסבים, והאלבום כולו מעוצב לבד",
      "סדר האלבום נבנה לפי המשפחה: קודם בעלי השמחה, אחר כך ההורים, האחים והסבים, ואחריהם שאר האירוע לפי סדר הצילום. זיהוי הפרצופים רץ במכשיר שלכם",
      "כפתור \"עיצוב מחדש\" מתחת לכל עמוד: כל לחיצה נותנת פריסה אחרת לאותן תמונות, בלי לחזור על פריסות שכבר הוצגו",
      "החלפת תמונות בין עמודים בתצוגה המקדימה: לוחצים על תמונה ואז על התמונה שאיתה להחליף, בכל עמוד",
    ],
    en: [
      "Automatic design of the whole album (Pro plan and up): choose the size, cover and style (Clean line, Catalog, Scribble, Modern or one of your saved templates), mark a photo of the guests of honor, parents, siblings and grandparents, and the whole album designs itself",
      "The album order follows the family: the guests of honor first, then the parents, siblings and grandparents, and then the rest of the event in shooting order. Face recognition runs on your device",
      "A \"Redesign\" button under every page: each tap gives a different layout for the same photos, without repeating layouts already shown",
      "Swap photos between pages in the preview: tap a photo and then the photo to swap it with, on any page",
    ],
    ru: [
      "Автоматический дизайн всего альбома (тариф Про и выше): выберите размер, обложку и стиль («Чистая линия», «Каталог», «Скрапбук», «Модерн» или ваш сохранённый шаблон), отметьте фото виновников торжества, родителей, братьев и сестёр, бабушек и дедушек — и весь альбом оформится сам",
      "Порядок альбома строится по семье: сначала виновники торжества, затем родители, братья и сёстры, бабушки и дедушки, а после них остальное мероприятие в порядке съёмки. Распознавание лиц работает на вашем устройстве",
      "Кнопка «Переоформить» под каждой страницей: каждое нажатие даёт другую раскладку тех же фото, без повторения уже показанных",
      "Обмен фото между страницами в предпросмотре: нажмите на фото, а затем на фото, с которым его поменять, на любой странице",
    ],
  },
  {
    version: "2.11.71",
    date: "2026-09-29",
    changes: [
      "עוזר הפניות זמין עכשיו בכל המסלולים: בפרו סטארט עד 100 שיחות בחודש, בפרו עד 150 (במקום 100), ובפרו+ עד 200. מפעילים בהגדרות › אוטומציה",
    ],
    en: [
      "The intake assistant is now available on all plans: up to 100 conversations a month on Pro Start, up to 150 on Pro (instead of 100), and up to 200 on Pro+. Turn it on in Settings › Automation",
    ],
    ru: [
      "Ассистент обращений теперь доступен на всех тарифах: до 100 разговоров в месяц на Про Старт, до 150 на Про (вместо 100) и до 200 на Про+. Включается в Настройки › Автоматизация",
    ],
  },
  {
    version: "2.11.70",
    date: "2026-09-27",
    changes: [
      "סריקת יומן Google לכל החשבונות (הגדרות › פרופיל): מסמנים ביומן אירועי לקוחות בצבע שבחרתם, והסריקה פותחת להם כרטיסי אירוע עם השם, התאריך, השעות, המיקום והטלפון, בלי להקליד מחדש",
      "אירוע שכבר קיים במערכת מופיע בסריקה עם השורה \"האירוע כבר קיים במערכת\". אפשר לסמן אותו כדי לעדכן את הפרטים שלו לפי היומן, בלי ליצור כפילות",
    ],
    en: [
      "Google Calendar scan for every account (Settings › Profile): mark client events in your calendar with a color you choose, and the scan opens event cards for them with the name, date, hours, location and phone, without retyping",
      "An event that already exists in the system shows up in the scan with the line \"The event already exists in the system\". You can select it to update its details from the calendar, without creating a duplicate",
    ],
    ru: [
      "Сканирование Google Календаря для всех аккаунтов (Настройки › Профиль): отметьте в календаре мероприятия клиентов выбранным цветом, и сканирование создаст для них карточки с именем, датой, временем, местом и телефоном — без повторного ввода",
      "Мероприятие, которое уже есть в системе, отображается в сканировании со строкой «Мероприятие уже есть в системе». Его можно отметить, чтобы обновить данные по календарю, не создавая дубликат",
    ],
  },
  {
    version: "2.11.69",
    date: "2026-09-26",
    changes: [
      "עוזר פניות: מדריך מלא בהגדרות › אוטומציה, בעברית, באנגלית וברוסית. איך העוזר עובד, מה להגדיר, למה השאלות הנפוצות חשובות, ואיך בונים קמפיין ממומן בפייסבוק ובאינסטגרם שמוביל לקוחות ישר לעוזר",
      "העוזר בודק זמינות גם מול יומן Google, לפי הצבע שבחרת בהגדרות, כך שאירוע שרשום רק ביומן מסומן כתפוס",
      "פרטי החיבור למטא (פיקסל) מקופלים ונפתחים בלחיצה",
    ],
    en: [
      "Intake assistant: a full guide in Settings › Automation, in Hebrew, English and Russian. How the assistant works, what to set up, why the FAQ matters, and how to build a paid Facebook and Instagram campaign that leads clients straight to the assistant",
      "The assistant also checks availability against your Google Calendar, by the color you chose in Settings, so an event recorded only in the calendar is marked as taken",
      "The Meta (Pixel) connection details are collapsed and open with a tap",
    ],
    ru: [
      "Ассистент обращений: полное руководство в Настройки › Автоматизация, на иврите, английском и русском. Как работает ассистент, что настроить, почему важны частые вопросы и как запустить рекламную кампанию в Facebook и Instagram, которая ведёт клиентов прямо к ассистенту",
      "Ассистент проверяет занятость и по Google Календарю, по цвету, выбранному в настройках, так что мероприятие, записанное только в календаре, отмечается как занятое",
      "Данные подключения к Meta (пиксель) свёрнуты и открываются по нажатию",
    ],
  },
  {
    version: "2.11.68",
    date: "2026-09-26",
    changes: [
      "עוזר פניות: הגדרה \"לא מצלם בשבת\". ביום שישי העוזר מציע רק אירוע בוקר (עד 16:00), ושישי בערב ושבת מסומנים כלא זמינים. הלקוח מקבל הסבר ומתבקש לבחור תאריך אחר",
    ],
    en: [
      "Intake assistant: a \"I don't shoot on Shabbat\" setting. On Fridays the assistant offers only a morning event (until 16:00), and Friday evening and Saturday are marked unavailable. The client gets an explanation and is asked to pick another date",
    ],
    ru: [
      "Ассистент обращений: настройка «Не снимаю в шаббат». В пятницу ассистент предлагает только утреннее мероприятие (до 16:00), а вечер пятницы и суббота отмечаются как недоступные. Клиент получает объяснение и просьбу выбрать другую дату",
    ],
  },
  {
    version: "2.11.67",
    date: "2026-09-26",
    changes: [
      "עוזר פניות: אפשר לאפשר אירוע בוקר ואירוע ערב באותו יום (הגדרות › אוטומציה). אירוע בוקר (07:30 עד 15:00, למשל עלייה לתורה) לא חוסם אירוע ערב (18:00 עד 00:00), ולהפך. אירוע בלי שעות או אירוע של כל היום עדיין חוסם את כל היום",
    ],
    en: [
      "Intake assistant: you can allow a morning event and an evening event on the same day (Settings › Automation). A morning event (07:30 to 15:00, e.g. a Torah reading) doesn't block an evening event (18:00 to 00:00), and vice versa. An event without hours or an all-day event still blocks the whole day",
    ],
    ru: [
      "Ассистент обращений: можно разрешить утреннее и вечернее мероприятие в один день (Настройки › Автоматизация). Утреннее мероприятие (с 07:30 до 15:00, например, чтение Торы) не блокирует вечернее (с 18:00 до 00:00), и наоборот. Мероприятие без времени или на весь день по-прежнему блокирует весь день",
    ],
  },
  {
    version: "2.11.66",
    date: "2026-09-26",
    changes: [
      "בלי לידים כפולים: כשמוסיפים ללידים לקוח מהצעת מחיר, והטלפון שלו כבר קיים, המערכת מציעה לצרף את ההצעה לליד הקיים (או לפתוח ליד חדש אם זה אירוע אחר)",
      "גם בהוספת ליד ידנית מופיעה התראה כשהטלפון כבר ברשימה, ולקוח שחוזר לעוזר הפניות מעדכן את הליד הפתוח שלו במקום לפתוח חדש",
    ],
    en: [
      "No duplicate leads: when you add a client from a price quote to your leads and their phone already exists, the system offers to attach the quote to the existing lead (or open a new lead if it's a different event)",
      "Adding a lead manually also shows an alert when the phone is already on the list, and a client who comes back to the intake assistant updates their open lead instead of opening a new one",
    ],
    ru: [
      "Без дублей заявок: когда вы добавляете клиента из ценового предложения в заявки, а его телефон уже есть, система предлагает прикрепить предложение к существующей заявке (или открыть новую, если это другое мероприятие)",
      "При ручном добавлении заявки тоже появляется предупреждение, если телефон уже в списке, а клиент, вернувшийся к ассистенту обращений, обновляет свою открытую заявку вместо создания новой",
    ],
  },
  {
    version: "2.11.65",
    date: "2026-09-26",
    changes: [
      "עוזר פניות: מעקב מקורות. בהגדרות › אוטומציה יש קישור נפרד למודעה, לאינסטגרם, לפייסבוק ולקוד QR, ובעמוד הלידים רואים ליד כל פנייה מאיפה היא הגיעה, וסיכום מקורות של 30 הימים האחרונים",
      "אפשר לחבר Meta Pixel לעוזר: כל ליד שהעוזר יוצר מדווח למטא, כדי שהמודעות ילמדו להביא לקוחות שמשאירים פרטים",
    ],
    en: [
      "Intake assistant: source tracking. Settings › Automation has a separate link for ads, Instagram, Facebook and a QR code, and the leads page shows where each inquiry came from, plus a source summary for the last 30 days",
      "You can connect a Meta Pixel to the assistant: every lead the assistant creates is reported to Meta, so your ads learn to bring clients who leave their details",
    ],
    ru: [
      "Ассистент обращений: отслеживание источников. В Настройки › Автоматизация есть отдельные ссылки для рекламы, Instagram, Facebook и QR-кода, а на странице заявок видно, откуда пришло каждое обращение, и сводка источников за последние 30 дней",
      "К ассистенту можно подключить Meta Pixel: каждая заявка, созданная ассистентом, передаётся в Meta, чтобы реклама училась приводить клиентов, которые оставляют контакты",
    ],
  },
  {
    version: "2.11.64",
    date: "2026-09-25",
    changes: [
      "הודעת הפתיחה לוואטסאפ בהגדרות › אוטומציה: אפשר לערוך אותה ולשמור, וכפתור \"ניסוח עם AI\" מנסח מחדש את מה שכתבת בלי לגעת בקישור",
      "הנוסח המוצע כולל עכשיו גם מענה בוואטסאפ תוך 45 דקות, ללקוח שמעדיף להמשיך לכתוב",
    ],
    en: [
      "The WhatsApp greeting message in Settings › Automation: you can edit and save it, and a \"Write with AI\" button rephrases what you wrote without touching the link",
      "The suggested text now also offers a WhatsApp reply within 45 minutes, for clients who prefer to keep writing",
    ],
    ru: [
      "Приветственное сообщение для WhatsApp в Настройки › Автоматизация: его можно отредактировать и сохранить, а кнопка «Сформулировать с ИИ» переписывает ваш текст, не трогая ссылку",
      "Предлагаемый текст теперь также обещает ответ в WhatsApp в течение 45 минут — для клиентов, которые предпочитают продолжить переписку",
    ],
  },
  {
    version: "2.11.63",
    date: "2026-09-25",
    changes: [
      "עוזר פניות: הודעת פתיחה מוכנה לוואטסאפ העסקי, עם הקישור שלך, בהגדרות › אוטומציה. מעתיקים, מדביקים ב\"הודעת פתיחה\" של WhatsApp Business, וכל לקוח חדש מקבל מיד קישור לעוזר",
      "קישור העוזר מוצג עכשיו בוואטסאפ ובאינסטגרם ככרטיס מעוצב עם השם שלך, במקום קישור רגיל",
    ],
    en: [
      "Intake assistant: a ready greeting message for your WhatsApp Business, with your link, in Settings › Automation. Copy it, paste it into WhatsApp Business's \"Greeting message\", and every new client immediately gets a link to the assistant",
      "The assistant link now shows in WhatsApp and Instagram as a designed card with your name, instead of a plain link",
    ],
    ru: [
      "Ассистент обращений: готовое приветственное сообщение для WhatsApp Business с вашей ссылкой, в Настройки › Автоматизация. Скопируйте его, вставьте в «Приветственное сообщение» WhatsApp Business — и каждый новый клиент сразу получит ссылку на ассистента",
      "Ссылка на ассистента теперь отображается в WhatsApp и Instagram как оформленная карточка с вашим именем, а не обычная ссылка",
    ],
  },
  {
    version: "2.11.62",
    date: "2026-09-25",
    changes: [
      "חדש במסלולי פרו ופרו+: עוזר פניות. לקוח שנכנס לקישור שלך מקבל תשובה מיד: העוזר בודק שהתאריך פנוי, אוסף את פרטי האירוע ומעביר לך ליד מוכן להצעת מחיר. על מחירים הוא לא מדבר, ההצעה תמיד ממך",
      "מפעילים בהגדרות › אוטומציה: קישור לשיתוף באינסטגרם ובוואטסאפ, שאלות נפוצות בכתיבה שלך, וזמן החזרה שמובטח ללקוח",
      "לקוח שעזב באמצע אבל השאיר טלפון נכנס ללידים עם סימון \"חסרים פרטים\", ותאריך תפוס נכנס לרשימת ההמתנה",
    ],
    en: [
      "New on the Pro and Pro+ plans: the intake assistant. A client who opens your link gets an answer right away: the assistant checks that the date is free, collects the event details and hands you a lead ready for a price quote. It never talks about prices; the quote always comes from you",
      "Turn it on in Settings › Automation: a link to share on Instagram and WhatsApp, FAQ in your own words, and the response time promised to the client",
      "A client who left midway but gave a phone number goes into your leads marked \"Missing details\", and a taken date goes onto the waitlist",
    ],
    ru: [
      "Новое на тарифах Про и Про+: ассистент обращений. Клиент, открывший вашу ссылку, сразу получает ответ: ассистент проверяет, свободна ли дата, собирает данные о мероприятии и передаёт вам заявку, готовую к ценовому предложению. О ценах он не говорит — предложение всегда от вас",
      "Включается в Настройки › Автоматизация: ссылка для Instagram и WhatsApp, частые вопросы вашими словами и срок ответа, который обещается клиенту",
      "Клиент, ушедший на полпути, но оставивший телефон, попадает в заявки с пометкой «Не хватает данных», а занятая дата — в лист ожидания",
    ],
  },
  {
    version: "2.11.61",
    date: "2026-09-24",
    changes: [
      "ייצוא PDF של אלבום: כל עמוד יוצא עכשיו במידות האמיתיות של האלבום (למשל 30×20 ס״מ), בלי למתוח או לדחוס את העיצוב",
    ],
    en: [
      "Album PDF export: every page now comes out at the album's real size (e.g. 30×20 cm), without stretching or squeezing the design",
    ],
    ru: [
      "Экспорт альбома в PDF: каждая страница теперь выходит в реальном размере альбома (например, 30×20 см), без растягивания и сжатия дизайна",
    ],
  },
  {
    version: "2.11.60",
    date: "2026-09-24",
    changes: [
      "עיצוב מסגרת מגנט פתוח עכשיו לכל המנויים במסלולי פרו ופרו+: כרטיס \"עיצוב מסגרת מגנט\" במסך הבית, עם הורדה של מסגרת לרוחב (20×15) ולאורך (15×20)",
      "קובצי המסגרת מסומנים במידה האמיתית שלהם, כך שבית הדפוס ופוטושופ פותחים אותם ב-20×15 ס״מ",
    ],
    en: [
      "Magnet frame design is now open to all Pro and Pro+ subscribers: a \"Magnet frame design\" card on the home screen, with downloads of a landscape (20×15) and portrait (15×20) frame",
      "Frame files are tagged with their real size, so print labs and Photoshop open them at 20×15 cm",
    ],
    ru: [
      "Дизайн рамки для магнита теперь доступен всем подписчикам Про и Про+: карточка «Дизайн рамки для магнита» на главном экране, со скачиванием горизонтальной (20×15) и вертикальной (15×20) рамки",
      "Файлы рамок помечены реальным размером, поэтому типография и Photoshop открывают их в 20×15 см",
    ],
  },
  {
    version: "2.11.59",
    date: "2026-09-24",
    changes: [
      "עיצוב אלבומים פתוח עכשיו לכל המנויים במסלולי פרו ופרו+: לשונית \"עיצוב אלבום\" בניהול הגלריה, וגישה מהירה ממסך הבית",
      "ייצוא JPG ושליחה לבית דפוס: הקבצים מסומנים עכשיו ברזולוציית הדפסה (300 DPI), כך שבית הדפוס ופוטושופ פותחים אותם בגודל הנכון",
    ],
    en: [
      "Album design is now open to all Pro and Pro+ subscribers: an \"Album design\" tab in gallery management, and quick access from the home screen",
      "JPG export and sending to a print lab: files are now tagged at print resolution (300 DPI), so print labs and Photoshop open them at the right size",
    ],
    ru: [
      "Дизайн альбомов теперь доступен всем подписчикам Про и Про+: вкладка «Дизайн альбома» в управлении галереей и быстрый доступ с главного экрана",
      "Экспорт JPG и отправка в типографию: файлы теперь помечены разрешением печати (300 DPI), поэтому типография и Photoshop открывают их в правильном размере",
    ],
  },
  {
    version: "2.11.58",
    date: "2026-09-24",
    changes: [
      "תקופת ניסיון: צלמים חדשים מקבלים 14 יום חינם, בלי כרטיס אשראי, עם כל האפשרויות של מסלול פרו+ (אחסון עד 5GB בזמן הניסיון)",
      "לקראת סוף הניסיון מופיעה במסך הבית תזכורת לבחור מסלול, ויום לפני הסוף נשלח גם מייל. בסוף הניסיון בוחרים מסלול ומשלמים, וכל מה שהוכנס נשמר",
      "תקופת ניסיון אחת לכל מספר טלפון",
    ],
    en: [
      "Free trial: new photographers get 14 days free, no credit card, with everything in the Pro+ plan (up to 5GB of storage during the trial)",
      "Toward the end of the trial a reminder to choose a plan appears on the home screen, and an email is sent a day before it ends. At the end you choose a plan and pay, and everything you added is kept",
      "One free trial per phone number",
    ],
    ru: [
      "Пробный период: новые фотографы получают 14 дней бесплатно, без кредитной карты, со всеми возможностями тарифа Про+ (до 5 ГБ хранилища на время пробного периода)",
      "Ближе к концу пробного периода на главном экране появляется напоминание выбрать тариф, а за день до окончания приходит письмо. В конце вы выбираете тариф и оплачиваете, и всё, что вы внесли, сохраняется",
      "Один пробный период на номер телефона",
    ],
  },
  {
    version: "2.11.57",
    date: "2026-09-24",
    changes: [
      "כל סרטוני ההדרכה (הגדרות → מדריכים, ובכל מסך) צולמו מחדש בעיצוב החדש, כולל סרטון הסיור במערכת",
    ],
    en: [
      "All guide videos (Settings → Guides, and on every screen) were re-recorded in the new design, including the system tour video",
    ],
    ru: [
      "Все обучающие видео (Настройки → Руководства и на каждом экране) перезаписаны в новом дизайне, включая видео-обзор системы",
    ],
  },
  {
    version: "2.11.56",
    date: "2026-09-24",
    changes: [
      "לידים, פורטל לקוח ורשימת המתנה: רשימה אחת נקייה במקום כרטיס נפרד לכל שורה. הטלפון בשורה משלו, ובפורטל לקוח יש עמודת תאריך כמו במסך הבית",
      "מחיקת ליד עברה לתפריט שלוש הנקודות, עם אישור לפני המחיקה, כדי שלא יימחק ליד בטעות",
      "דשבורד: ההכנסות של התקופה מוצגות פעם אחת, מול הצפי, ומתחתיהן כמה עוד ממתין לתשלום",
      "ניהול גלריה: כפתור העתקת הקישור מופיע פעם אחת (למטה, ליד שיתוף), ותמונה שנמצאת בפורטפוליו מסומנת באייקון גלובוס",
    ],
    en: [
      "Leads, client portal and waitlist: one clean list instead of a separate card for each row. The phone is on its own line, and the client portal has a date column like the home screen",
      "Deleting a lead moved to the three-dot menu, with a confirmation before deleting, so no lead gets deleted by mistake",
      "Dashboard: the period's income is shown once, against the forecast, with how much is still awaiting payment below it",
      "Gallery management: the copy-link button appears once (at the bottom, next to share), and a photo that's in your portfolio is marked with a globe icon",
    ],
    ru: [
      "Заявки, портал клиента и лист ожидания: один аккуратный список вместо отдельной карточки на каждую строку. Телефон на отдельной строке, а в портале клиента есть колонка даты, как на главном экране",
      "Удаление заявки перенесено в меню с тремя точками, с подтверждением перед удалением, чтобы заявку нельзя было удалить случайно",
      "Дашборд: доход за период показан один раз, рядом с прогнозом, а под ним — сколько ещё ожидает оплаты",
      "Управление галереей: кнопка копирования ссылки появляется один раз (внизу, рядом с «Поделиться»), а фото из портфолио отмечено значком глобуса",
    ],
  },
  {
    version: "2.11.55",
    date: "2026-09-24",
    changes: [
      "מסך הבית: בראש המסך מופיע עכשיו האירוע הבא: מתי, איפה, כמה נשאר לגבות ומה השלב הבא. ההכנסות של החודש עברו לשורה אחת מתחתיו",
      "רשימת האירועים: שם הלקוח בולט יותר, ובמקום \"0/1\" מופיע שם השלב הבא. כשכל השלבים הושלמו מופיע כפתור \"לסגירה\"",
      "כרטיס האירוע: פרטי האירוע (תאריך, מקום, טלפון) בשורות ברורות עם אייקונים, לחיצה על הטלפון מחייגת, ועריכה וסנכרון ליומן עברו לתפריט שלוש הנקודות",
      "כרטיס האירוע: בראש העמוד רואים באיזה שלב האירוע נמצא ומסמנים אותו כבוצע בלחיצה אחת. בתשלומים הסכומים מוצגים עם פסיקים (₪3,000), והערות נפתחות רק כשרוצים",
      "עיצוב נקי יותר בכל המערכת: פחות מסגרות וצללים, כפתור חזרה עגול בכל המסכים, וסכומים בפורמט אחיד (גם בפורטל הלקוח)",
    ],
    en: [
      "Home screen: the top now shows your next event: when, where, how much is left to collect and what the next stage is. The month's income moved to a single line below it",
      "Events list: the client's name stands out more, and instead of \"0/1\" you see the name of the next stage. When all stages are done, a \"To close\" button appears",
      "Event card: the event details (date, venue, phone) are on clear lines with icons, tapping the phone dials it, and editing and calendar sync moved to the three-dot menu",
      "Event card: the top of the page shows which stage the event is at, and you mark it done with one tap. Payment amounts are shown with commas (₪3,000), and notes open only when you want them",
      "A cleaner design across the system: fewer borders and shadows, a round back button on every screen, and amounts in a consistent format (in the client portal too)",
    ],
    ru: [
      "Главный экран: вверху теперь показано ваше ближайшее мероприятие — когда, где, сколько осталось получить и какой следующий этап. Доход за месяц перенесён в одну строку под ним",
      "Список мероприятий: имя клиента заметнее, а вместо «0/1» показано название следующего этапа. Когда все этапы выполнены, появляется кнопка «К закрытию»",
      "Карточка мероприятия: данные (дата, место, телефон) — в понятных строках со значками, нажатие на телефон набирает номер, а редактирование и синхронизация с календарём перенесены в меню с тремя точками",
      "Карточка мероприятия: вверху видно, на каком этапе мероприятие, и этап отмечается выполненным одним нажатием. Суммы платежей показаны с разделителями (₪3,000), а заметки открываются, только когда нужно",
      "Более чистый дизайн во всей системе: меньше рамок и теней, круглая кнопка «Назад» на всех экранах и единый формат сумм (в том числе в портале клиента)",
    ],
  },
  {
    version: "2.11.54",
    date: "2026-09-23",
    changes: [
      "מדריכים בווידאו: בהגדרות, ברשימה הנפתחת, נוסף \"מדריכים\" — כל סרטוני ההדרכה במקום אחד, כולל שלושה סרטונים חדשים: סיור בכל המערכת, עבודה עם הפורטפוליו, והסבר על ההגדרות",
      "כל סרטוני ההדרכה צולמו מחדש בעיצוב החדש, עם כתוביות גדולות וברורות יותר",
    ],
    en: [
      "Video guides: in Settings, in the dropdown list, there's now \"Guides\" — all the guide videos in one place, including three new ones: a tour of the whole system, working with the portfolio, and an explanation of the settings",
      "All guide videos were re-recorded in the new design, with bigger, clearer captions",
    ],
    ru: [
      "Видеоруководства: в настройках, в выпадающем списке, появился раздел «Руководства» — все обучающие видео в одном месте, включая три новых: обзор всей системы, работа с портфолио и объяснение настроек",
      "Все обучающие видео перезаписаны в новом дизайне, с более крупными и чёткими субтитрами",
    ],
  },
  {
    version: "2.11.53",
    date: "2026-09-23",
    changes: [
      "פורטפוליו ציבורי בעיצוב חדש: עמוד כהה ומקצועי בסגנון אתר צילום, עם רצועת תמונות גדולות בראש העמוד שמתחלפת אוטומטית כל כמה שניות, איזור היכרות שלכם, ולשוניות שמוצגות כתמונות. בנוסף, לקוחות שנכנסים לפורטפוליו כבר לא רואים את סרגל הניווט של האפליקציה ואת ההצעה להתקין אותה",
      "רצועת התמונות הראשית: בהגדרות → פורטפוליו ציבורי → \"תמונות לרצועה הראשית\" מסמנים בכוכב עד 25 תמונות — רק הן יופיעו ברצועה המתחלפת. בלי תמונות מסומנות, הרצועה לא תוצג",
      "פורטפוליו עם הרבה תמונות נטען מהר יותר: התמונות נטענות בהדרגה תוך כדי גלילה, במקום כולן בבת אחת",
      "שיתוף פורטפוליו: במסך השיתוף אפשר לבחור אילו לשוניות יוצגו בקישור — מי שיקבל את הקישור יראה רק את הלשוניות שבחרתם",
      "העלאת תמונות ישירות לפורטפוליו: תוקנה תקלה שבה ההעלאה נכשלה. בחירת הלשונית להעלאה היא עכשיו רשימה נפתחת של הלשוניות הקיימות, עם אפשרות אחרונה להוספת לשונית חדשה בטקסט חופשי",
      "\"טקסט פתיחה\" בהגדרות הפורטפוליו: נוסף הסבר — זה המקום להציג את עצמכם ללקוחות, והטקסט מופיע באיזור ההיכרות בעמוד הפורטפוליו",
      "ליטוש כללי באפליקציה: לחיצה על כפתורים חלקה יותר, חלונות וכרטיסים קריאים יותר, ואייקוני סגירה וחיצים אחידים בכל המסכים",
    ],
    en: [
      "A redesigned public portfolio: a dark, professional page in the style of a photography website, with a strip of large photos at the top that changes automatically every few seconds, an about-you section, and tabs shown as images. Also, clients visiting the portfolio no longer see the app's navigation bar or the prompt to install it",
      "The main photo strip: in Settings → Public portfolio → \"Photos for the main strip\", star up to 25 photos — only they will appear in the rotating strip. With no starred photos, the strip isn't shown",
      "Portfolios with many photos load faster: photos load gradually as you scroll, instead of all at once",
      "Sharing the portfolio: on the share screen you can choose which tabs appear in the link — whoever gets the link will see only the tabs you chose",
      "Uploading photos straight to the portfolio: fixed an issue where the upload failed. Choosing the upload tab is now a dropdown of your existing tabs, with a last option to add a new tab as free text",
      "\"Intro text\" in the portfolio settings: added an explanation — this is the place to introduce yourself to clients, and the text appears in the about section of the portfolio page",
      "General polish across the app: smoother button taps, more readable dialogs and cards, and consistent close icons and arrows on every screen",
    ],
    ru: [
      "Обновлённое публичное портфолио: тёмная профессиональная страница в стиле сайта фотографа, с лентой больших фото вверху, которая автоматически меняется каждые несколько секунд, блоком о вас и вкладками в виде изображений. Кроме того, клиенты в портфолио больше не видят панель навигации приложения и предложение его установить",
      "Главная лента фото: в Настройки → Публичное портфолио → «Фото для главной ленты» отметьте звёздочкой до 25 фото — только они появятся в сменяющейся ленте. Без отмеченных фото лента не показывается",
      "Портфолио с большим количеством фото загружается быстрее: фото подгружаются постепенно при прокрутке, а не все сразу",
      "Ссылка на портфолио: на экране «Поделиться» можно выбрать, какие вкладки будут видны по ссылке — получатель увидит только выбранные вами вкладки",
      "Загрузка фото прямо в портфолио: исправлена ошибка, из-за которой загрузка не удавалась. Выбор вкладки для загрузки теперь — выпадающий список существующих вкладок, с последним пунктом для добавления новой вкладки свободным текстом",
      "«Вступительный текст» в настройках портфолио: добавлено пояснение — здесь вы представляете себя клиентам, а текст появляется в блоке «О себе» на странице портфолио",
      "Общая шлифовка приложения: более плавные нажатия кнопок, более читаемые окна и карточки, единые значки закрытия и стрелки на всех экранах",
    ],
  },
  {
    version: "2.11.52",
    date: "2026-09-22",
    changes: [
      "בונה הצעות מחיר (עוסק מורשה בלבד): נוסף \"עיגול מחיר\" ליד הסכום הכולל מע\"מ — מזינים את המחיר העגול הרצוי, והמערכת מתאימה אוטומטית את אחד הספקים (שמחירו מעל 200 ₪) כך שהסכום הסופי כולל המע\"מ יהיה בדיוק המחיר שביקשתם",
    ],
    en: [
      "Price quote builder (VAT-registered only): added \"Round price\" next to the total including VAT — enter the round price you want, and the system automatically adjusts one of the vendors (priced above ₪200) so the final total including VAT is exactly the price you asked for",
    ],
    ru: [
      "Конструктор ценовых предложений (только для плательщиков НДС): рядом с суммой с НДС появилось «Округление цены» — введите желаемую круглую цену, и система автоматически скорректирует одного из поставщиков (дороже ₪200), чтобы итог с НДС был ровно таким, как вы указали",
    ],
  },
  {
    version: "2.11.51",
    date: "2026-09-22",
    changes: [
      "אירועים: יצירת אירוע (בטופס, בשאלון ללקוח/ה, ובייבוא מיומן Google) כבר לא יוצרת אוטומטית גלריית תמונות לאירוע — גלריה נוצרת רק כשלוחצים במפורש על \"יצירה/קישור גלריה\" בכרטיס האירוע, כדי שגלריות טיוטה לא יופיעו יותר בעמוד הגלריות בלי שביקשתם אותן",
    ],
    en: [
      "Events: creating an event (in the form, in the client questionnaire, or when importing from Google Calendar) no longer automatically creates a photo gallery for it — a gallery is created only when you explicitly tap \"Create/link gallery\" on the event card, so draft galleries no longer show up on the galleries page without you asking for them",
    ],
    ru: [
      "Мероприятия: создание мероприятия (в форме, через анкету клиента или при импорте из Google Календаря) больше не создаёт галерею автоматически — галерея создаётся только при явном нажатии «Создать/привязать галерею» в карточке мероприятия, чтобы черновые галереи не появлялись на странице галерей без вашего запроса",
    ],
  },
  {
    version: "2.11.50",
    date: "2026-09-20",
    changes: [
      "סגירת אירוע והכנסות: כשסוגרים אירוע, היתרה שעדיין לא שולמה מתווספת לגרף ההכנסות החודשי, ותשלום חלקי שכבר סומן נשאר בחודש שבו נרשם. אם סומן תשלום חלקי — החלק שנותר לתשלום מתווסף לחודש סגירת האירוע (למשל אירוע שנסגר באוגוסט מוסיף את שארית היתרה לאוגוסט). אם לא סומן תשלום חלקי והאירוע נשמר בחודש אחר מחודש הסגירה, מופיע מסך במרכז המסך לבחירת החודש (חודש שמירת האירוע או חודש סגירת האירוע) עם אישור סופי, ורק אז האירוע נסגר. כשחודש השמירה וחודש הסגירה זהים, היתרה מתווספת ישר בלי לשאול. החישוב מתעדכן גם במסך הבית ובמסך ניתוח העסק, והיתרה שנוספה להכנסות כבר לא נספרת שוב ב״צפי״ וב״תשלומים צפויים״. שחזור אירוע מבטל את התוספת",
    ],
    en: [
      "Closing an event and income: when you close an event, the unpaid balance is added to the monthly income chart, and a partial payment already marked stays in the month it was recorded. If a partial payment was marked, the remaining amount is added to the month the event was closed (e.g. an event closed in August adds the rest of the balance to August). If no partial payment was marked and the event was saved in a different month from the closing month, a dialog in the middle of the screen lets you choose the month (the month the event was saved or the month it was closed) with a final confirmation, and only then is the event closed. When the saved month and closing month are the same, the balance is added right away without asking. The calculation updates on the home screen and in business analytics too, and the balance added to income is no longer counted again in the \"Forecast\" and \"Expected payments\". Restoring the event cancels the addition",
    ],
    ru: [
      "Закрытие мероприятия и доход: при закрытии мероприятия неоплаченный остаток добавляется в график месячного дохода, а уже отмеченная частичная оплата остаётся в месяце, когда она была записана. Если была отмечена частичная оплата, оставшаяся сумма добавляется в месяц закрытия мероприятия (например, мероприятие, закрытое в августе, добавляет остаток в август). Если частичная оплата не отмечалась и мероприятие было сохранено в другом месяце, чем месяц закрытия, в центре экрана появляется окно для выбора месяца (месяц сохранения или месяц закрытия) с окончательным подтверждением, и только после этого мероприятие закрывается. Если месяц сохранения и месяц закрытия совпадают, остаток добавляется сразу, без вопроса. Расчёт обновляется и на главном экране, и в бизнес-аналитике, а добавленный в доход остаток больше не учитывается повторно в «Прогнозе» и «Ожидаемых платежах». Восстановление мероприятия отменяет добавление",
    ],
  },
  {
    version: "2.11.49",
    date: "2026-09-20",
    changes: [
      "סגירת אירוע: נוסף כפתור \"סגירת אירוע\" בכרטיס האירוע (מתחת לשם החבילה ולפני יומן ההתראות) וגם בכרטיס האירוע במסך הבית — אפשר לסגור אירוע בלי להיכנס אליו. הסגירה דורשת אישור בחלון במרכז המסך שמסביר מה יקרה, גם כשיש שלבים פתוחים (הם נשארים פתוחים). סימון כל השלבים כבר לא סוגר את האירוע, ורק סגירה מפורשת מעבירה אותו לרשימת ״הושלמו״. אירוע סגור אפשר לשחזר מכרטיס האירוע בלחיצה על \"שחזור אירוע\"",
      "שלב \"מסירה סופית\": סימון השלב כבוצע רק מסמן אותו, בלי לפתוח מיד הודעת וואטסאפ — שליחת ההודעה ללקוח/ה נעשית בכפתור \"שליחת עדכון\" כמו בכל שלב אחר",
      "מדריך למשתמש בכרטיס האירוע (עברית, אנגלית ורוסית): הסבר על כל חלק במסך ואיך מסמנים שלבים — בלחיצה אחת, בלי לחיצה כפולה",
      "תזכורת מעקב אחרי הצעת מחיר ושאר ההתראות לשליחת הודעה מופיעות עכשיו במרכז המסך ולא בתחתית. נוסח ההודעה ללקוח/ה עודכן ומסתיים בחתימה האישית שלכם",
    ],
    en: [
      "Closing an event: added a \"Close event\" button on the event card (below the package name and before the notification log) and on the event card on the home screen — you can close an event without opening it. Closing requires confirmation in a dialog in the middle of the screen that explains what will happen, even when there are open stages (they stay open). Marking all stages no longer closes the event; only an explicit close moves it to the \"Completed\" list. A closed event can be restored from the event card by tapping \"Restore event\"",
      "The \"Final delivery\" stage: marking it as done only marks it, without immediately opening a WhatsApp message — sending the message to the client is done with the \"Send update\" button, like any other stage",
      "A user guide on the event card (Hebrew, English and Russian): an explanation of every part of the screen and how to mark stages — with a single tap, no double tap",
      "The price quote follow-up reminder and other prompts to send a message now appear in the middle of the screen instead of the bottom. The message text to the client was updated and ends with your personal signature",
    ],
    ru: [
      "Закрытие мероприятия: добавлена кнопка «Закрыть мероприятие» в карточке мероприятия (под названием пакета, перед журналом уведомлений) и в карточке мероприятия на главном экране — мероприятие можно закрыть, не открывая его. Закрытие требует подтверждения в окне в центре экрана, которое объясняет, что произойдёт, даже если есть открытые этапы (они остаются открытыми). Отметка всех этапов больше не закрывает мероприятие — только явное закрытие переносит его в список «Завершённые». Закрытое мероприятие можно восстановить из карточки кнопкой «Восстановить мероприятие»",
      "Этап «Финальная сдача»: отметка этапа как выполненного только отмечает его, не открывая сразу сообщение в WhatsApp — сообщение клиенту отправляется кнопкой «Отправить обновление», как на любом другом этапе",
      "Руководство пользователя в карточке мероприятия (иврит, английский и русский): объяснение каждой части экрана и того, как отмечать этапы — одним нажатием, без двойного",
      "Напоминание о повторном контакте по ценовому предложению и другие подсказки отправить сообщение теперь появляются в центре экрана, а не внизу. Текст сообщения клиенту обновлён и заканчивается вашей личной подписью",
    ],
  },
  {
    version: "2.11.48",
    date: "2026-09-20",
    changes: [
      "וידאו בגלריה: ההעלאה זמינה במסלולי פרו ופרו+ בלבד (במסלול פרו סטארט היא אינה זמינה). גודל קובץ מקסימלי: עד 300MB לקובץ במסלול פרו, ועד 500MB לקובץ במסלול פרו+ — קבצים גדולים מהמותר מסומנים לפני ההעלאה ולא נשלחים",
    ],
    en: [
      "Video in the gallery: uploading is available on the Pro and Pro+ plans only (not on Pro Start). Maximum file size: up to 300MB per file on Pro, and up to 500MB per file on Pro+ — files larger than allowed are flagged before the upload and not sent",
    ],
    ru: [
      "Видео в галерее: загрузка доступна только на тарифах Про и Про+ (на Про Старт недоступна). Максимальный размер файла: до 300 МБ на Про и до 500 МБ на Про+ — слишком большие файлы помечаются до загрузки и не отправляются",
    ],
  },
  {
    version: "2.11.47",
    date: "2026-09-20",
    changes: [
      "כרטיס האירוע: נוסף שדה \"סוג האירוע\" (למשל עלייה לתורה) בטופס אירוע חדש ובעריכת האירוע — האירוע מוצג בכרטיס, ברשימה ובמסך האירוע בצורה \"סוג האירוע - שם הלקוח/ה\", למשל: עלייה לתורה - יוני כהן. ההודעות ללקוח, החוזים והגלריה ממשיכים להשתמש בשם הלקוח בלבד. אירועים שנוצרים מליד או מהצעת מחיר ממלאים את הסוג אוטומטית",
    ],
    en: [
      "Event card: added an \"Event type\" field (e.g. Torah reading) in the new event form and when editing an event — the event is shown on the card, in the list and on the event screen as \"Event type - client name\", for example: Torah reading - Yoni Cohen. Client messages, contracts and the gallery keep using the client's name only. Events created from a lead or a price quote fill in the type automatically",
    ],
    ru: [
      "Карточка мероприятия: добавлено поле «Тип мероприятия» (например, чтение Торы) в форме нового мероприятия и при редактировании — мероприятие показывается в карточке, в списке и на экране мероприятия в виде «Тип мероприятия - имя клиента», например: Чтение Торы - Йони Коэн. Сообщения клиенту, договоры и галерея по-прежнему используют только имя клиента. Мероприятия, созданные из заявки или ценового предложения, заполняют тип автоматически",
    ],
  },
  {
    version: "2.11.46",
    date: "2026-09-17",
    changes: [
      "חבילות מותאמות אישית: אפשר עכשיו לשמור חבילה חדשה עם שם בלבד, בלי להוסיף אף שלב — אפשר להוסיף שלבים בכל שלב מאוחר יותר",
      "בונה הצעות מחיר: סטטוס העוסק (עוסק פטור/מורשה) מוגדר כברירת מחדל לפי ההגדרה בהגדרות → חשבוניות ללקוחות, במקום שמתחיל תמיד על \"עוסק מורשה\" — עדיין ניתן לשנות לכל הצעה בנפרד",
      "הגדרות: תוקן באג שגרם לבחירת סטטוס עוסק (פטור/מורשה) לא להישמר בפועל אם לא היה מחובר ספק חשבוניות — הבחירה נראתה מסומנת במסך אבל חזרה למצב הקודם אחרי רענון",
      "מסך הבית: גרף ההכנסות הוחלף בתצוגת צפי לחודש הנוכחי בלבד — סכום שהתקבל מול צפי כולל לסוף החודש, בלי שורת \"ממתין לתשלום\" נפרדת שבלבלה מול הצפי",
      "מסך הדשבורד (ניתוח עסקי): נוסף כרטיס \"צפי הכנסות\" עם אפשרות מעבר בין תצוגת חודש לתצוגת שנה שלמה",
    ],
    en: [
      "Custom packages: you can now save a new package with just a name, without adding any stage — you can add stages at any point later",
      "Price quote builder: the business status (VAT-exempt/VAT-registered) now defaults to your setting in Settings → Client invoices, instead of always starting on \"VAT-registered\" — you can still change it for each quote",
      "Settings: fixed a bug where the business status choice (exempt/registered) wasn't actually saved if no invoice provider was connected — the choice looked selected on screen but reverted after a refresh",
      "Home screen: the income chart was replaced with a forecast view for the current month only — amount received against the total forecast for the end of the month, without a separate \"Awaiting payment\" line that was confusing next to the forecast",
      "Dashboard (business analytics): added an \"Income forecast\" card with a switch between a month view and a full-year view",
    ],
    ru: [
      "Индивидуальные пакеты: теперь можно сохранить новый пакет только с названием, не добавляя ни одного этапа — этапы можно добавить в любой момент позже",
      "Конструктор ценовых предложений: статус бизнеса (освобождён от НДС / плательщик НДС) по умолчанию берётся из Настройки → Счета клиентам, а не всегда «Плательщик НДС» — его по-прежнему можно изменить для каждого предложения",
      "Настройки: исправлена ошибка, из-за которой выбор статуса бизнеса не сохранялся, если не был подключён сервис счетов — выбор выглядел отмеченным, но после обновления возвращался назад",
      "Главный экран: график дохода заменён прогнозом только на текущий месяц — полученная сумма против общего прогноза на конец месяца, без отдельной строки «Ожидает оплаты», которая путала рядом с прогнозом",
      "Дашборд (бизнес-аналитика): добавлена карточка «Прогноз дохода» с переключением между видом за месяц и за весь год",
    ],
  },
  {
    version: "2.11.45",
    date: "2026-09-16",
    changes: [
      "בכלי עיצוב האלבומים: תוקן באג שגרם לתיבות טקסט חדשות להתווסף תמיד באותו מיקום בדיוק — כל תיבה חדשה נופלת עכשיו במיקום קצת אחר, כדי שלא ייווצר חפיפה מוחלטת בין שתי תיבות טקסט",
      "בכלי עיצוב האלבומים: גובה תיבת הטקסט מותאם עכשיו לגודל הגופן בפועל — גם ביצירת טקסט חדש וגם בהגדלה/הקטנה מאוחרת יותר, במקום גובה קבוע שהיה גדול מדי לטקסט רגיל וקטן מדי לגופן גדול",
      "נוספו עמודי תקנון שימוש ומדיניות ביטולים עצמאיים, ועמוד פרטי העסק הושלם עם מספר עוסק מורשה וכתובת",
    ],
    en: [
      "In the album designer: fixed a bug where new text boxes were always added in exactly the same spot — each new box now lands in a slightly different spot, so two text boxes don't overlap completely",
      "In the album designer: the text box height now fits the actual font size — both when creating new text and when enlarging/shrinking it later, instead of a fixed height that was too big for regular text and too small for a large font",
      "Added standalone terms of use and cancellation policy pages, and the business details page was completed with the VAT registration number and address",
    ],
    ru: [
      "В редакторе альбомов: исправлена ошибка, из-за которой новые текстовые блоки всегда добавлялись в одно и то же место — теперь каждый новый блок появляется чуть в другом месте, чтобы два блока не накладывались полностью",
      "В редакторе альбомов: высота текстового блока теперь подстраивается под реальный размер шрифта — и при создании, и при последующем увеличении или уменьшении, вместо фиксированной высоты, которая была велика для обычного текста и мала для крупного шрифта",
      "Добавлены отдельные страницы условий использования и политики отмены, а страница с данными бизнеса дополнена номером плательщика НДС и адресом",
    ],
  },
  {
    version: "2.11.44",
    date: "2026-09-16",
    changes: [
      "בכלי עיצוב האלבומים: תוקן סופית באג שגרם לטקסט בעברית להיראות הפוך/מעורבב בייצוא JPG, PSD ו-PDF — אומת מול נתונים אמיתיים",
      "בכלי עיצוב האלבומים: תוקן סופית באג שגרם לעיוות בכריכה מרובעת כשהחלון פתוח על כל המסך — אומת בבדיקה ישירה",
      "בכלי עיצוב האלבומים: נוסף כפתור עגול עם האות T להוספת טקסט, בנוסף לפאנל עריכת הטקסט הצף",
      "בכלי עיצוב האלבומים: גבולות העמוד קשיחים עכשיו לחלוטין — לא ניתן יותר לגרור תמונה או טקסט מחוץ לגבולות הדף מאף כיוון",
      "בכלי עיצוב האלבומים: נוסף זום לתמונת רקע, בדיוק כמו בתמונה רגילה",
      "בכלי עיצוב האלבומים: מיון תמונות בפאנל הגרירה הפך לרשימה נפתחת במקום כפתור מחזורי",
      "נוספו עמודי מדיניות פרטיות מורחבת, מדיניות עוגיות, הצהרת נגישות ופרטי העסק, עם קישורים בתחתית דף הנחיתה",
    ],
    en: [
      "In the album designer: finally fixed a bug where Hebrew text looked reversed/jumbled in JPG, PSD and PDF exports — verified against real data",
      "In the album designer: finally fixed a bug that distorted a square cover when the window was full screen — verified with a direct test",
      "In the album designer: added a round button with the letter T for adding text, in addition to the floating text editing panel",
      "In the album designer: page boundaries are now completely firm — a photo or text can no longer be dragged outside the page from any direction",
      "In the album designer: added zoom for the background photo, just like a regular photo",
      "In the album designer: photo sorting in the drag panel is now a dropdown instead of a cycling button",
      "Added extended privacy policy, cookie policy, accessibility statement and business details pages, with links at the bottom of the landing page",
    ],
    ru: [
      "В редакторе альбомов: окончательно исправлена ошибка, из-за которой текст на иврите выглядел перевёрнутым или перемешанным при экспорте в JPG, PSD и PDF — проверено на реальных данных",
      "В редакторе альбомов: окончательно исправлено искажение квадратной обложки при окне на весь экран — проверено напрямую",
      "В редакторе альбомов: добавлена круглая кнопка с буквой T для добавления текста, в дополнение к плавающей панели редактирования текста",
      "В редакторе альбомов: границы страницы теперь полностью жёсткие — фото или текст больше нельзя вытащить за пределы страницы ни с какой стороны",
      "В редакторе альбомов: добавлен зум для фонового фото, как для обычного фото",
      "В редакторе альбомов: сортировка фото в панели перетаскивания теперь — выпадающий список вместо циклической кнопки",
      "Добавлены страницы расширенной политики конфиденциальности, политики cookie, заявления о доступности и данных бизнеса, со ссылками внизу лендинга",
    ],
  },
  {
    version: "2.11.43",
    date: "2026-09-16",
    changes: [
      "בכלי עיצוב האלבומים: תוקן באג שגרם לפעמים לייצוא PDF/JPG לרוץ מול גרסה ישנה של שרת הרינדור בלי שהמערכת תבחין בכך — מנגנון בדיקת העדכניות שופר כך שיזהה כל שינוי רלוונטי בקוד הרינדור",
      "בכלי עיצוב האלבומים: ייצוא PDF שנתקל בשרת רינדור לא מוכן כבר לא נכשל מיד — המערכת מנסה שוב ברקע עד שהשרת מוכן, בזמן שמסך ההתקדמות עם הספינר נשאר פתוח למשתמש",
      "בכלי עיצוב האלבומים: תוקן באג שגרם לטקסט בעברית להיראות הפוך/מעורבב בייצוא JPG ו-PSD",
      "בכלי עיצוב האלבומים: פאנל עריכת הטקסט עבר לפאנל צף שנפתח בסלייד מעל אזור העריכה (כמו פאנל עריכת תמונה), עם כפתור ייעודי (T) בתפריט העיגול של הטקסט הנבחר, במקום להופיע מתחת לכפתורי הפעולה",
      "בכלי עיצוב האלבומים: תוקן באג שגרם לעיוות בכריכה מרובעת כשהחלון פתוח על כל המסך — הקנבס שומר עכשיו על יחס הגובה-רוחב הנכון בכל רוחב חלון",
      "דף הנחיתה: מסלול הכניסה הזול שונה שם ל\"פרו סטארט\", כותרת ראשית חדשה קצרה וממוקדת יותר, ונוספו 4 שאלות נפוצות חדשות",
      "דף הנחיתה: תוכן ה\"פרטים\" בכרטיסי התכונות מוצג עכשיו כנקודות ממוקדות במקום פסקת טקסט",
      "מסלולי המנוי: נפח אחסון, מספר חברי צוות ומשך שמירת גלריה עודכנו — פרו סטארט (100GB, חבר צוות אחד, 14 יום), פרו (750GB, עד 2 חברי צוות, עד 90 יום), פרו+ (ללא הגבלה, עד 3 חברי צוות, עד שנה)",
      "וידאו בגלריה, פורטפוליו ציבורי ועורך אלבומים זמינים עכשיו ממסלול פרו ומעלה",
    ],
    en: [
      "In the album designer: fixed a bug where PDF/JPG exports sometimes ran against an old version of the rendering server without the system noticing — the up-to-date check was improved to catch every relevant change in the rendering code",
      "In the album designer: a PDF export that hits a rendering server that isn't ready no longer fails immediately — the system retries in the background until the server is ready, while the progress screen with the spinner stays open",
      "In the album designer: fixed a bug where Hebrew text looked reversed/jumbled in JPG and PSD exports",
      "In the album designer: the text editing panel moved to a floating panel that slides open over the editing area (like the photo editing panel), with a dedicated button (T) in the selected text's circle menu, instead of appearing below the action buttons",
      "In the album designer: fixed a bug that distorted a square cover when the window was full screen — the canvas now keeps the correct aspect ratio at any window width",
      "Landing page: the entry-level plan was renamed \"Pro Start\", a new shorter and more focused headline, and 4 new FAQs were added",
      "Landing page: the \"details\" in the feature cards are now shown as focused bullet points instead of a paragraph",
      "Subscription plans: storage, number of team members and gallery retention were updated — Pro Start (100GB, one team member, 14 days), Pro (750GB, up to 2 team members, up to 90 days), Pro+ (unlimited, up to 3 team members, up to a year)",
      "Video in the gallery, the public portfolio and the album editor are now available from the Pro plan and up",
    ],
    ru: [
      "В редакторе альбомов: исправлена ошибка, из-за которой экспорт PDF/JPG иногда шёл через старую версию сервера рендеринга незаметно для системы — проверка актуальности улучшена и замечает любое значимое изменение в коде рендеринга",
      "В редакторе альбомов: экспорт PDF, наткнувшийся на неготовый сервер рендеринга, больше не падает сразу — система повторяет попытку в фоне, пока сервер не будет готов, а экран прогресса со спиннером остаётся открытым",
      "В редакторе альбомов: исправлена ошибка, из-за которой текст на иврите выглядел перевёрнутым или перемешанным при экспорте в JPG и PSD",
      "В редакторе альбомов: панель редактирования текста стала плавающей и выезжает поверх области редактирования (как панель редактирования фото), с отдельной кнопкой (T) в круговом меню выбранного текста, вместо того чтобы появляться под кнопками действий",
      "В редакторе альбомов: исправлено искажение квадратной обложки при окне на весь экран — холст теперь сохраняет правильные пропорции при любой ширине окна",
      "Лендинг: начальный тариф переименован в «Про Старт», новый более короткий и точный заголовок, добавлены 4 новых частых вопроса",
      "Лендинг: «подробности» в карточках возможностей теперь показаны короткими пунктами, а не абзацем",
      "Тарифы подписки обновлены по объёму хранилища, числу членов команды и сроку хранения галереи — Про Старт (100 ГБ, один член команды, 14 дней), Про (750 ГБ, до 2 членов команды, до 90 дней), Про+ (без ограничений, до 3 членов команды, до года)",
      "Видео в галерее, публичное портфолио и редактор альбомов теперь доступны с тарифа Про и выше",
    ],
  },
  {
    version: "2.11.42",
    date: "2026-09-15",
    changes: [
      "בכלי עיצוב האלבומים: תוקן באג שגרם לשינוי גודל של מספר תמונות מסומנות לפעול לפי התמונה שנגררה בלבד — עכשיו כל התמונות המסומנות משתנות יחד כקבוצה אחידה, לא משנה מאיזו תמונה גוררים",
      "בבחירת תמונת שער לגלריה: כלי מיקוד התמונה מציג עכשיו את הצורה שנבחרה בפועל (ריבוע/מלבן/וכו׳) במקום צורה קבועה, כך שאין יותר חוסר התאמה בין מה שממקדים לתצוגה הסופית",
      "ייצוא אלבום (JPG/PDF/PSD): הוסרה האפשרות להמשיך ייצוא ברקע — מסך ההתקדמות נשאר פתוח עד לסיום או לביטול. בנוסף, ההגבלה של \"ייצוא פעיל אחד בלבד\" הורחבה מרמת הגלריה לרמת המשתמש כולו — אם יש ייצוא פעיל בגלריה כלשהי, לחיצה על כפתור ייצוא בגלריה אחרת תציג את אותה פעולת ייצוא במקום להתחיל אחת חדשה",
    ],
    en: [
      "In the album designer: fixed a bug where resizing several selected photos followed only the dragged photo — now all selected photos resize together as one group, no matter which photo you drag",
      "Choosing a gallery cover photo: the focus tool now shows the shape actually chosen (square/rectangle/etc.) instead of a fixed shape, so there's no mismatch between what you focus and the final display",
      "Album export (JPG/PDF/PSD): removed the option to continue the export in the background — the progress screen stays open until it finishes or you cancel. Also, the \"one active export only\" limit was extended from the gallery level to your whole account — if there's an active export in any gallery, tapping export in another gallery shows that export instead of starting a new one",
    ],
    ru: [
      "В редакторе альбомов: исправлена ошибка, из-за которой изменение размера нескольких выбранных фото следовало только за перетаскиваемым фото — теперь все выбранные фото меняются вместе, как одна группа, независимо от того, какое фото вы тянете",
      "Выбор обложки галереи: инструмент фокусировки теперь показывает реально выбранную форму (квадрат, прямоугольник и т. д.) вместо фиксированной, так что фокус совпадает с итоговым видом",
      "Экспорт альбома (JPG/PDF/PSD): убрана возможность продолжить экспорт в фоне — экран прогресса остаётся открытым до завершения или отмены. Кроме того, ограничение «только один активный экспорт» расширено с уровня галереи на весь аккаунт — если в любой галерее идёт экспорт, кнопка экспорта в другой галерее покажет его, а не запустит новый",
    ],
  },
  {
    version: "2.11.41",
    date: "2026-09-15",
    changes: [
      "בכלי עיצוב האלבומים: בחירת תמונה כרקע לעמוד כבר לא מסמנת אותה כ\"בשימוש\" — התמונה תמשיך להיות זמינה לבחירה עד שתשולב בפועל במסגרת באחד מדפי האלבום",
      "בכלי עיצוב האלבומים: כפתור \"הצג הכל\" בפאנל הגרירה (כבוי כברירת מחדל) מאפשר עכשיו לשלב גם תמונות שכבר שולבו בעמודים אחרים באלבום, לא רק באותו עמוד",
    ],
    en: [
      "In the album designer: choosing a photo as a page background no longer marks it as \"used\" — the photo stays available until it's actually placed in a frame on one of the album's pages",
      "In the album designer: the \"Show all\" button in the drag panel (off by default) now also lets you place photos already used on other pages of the album, not just on the same page",
    ],
    ru: [
      "В редакторе альбомов: выбор фото фоном страницы больше не отмечает его как «использованное» — фото остаётся доступным, пока его действительно не поместят в рамку на одной из страниц альбома",
      "В редакторе альбомов: кнопка «Показать все» в панели перетаскивания (по умолчанию выключена) теперь позволяет использовать и фото, уже размещённые на других страницах альбома, а не только на этой же",
    ],
  },
  {
    version: "2.11.40",
    date: "2026-09-15",
    changes: [
      "בכלי עיצוב האלבומים: תפריט העיגול של תמונה חזר להתנהגות הקודמת שלו (בוטלו קיצורי המקלדת וההקטנה האוטומטית של תפריט העיגול שנוספו בעדכון הקודם)",
      "בכלי עיצוב האלבומים: פאנל עריכת התמונה זז 5 ס״מ שמאלה",
      "בכלי עיצוב האלבומים: תזוזת אלמנטים עם חצי המקלדת היא עכשיו 2 פיקסלים קבועים בכל לחיצה",
      "בכלי עיצוב האלבומים: הגבול העליון והתחתון של תפריט העיגול מוגבלים עכשיו לגבולות העמוד, בכל גודל מסך",
      "בכלי עיצוב האלבומים: לחיצה על \"צל וקו מתאר\" בתפריט העיגול פותחת פאנל בלי גלילה, מעל מיקום פאנל עריכת התמונה (כולל אם הוזז)",
      "בכלי עיצוב האלבומים: אם גוררים את פאנל עריכת התמונה למיקום חדש בעמוד מסוים, המיקום נשמר גם בשאר עמודי אותו אלבום",
      "בכלי עיצוב האלבומים: נוסף כפתור עליון חדש בתפריט העיגול שפותח את פאנל עריכת התמונה — הפאנל כבר לא נפתח אוטומטית עם בחירת תמונה",
    ],
    en: [
      "In the album designer: a photo's circle menu is back to its previous behavior (the keyboard shortcuts and auto-shrinking of the circle menu added in the previous update were removed)",
      "In the album designer: the photo editing panel moved 5 cm to the left",
      "In the album designer: moving elements with the keyboard arrows is now a fixed 2 pixels per press",
      "In the album designer: the top and bottom edges of the circle menu are now kept within the page, at any screen size",
      "In the album designer: tapping \"Shadow and outline\" in the circle menu opens a panel without scrolling, above the photo editing panel's position (even if it was moved)",
      "In the album designer: if you drag the photo editing panel to a new spot on one page, that position is kept on the album's other pages too",
      "In the album designer: a new top button in the circle menu opens the photo editing panel — the panel no longer opens automatically when you select a photo",
    ],
    ru: [
      "В редакторе альбомов: круговое меню фото вернулось к прежнему поведению (горячие клавиши и автоматическое уменьшение кругового меню, добавленные в прошлом обновлении, убраны)",
      "В редакторе альбомов: панель редактирования фото сдвинута на 5 см влево",
      "В редакторе альбомов: перемещение элементов стрелками клавиатуры теперь — фиксированные 2 пикселя за нажатие",
      "В редакторе альбомов: верхний и нижний края кругового меню теперь не выходят за пределы страницы при любом размере экрана",
      "В редакторе альбомов: «Тень и контур» в круговом меню открывает панель без прокрутки, над местом панели редактирования фото (даже если её сдвинули)",
      "В редакторе альбомов: если перетащить панель редактирования фото на новое место на одной странице, это положение сохраняется и на остальных страницах альбома",
      "В редакторе альбомов: новая верхняя кнопка в круговом меню открывает панель редактирования фото — панель больше не открывается автоматически при выборе фото",
    ],
  },
  {
    version: "2.11.39",
    date: "2026-09-15",
    changes: [
      "בכלי עיצוב האלבומים: תוקן באג שגרם לשינוי גודל של מספר תמונות מסומנות (\"הצגה בגודל נכון\") לחרוג מגבולות העמוד",
      "בכלי עיצוב האלבומים: פאנל עריכת התמונה נפתח עכשיו ממש מעל אזור התמונות, ולא יורד יותר מתחת לשורת הכפתורים",
      "בכלי עיצוב האלבומים: לתפריט העיגול של תמונה נוספו קיצורי מקלדת (מוצגים במעבר עכבר מעל כל כפתור), עם אפשרות להגדיר קיצור אישי לכל פעולה",
      "בכלי עיצוב האלבומים: תפריט העיגול מצטמצם אוטומטית כשצריך, כולל בסימון כמה תמונות יחד ובמסך שולחני, כדי שלא יחרוג מגבולות העמוד",
      "בכלי עיצוב האלבומים: החזקת Alt בזמן גרירת נקודת שינוי גודל (של תמונה, צורה או עיטור) משנה את הגודל באופן סימטרי משני הצדדים",
    ],
    en: [
      "In the album designer: fixed a bug where resizing several selected photos (\"Show at correct size\") went beyond the page boundaries",
      "In the album designer: the photo editing panel now opens right above the photo area, and no longer drops below the button row",
      "In the album designer: keyboard shortcuts were added to a photo's circle menu (shown when hovering over each button), with the option to set a personal shortcut for each action",
      "In the album designer: the circle menu shrinks automatically when needed, including when several photos are selected and on desktop, so it doesn't go beyond the page",
      "In the album designer: holding Alt while dragging a resize handle (of a photo, shape or ornament) resizes symmetrically on both sides",
    ],
    ru: [
      "В редакторе альбомов: исправлена ошибка, из-за которой изменение размера нескольких выбранных фото («Показать в правильном размере») выходило за границы страницы",
      "В редакторе альбомов: панель редактирования фото теперь открывается прямо над областью фото и больше не опускается под ряд кнопок",
      "В редакторе альбомов: в круговое меню фото добавлены горячие клавиши (видны при наведении на каждую кнопку) с возможностью задать свою клавишу для каждого действия",
      "В редакторе альбомов: круговое меню при необходимости уменьшается автоматически, в том числе при выборе нескольких фото и на компьютере, чтобы не выходить за пределы страницы",
      "В редакторе альбомов: удерживая Alt при перетаскивании маркера размера (фото, фигуры или украшения), размер меняется симметрично с обеих сторон",
    ],
  },
  {
    version: "2.11.38",
    date: "2026-09-15",
    changes: [
      "בכלי עיצוב האלבומים: תוקן באג שגרם לסימון מספר תמונות ולחיצה על \"הצגה בגודל נכון\" לגדול זו לתוך זו על חשבון הרווחים ביניהן",
      "בכלי עיצוב האלבומים: נוסף כפתור חזרה עגול לפאנל עריכת התמונה, גודלו ההתחלתי גדל (אורך +7 ס״מ, רוחב +5 ס״מ), הוא נפתח מעל אזור התמונות, וגרירתו כבר לא מסמנת טקסט בשאר המסך",
      "בכלי עיצוב האלבומים: כפתור ה-X בפאנל תמונת הרקע סוגר את הפאנל בלבד ולא מוחק יותר את הרקע",
      "בכלי עיצוב האלבומים: תזוזת תמונה בחיצי המקלדת היא עכשיו 15px קבועים (40px עם Shift), ללא תלות בגודל התצוגה",
      "בכלי עיצוב האלבומים: כל כניסה או יציאה מעריכת עמוד מעדכנת רינדור JPG טרי שלו בשרת",
      "בכלי עיצוב האלבומים: נוסף קו הנחיה כחול לתמונה שמרחקה מתמונה שכנה שווה למרחקה מקו האמצע של העמוד, עם נעיצה קלה",
      "בכלי עיצוב האלבומים: תוקן באג שגרם לשורת הטקסט שנפתחת בסימון תמונה להסתיר את שורת הכפתורים",
      "בכלי עיצוב האלבומים: כשגוררים כמה תמונות יחד לתוך מסגרות קיימות, כל תמונה מתאימה עכשיו לגודלה הטבעי בלי להיחתך",
      "בכלי עיצוב האלבומים: אפשר עכשיו להוסיף צל לצורות",
    ],
    en: [
      "In the album designer: fixed a bug where selecting several photos and tapping \"Show at correct size\" made them grow into each other at the expense of the gaps between them",
      "In the album designer: added a round back button to the photo editing panel, its initial size grew (length +7 cm, width +5 cm), it opens above the photo area, and dragging it no longer selects text elsewhere on the screen",
      "In the album designer: the X button in the background photo panel only closes the panel and no longer deletes the background",
      "In the album designer: moving a photo with the keyboard arrows is now a fixed 15px (40px with Shift), regardless of the zoom level",
      "In the album designer: every time you enter or leave page editing, a fresh JPG render of that page is updated on the server",
      "In the album designer: added a blue guide line for a photo whose distance from a neighboring photo equals its distance from the page's center line, with light snapping",
      "In the album designer: fixed a bug where the text row that opens when selecting a photo hid the button row",
      "In the album designer: when you drag several photos together into existing frames, each photo now fits its natural size without being cropped",
      "In the album designer: you can now add a shadow to shapes",
    ],
    ru: [
      "В редакторе альбомов: исправлена ошибка, из-за которой при выборе нескольких фото и нажатии «Показать в правильном размере» они разрастались друг в друга за счёт промежутков",
      "В редакторе альбомов: в панель редактирования фото добавлена круглая кнопка «Назад», её начальный размер увеличен (длина +7 см, ширина +5 см), она открывается над областью фото, а её перетаскивание больше не выделяет текст на экране",
      "В редакторе альбомов: кнопка X в панели фонового фото только закрывает панель и больше не удаляет фон",
      "В редакторе альбомов: перемещение фото стрелками клавиатуры теперь — фиксированные 15px (40px с Shift), независимо от масштаба",
      "В редакторе альбомов: при каждом входе в редактирование страницы и выходе из него на сервере обновляется свежий JPG-рендер этой страницы",
      "В редакторе альбомов: добавлена синяя направляющая для фото, расстояние которого до соседнего фото равно расстоянию до центральной линии страницы, с лёгкой привязкой",
      "В редакторе альбомов: исправлена ошибка, из-за которой строка текста, открывающаяся при выборе фото, закрывала ряд кнопок",
      "В редакторе альбомов: при перетаскивании нескольких фото в существующие рамки каждое фото теперь подстраивается под свой естественный размер без обрезки",
      "В редакторе альбомов: теперь можно добавлять тень к фигурам",
    ],
  },
  {
    version: "2.11.37",
    date: "2026-09-14",
    changes: [
      "בבונה הצעות מחיר: אחרי שליחת הצעה, המערכת שואלת אם להוסיף את הלקוח/ה לרשימת הלידים כדי לקבל תזכורת מעקב אם לא חוזרים אליה תוך יומיים",
      "בבונה הצעות מחיר: נוסף כפתור חזרה עגול ליד כפתור הסגירה",
      "בבונה הצעות מחיר: אפשר עכשיו לשנות את המחיר בהצעה גם לספק מהרשימה הקבועה, בלי להשפיע על המחיר השמור שלו בהגדרות",
      "בבונה הצעות מחיר: \"עריכת ספקים\" מופיע רק אחרי שנוספו ספקים להצעה, ומאפשר מחיקה מרובה מתוך רשימת הספקים של ההצעה הנוכחית",
      "בבונה הצעות מחיר: חלון הבנייה גדל ותופס יותר מקום על המסך",
      "בבונה הצעות מחיר: כפתור \"הוספת ספק\" בולט יותר",
      "עודכן מדריך המשתמש של בונה הצעות המחיר עם שלבים מפורטים להכנת הצעת מחיר",
    ],
    en: [
      "In the price quote builder: after sending a quote, the system asks whether to add the client to your leads list to get a follow-up reminder if they don't get back to you within two days",
      "In the price quote builder: added a round back button next to the close button",
      "In the price quote builder: you can now change the price in the quote for a vendor from the fixed list too, without affecting their saved price in Settings",
      "In the price quote builder: \"Edit vendors\" appears only after vendors were added to the quote, and lets you delete several at once from the current quote's vendor list",
      "In the price quote builder: the builder window got bigger and takes up more of the screen",
      "In the price quote builder: the \"Add vendor\" button stands out more",
      "The price quote builder user guide was updated with detailed steps for preparing a price quote",
    ],
    ru: [
      "В конструкторе ценовых предложений: после отправки предложения система спрашивает, добавить ли клиента в список заявок, чтобы получить напоминание, если он не ответит в течение двух дней",
      "В конструкторе ценовых предложений: рядом с кнопкой закрытия добавлена круглая кнопка «Назад»",
      "В конструкторе ценовых предложений: теперь можно изменить цену в предложении и для поставщика из постоянного списка, не меняя его сохранённую цену в настройках",
      "В конструкторе ценовых предложений: «Редактировать поставщиков» появляется только после добавления поставщиков в предложение и позволяет удалить сразу нескольких из списка текущего предложения",
      "В конструкторе ценовых предложений: окно конструктора стало больше и занимает больше места на экране",
      "В конструкторе ценовых предложений: кнопка «Добавить поставщика» стала заметнее",
      "Руководство по конструктору ценовых предложений обновлено подробными шагами подготовки предложения",
    ],
  },
  {
    version: "2.11.36",
    date: "2026-09-12",
    changes: [
      "בכלי עיצוב מסגרת המגנט: נוספו כפתורי חצים עגולים ליד כפתור המחיקה של טקסט ואלמנט, לכל לחיצה האלמנט זז 2 פיקסלים בכיוון שנבחר בלי צורך לגרור",
    ],
    en: [
      "In the magnet frame designer: added round arrow buttons next to the delete button for text and elements; each tap moves the element 2 pixels in the chosen direction, without dragging",
    ],
    ru: [
      "В редакторе рамок для магнитов: рядом с кнопкой удаления текста и элемента добавлены круглые кнопки со стрелками — каждое нажатие сдвигает элемент на 2 пикселя в выбранном направлении, без перетаскивания",
    ],
  },
  {
    version: "2.11.35",
    date: "2026-09-12",
    changes: [
      "בכלי עיצוב מסגרת המגנט: אלמנטים, טקסטורה והגדרות מסגרת עברו ללשוניות באותו גודל שהיה לכפתור הגדרות מסגרת, עם גלילה פנימית — כך שהמסגרת עצמה תמיד נשארת גלויה במסך",
      "נוספה אפשרות לקבוע עובי נפרד לצלע התחתונה של המסגרת בלבד",
      "נוסף כפתור להעלאת אלמנטים אישיים שנשמרים ונשארים זמינים גם בעיצובים הבאים",
      "נוספו 30 אלמנטים חדשים של פרחים צבעוניים בסגנון צבעי מים",
      "תוקן באג שגרם לפונטים בעברית (ובמיוחד גופני כתב יד) לא להשפיע על הטקסט בכלל",
      "נוספה אפשרות לבחירת צבע חופשית (בנוסף לצבעים הקבועים) לטקסט, לאלמנטים ולצבע המסגרת",
      "נוספה אפשרות לצבוע את המסגרת עצמה ולשלוט בשקיפות הצבע",
    ],
    en: [
      "In the magnet frame designer: elements, texture and frame settings moved to tabs the same size as the old frame settings button, with internal scrolling — so the frame itself always stays visible on screen",
      "Added the option to set a separate thickness for the frame's bottom edge only",
      "Added a button to upload your own elements, which are saved and stay available in future designs",
      "Added 30 new watercolor-style colorful flower elements",
      "Fixed a bug where Hebrew fonts (especially handwriting fonts) had no effect on the text at all",
      "Added a free color picker (in addition to the fixed colors) for text, elements and the frame color",
      "Added the option to color the frame itself and control the color's opacity",
    ],
    ru: [
      "В редакторе рамок для магнитов: элементы, текстура и настройки рамки перенесены во вкладки размером с прежнюю кнопку настроек рамки, с внутренней прокруткой — так что сама рамка всегда остаётся видна на экране",
      "Добавлена возможность задать отдельную толщину только для нижней стороны рамки",
      "Добавлена кнопка загрузки собственных элементов, которые сохраняются и остаются доступны в следующих дизайнах",
      "Добавлены 30 новых элементов — цветные цветы в акварельном стиле",
      "Исправлена ошибка, из-за которой шрифты на иврите (особенно рукописные) никак не влияли на текст",
      "Добавлен свободный выбор цвета (в дополнение к фиксированным цветам) для текста, элементов и цвета рамки",
      "Добавлена возможность окрасить саму рамку и управлять прозрачностью цвета",
    ],
  },
  {
    version: "2.11.34",
    date: "2026-09-11",
    changes: [
      "בכלי עיצוב מסגרת המגנט: הוספת אלמנט וטקסטורה נפתחות עכשיו בחלון נפרד ברוחב 80% מהמסך שגולש פנימה מלמעלה",
      "נוסף כפתור טקסטורה נפרד (בנפרד מהגדרות המסגרת)",
      "תוקן באג שגרם לתמונות הטקסטורה להיראות כריבועים לבנים ריקים",
      "כפתורי הפעולות בראש הכלי מסודרים עכשיו בשורה אחת שגוללת בצד, בלי שהטקסט בתוכם ייחתך",
    ],
    en: [
      "In the magnet frame designer: adding an element or texture now opens in a separate window 80% of the screen width that slides in from the top",
      "Added a separate texture button (apart from the frame settings)",
      "Fixed a bug where texture images looked like empty white squares",
      "The action buttons at the top of the tool are now arranged in one sideways-scrolling row, without the text inside them being cut off",
    ],
    ru: [
      "В редакторе рамок для магнитов: добавление элемента и текстуры теперь открывается в отдельном окне шириной 80% экрана, которое выезжает сверху",
      "Добавлена отдельная кнопка текстуры (отдельно от настроек рамки)",
      "Исправлена ошибка, из-за которой изображения текстур выглядели как пустые белые квадраты",
      "Кнопки действий вверху инструмента теперь расположены в одну строку с прокруткой вбок, без обрезки текста",
    ],
  },
  {
    version: "2.11.33",
    date: "2026-09-11",
    changes: [
      "בכלי עיצוב מסגרת המגנט: ההצללה עברה לחלק הפנימי של המסגרת (מסביב לפתח התמונה) במקום מתחת למסגרת כלפי חוץ",
      "נוספו 50 אלמנטים חדשים בסגנון קו מתאר נקי המתאימים לאירועים (לבבות, לב מסולסל, פרחים, פעמונים, טבעת מפתח, כתר ועוד)",
      "ניתן להוסיף כמה שכבות טקסט עם גופן, צבע וצל שונים לכל שכבה, עם תנועה חלקה בעדכון ובגרירה",
      "נוספה אפשרות להוסיף טקסטורה על המסגרת בלבד (לא על התמונה) עם שליטה בשקיפות — 40 טקסטורות מובנות, וגם אפשרות להעלות טקסטורה אישית",
    ],
    en: [
      "In the magnet frame designer: the shading moved to the inside of the frame (around the photo opening) instead of under the frame outward",
      "Added 50 new clean line-art elements suited to events (hearts, a curly heart, flowers, bells, a key ring, a crown and more)",
      "You can add several text layers with a different font, color and shadow for each layer, with smooth movement when updating and dragging",
      "Added the option to put a texture on the frame only (not on the photo) with opacity control — 40 built-in textures, and the option to upload your own texture",
    ],
    ru: [
      "В редакторе рамок для магнитов: тень перенесена внутрь рамки (вокруг окна для фото), а не под рамку наружу",
      "Добавлены 50 новых контурных элементов для мероприятий (сердца, фигурное сердце, цветы, колокольчики, брелок, корона и другие)",
      "Можно добавить несколько текстовых слоёв с разным шрифтом, цветом и тенью для каждого, с плавным движением при изменении и перетаскивании",
      "Добавлена возможность наложить текстуру только на рамку (не на фото) с регулировкой прозрачности — 40 встроенных текстур и возможность загрузить свою",
    ],
  },
  {
    version: "2.11.32",
    date: "2026-09-11",
    changes: [
      "הכלי הישן \"עיצוב מסגרות לאירוע\" (בבינה מלאכותית) הוסר מהמערכת",
      "בכלי עיצוב מסגרת המגנט נוספה שליטה על עובי המסגרת, עיגול הפינות הפנימיות של המסגרת, ועל עוצמת/טשטוש/מרחק ההצללה מתחת למסגרת",
      "נוספו לכלי עיצוב מסגרת המגנט אלמנטים גרפיים חדשים בסגנון וקטור מלא ובסגנון קו מתאר (טבעות, כוסות שמפניה, עוגה, בלון, זוג, יונה, נר, קונפטי)",
    ],
    en: [
      "The old \"Event frame design\" tool (AI-based) was removed from the system",
      "In the magnet frame designer: added control over the frame thickness, the rounding of the frame's inner corners, and the strength/blur/distance of the shadow under the frame",
      "New graphic elements were added to the magnet frame designer in full vector and line-art styles (rings, champagne glasses, a cake, a balloon, a couple, a dove, a candle, confetti)",
    ],
    ru: [
      "Старый инструмент «Дизайн рамок для мероприятия» (на основе ИИ) удалён из системы",
      "В редакторе рамок для магнитов добавлено управление толщиной рамки, скруглением внутренних углов рамки и силой/размытием/расстоянием тени под рамкой",
      "В редактор рамок для магнитов добавлены новые графические элементы в полностью векторном и контурном стилях (кольца, бокалы шампанского, торт, воздушный шар, пара, голубь, свеча, конфетти)",
    ],
  },
  {
    version: "2.11.31",
    date: "2026-09-11",
    changes: [
      "נוסף כלי חדש \"עיצוב מסגרת מגנט\" — בסיס מסגרת לבן פשוט במידה 20×15 ס״מ עם שטח שקוף במרכז, שניתן להוסיף עליו טקסט (עם בחירת פונט מתוך 100 גופנים, גודל, צבע וצל מתכוונן) ואלמנטים גרפיים (לבבות, טבעות, זוג ועוד) בגרירה חופשית",
      "שמירת מסגרת המגנט יוצרת אוטומטית גם מסגרת תואמת לאורך (15×20 ס״מ) עם אותו הטקסט והאלמנטים",
    ],
    en: [
      "New tool: \"Magnet frame design\" — a simple white 20×15 cm frame base with a transparent area in the middle, where you can add text (choosing from 100 fonts, with size, color and adjustable shadow) and graphic elements (hearts, rings, a couple and more) with free dragging",
      "Saving the magnet frame also automatically creates a matching portrait frame (15×20 cm) with the same text and elements",
    ],
    ru: [
      "Новый инструмент «Дизайн рамки для магнита» — простая белая основа рамки 20×15 см с прозрачной областью в центре, на которую можно добавить текст (на выбор 100 шрифтов, размер, цвет и настраиваемая тень) и графические элементы (сердца, кольца, пара и другие) свободным перетаскиванием",
      "При сохранении рамки для магнита автоматически создаётся и соответствующая вертикальная рамка (15×20 см) с тем же текстом и элементами",
    ],
  },
  {
    version: "2.11.30",
    date: "2026-09-10",
    changes: [
      "בהתראה על התנגשות תאריך ושעה בסריקת יומן Google: נוסח הצ'קבוקס שונה ל\"פרילנס-נשלח צלם/צוות\"",
      "במקרא הצבעים ברשימת האירועים נוספה שורה שמסבירה את הצבע של אירוע רגיל שנשמר ידנית",
    ],
    en: [
      "In the date-and-time conflict alert in the Google Calendar scan: the checkbox wording changed to \"Freelance - photographer/team sent\"",
      "The color legend in the events list got a line explaining the color of a regular event saved manually",
    ],
    ru: [
      "В предупреждении о конфликте даты и времени при сканировании Google Календаря: текст флажка изменён на «Фриланс — отправлен фотограф/команда»",
      "В легенду цветов списка мероприятий добавлена строка, объясняющая цвет обычного мероприятия, сохранённого вручную",
    ],
  },
  {
    version: "2.11.29",
    date: "2026-09-10",
    changes: [
      "סריקת יומן Google: אירוע שכבר קיים במערכת (לפי תאריך ושם לקוח תואמים), גם אם הוא לא יובא בעבר מהיומן, לא יוצג יותר בתוצאות הסריקה — כדי למנוע כפילויות",
    ],
    en: [
      "Google Calendar scan: an event that already exists in the system (by matching date and client name), even if it wasn't imported from the calendar before, no longer shows in the scan results — to avoid duplicates",
    ],
    ru: [
      "Сканирование Google Календаря: мероприятие, которое уже есть в системе (по совпадению даты и имени клиента), даже если оно раньше не импортировалось из календаря, больше не показывается в результатах — чтобы избежать дублей",
    ],
  },
  {
    version: "2.11.28",
    date: "2026-09-09",
    changes: [
      "תוקן: בטופס גלריה חדשה, תאי \"תאריך הצילום\" ו\"משך שמירת הגלריה\" יכלו לחפוף אחד לשני במקום לשבת זה לצד זה עם רווח",
    ],
    en: [
      "Fixed: in the new gallery form, the \"Shoot date\" and \"Gallery retention\" fields could overlap instead of sitting side by side with a gap",
    ],
    ru: [
      "Исправлено: в форме новой галереи поля «Дата съёмки» и «Срок хранения галереи» могли накладываться друг на друга вместо того, чтобы стоять рядом с отступом",
    ],
  },
  {
    version: "2.11.27",
    date: "2026-09-09",
    changes: [
      "בתוצאות סריקת יומן Google: נוספה רשימה נפתחת לבחירת חבילה (כולל חבילות מותאמות אישית שנשמרו) — ברירת המחדל היא חבילה מלאה, וניתן לשנות לכל אירוע לפני האישור",
      "תוקן: אירוע שנוסף מסריקת היומן לא היה ניתן לסימון \"סגירת האירוע\" (השלב הראשון) כבוצע, בניגוד לכל שאר השלבים",
    ],
    en: [
      "In the Google Calendar scan results: added a dropdown for choosing a package (including saved custom packages) — the default is the full package, and you can change it for each event before confirming",
      "Fixed: an event added from the calendar scan couldn't have \"Event closing\" (the first stage) marked as done, unlike all the other stages",
    ],
    ru: [
      "В результатах сканирования Google Календаря добавлен выпадающий список выбора пакета (включая сохранённые индивидуальные пакеты) — по умолчанию полный пакет, и его можно изменить для каждого мероприятия до подтверждения",
      "Исправлено: у мероприятия, добавленного из сканирования календаря, нельзя было отметить «Закрытие мероприятия» (первый этап) как выполненное, в отличие от остальных этапов",
    ],
  },
  {
    version: "2.11.26",
    date: "2026-09-09",
    changes: [
      "סריקת יומן Google: תוקן זיהוי מספרי טלפון שהודבקו מאפליקציית אנשי קשר של הטלפון — אלה משתמשים בקו מפריד מיוחד בין קבוצות הספרות (לא מקף רגיל), מה שגרם למספר שכתוב עם קידומת 972+ להישאר בהערות במקום להיכנס לתא טלפון הלקוח",
    ],
    en: [
      "Google Calendar scan: fixed recognition of phone numbers pasted from the phone's contacts app — these use a special separator between digit groups (not a regular hyphen), which made a number written with a +972 prefix stay in the notes instead of going into the client phone field",
    ],
    ru: [
      "Сканирование Google Календаря: исправлено распознавание номеров, вставленных из приложения контактов телефона — там между группами цифр стоит особый разделитель (не обычный дефис), из-за чего номер с префиксом +972 оставался в заметках, а не попадал в поле телефона клиента",
    ],
  },
  {
    version: "2.11.25",
    date: "2026-09-09",
    changes: [
      "סריקת יומן Google: זיהוי מספר טלפון בתיאור האירוע שופר — כולל עכשיו מספרים בפורמט בינלאומי (972+) ותווית \"טל'\" מקוצרת, לא רק \"טלפון\"/\"נייד\"",
    ],
    en: [
      "Google Calendar scan: improved phone number recognition in the event description — it now includes international-format numbers (+972) and the short label \"Tel\", not only \"Phone\"/\"Mobile\"",
    ],
    ru: [
      "Сканирование Google Календаря: улучшено распознавание номера телефона в описании мероприятия — теперь учитываются номера в международном формате (+972) и сокращённая метка «Тел.», а не только «Телефон»/«Мобильный»",
    ],
  },
  {
    version: "2.11.24",
    date: "2026-09-09",
    changes: [
      "בתוצאות סריקת יומן Google: תיקנו שכותרת אירוע ארוכה נחתכה בלי סימן בתא הכותרת — עכשיו הכותרת המלאה תמיד גלויה, גם כשהיא עוברת לשורה נוספת",
    ],
    en: [
      "In the Google Calendar scan results: fixed a long event title being cut off without any indication in the title cell — the full title is now always visible, even when it wraps to another line",
    ],
    ru: [
      "В результатах сканирования Google Календаря: исправлено обрезание длинного названия мероприятия без какого-либо знака — теперь полное название всегда видно, даже если переносится на следующую строку",
    ],
  },
  {
    version: "2.11.23",
    date: "2026-09-09",
    changes: [
      "תוקן: מחיקת תמונות מגלריה נכשלה כמעט תמיד עם השגיאה \"בקשה לא חוקית\" — בדיקה פנימית לא תאמה את הצורה האמיתית של קבצי התצוגה המקדימה בשרת",
    ],
    en: [
      "Fixed: deleting photos from a gallery almost always failed with the error \"Invalid request\" — an internal check didn't match the real shape of the preview files on the server",
    ],
    ru: [
      "Исправлено: удаление фото из галереи почти всегда завершалось ошибкой «Недопустимый запрос» — внутренняя проверка не совпадала с реальным форматом файлов предпросмотра на сервере",
    ],
  },
  {
    version: "2.11.22",
    date: "2026-09-09",
    changes: [
      "מחיקת תמונות מגלריה: לאחר לחיצה על אישור מוצג מסך התקדמות, בדומה למסך הטעינה בסריקת האירועים",
      "תוקן: אם מחיקת תמונות נכשלת, מוצגת עכשיו הודעת שגיאה ברורה במקום שהמסך פשוט נשאר כמו שהיה בלי שום סימן",
    ],
    en: [
      "Deleting photos from a gallery: after tapping confirm, a progress screen is shown, similar to the loading screen in the event scan",
      "Fixed: if deleting photos fails, a clear error message is now shown instead of the screen simply staying as it was with no sign at all",
    ],
    ru: [
      "Удаление фото из галереи: после подтверждения показывается экран прогресса, похожий на экран загрузки при сканировании мероприятий",
      "Исправлено: если удаление фото не удалось, теперь показывается понятное сообщение об ошибке, а не экран, который просто остаётся прежним без всякого знака",
    ],
  },
  {
    version: "2.11.21",
    date: "2026-09-09",
    changes: [
      "תוקן: בבחירה מרובה של תמונות בגלריה במחשב, כפתור ההורדה פתח כל תמונה בלשונית נפרדת במקום להוריד קובץ zip אחד עם כל התמונות שנבחרו",
    ],
    en: [
      "Fixed: when selecting several photos in a gallery on a computer, the download button opened each photo in a separate tab instead of downloading one zip file with all the selected photos",
    ],
    ru: [
      "Исправлено: при выборе нескольких фото в галерее на компьютере кнопка скачивания открывала каждое фото в отдельной вкладке вместо скачивания одного zip-файла со всеми выбранными фото",
    ],
  },
  {
    version: "2.11.20",
    date: "2026-09-09",
    changes: [
      "בתוצאות סריקת יומן Google אפשר עכשיו לערוך גם את כותרת האירוע ולהוסיף הערות, לא רק את הפרטים האחרים",
      "נוסף איזור טלפון לקוח בתוצאות הסריקה — כשהסריקה מזהה מספר טלפון בתיאור האירוע ביומן, הוא ממולא שם אוטומטית וניתן גם לתקן ידנית",
    ],
    en: [
      "In the Google Calendar scan results you can now also edit the event title and add notes, not just the other details",
      "Added a client phone field to the scan results — when the scan finds a phone number in the calendar event's description, it's filled in automatically, and you can also correct it manually",
    ],
    ru: [
      "В результатах сканирования Google Календаря теперь можно редактировать и название мероприятия, и добавлять заметки, а не только другие данные",
      "В результаты сканирования добавлено поле телефона клиента — когда сканирование находит номер в описании мероприятия в календаре, он подставляется автоматически, и его можно исправить вручную",
    ],
  },
  {
    version: "2.11.19",
    date: "2026-09-09",
    changes: [
      "סריקת יומן Google: אירוע שנוסף מהסריקה בולט בדף האירועים בצבע שנבחר בהגדרות לזיהוי אירועי ייבוא (ולא בצבע קבוע), עד שנכנסים אליו ושומרים עריכה",
      "בתוצאות הסריקה, כותרת האירוע מוצגת עכשיו במלואה ולא נחתכת",
      "בתוצאות הסריקה אפשר עכשיו לערוך גם מיקום, שעת התחלה, שעת סיום ושעת הגעה לצילומי משפחה לפני אישור ההוספה — לא רק את הסכומים",
    ],
    en: [
      "Google Calendar scan: an event added from the scan stands out on the events page in the color chosen in Settings for identifying imported events (not a fixed color), until you open it and save an edit",
      "In the scan results, the event title is now shown in full and isn't cut off",
      "In the scan results you can now also edit the location, start time, end time and arrival time for family photos before confirming — not just the amounts",
    ],
    ru: [
      "Сканирование Google Календаря: мероприятие, добавленное из сканирования, выделяется на странице мероприятий цветом, выбранным в настройках для импортированных мероприятий (а не фиксированным цветом), пока вы не откроете его и не сохраните правку",
      "В результатах сканирования название мероприятия теперь показывается полностью и не обрезается",
      "В результатах сканирования до подтверждения теперь можно редактировать место, время начала, время окончания и время прибытия на семейную съёмку — а не только суммы",
    ],
  },
  {
    version: "2.11.18",
    date: "2026-09-08",
    changes: [
      "תוקן: בטופס אירוע חדש בגרסת המחשב, לא היה ניתן לשנות את שעות האירוע ואת שעת ההגעה לצילומי משפחה",
    ],
    en: [
      "Fixed: in the new event form on desktop, you couldn't change the event hours or the arrival time for family photos",
    ],
    ru: [
      "Исправлено: в форме нового мероприятия на компьютере нельзя было изменить время мероприятия и время прибытия на семейную съёмку",
    ],
  },
  {
    version: "2.11.17",
    date: "2026-09-08",
    changes: [
      "סריקת יומן Google: אפשר עכשיו לערוך את סכומי המקדמה והיתרה שזוהו אוטומטית לפני אישור הוספת האירועים",
      "אם מספר טלפון מזוהה בתיאור האירוע ביומן, הוא מוזן אוטומטית לשדה הטלפון של הלקוח במקום להישאר בהערות",
      "אירוע שנוסף מסריקת היומן בולט עכשיו בצבע שונה על כל כרטיס האירוע בדף האירועים (לא רק פס דק), עד שנכנסים אליו ושומרים עריכה",
    ],
    en: [
      "Google Calendar scan: you can now edit the deposit and balance amounts detected automatically before confirming the events",
      "If a phone number is detected in the calendar event's description, it's entered automatically into the client's phone field instead of staying in the notes",
      "An event added from the calendar scan now stands out in a different color across the whole event card on the events page (not just a thin stripe), until you open it and save an edit",
    ],
    ru: [
      "Сканирование Google Календаря: теперь можно отредактировать автоматически найденные суммы предоплаты и остатка до подтверждения мероприятий",
      "Если в описании мероприятия в календаре найден номер телефона, он автоматически вносится в поле телефона клиента, а не остаётся в заметках",
      "Мероприятие, добавленное из сканирования календаря, теперь выделяется другим цветом по всей карточке на странице мероприятий (а не только тонкой полосой), пока вы не откроете его и не сохраните правку",
    ],
  },
  {
    version: "2.11.16",
    date: "2026-09-08",
    changes: [
      "סריקת יומן Google לאירועים חדשים: טווח הסריקה מתחיל מהיום שבו מפעילים אותה (ולא 30 יום אחורה כמו קודם)",
      "תוצאות הסריקה מוצגות עכשיו כרשימת אירועים לסימון — בוחרים כמה שרוצים, מסך אישור אחד, והמערכת מזינה את כל האירועים שנבחרו ישירות לדף האירועים בלי טופס לכל אחד בנפרד",
      "אירוע שנוסף כך מסומן בדף האירועים בפס צבע ותגית \"יובא מהיומן — יש להשלים פרטים\", עד שנכנסים אליו ושומרים עריכה — ואז הוא נראה כמו כל אירוע אחר",
    ],
    en: [
      "Google Calendar scan for new events: the scan range starts from the day you run it (not 30 days back as before)",
      "Scan results are now shown as a list of events to select — choose as many as you like, one confirmation screen, and the system enters all selected events straight into the events page without a form for each one",
      "An event added this way is marked on the events page with a color stripe and the tag \"Imported from calendar — details to complete\", until you open it and save an edit — then it looks like any other event",
    ],
    ru: [
      "Сканирование Google Календаря на новые мероприятия: период сканирования начинается со дня запуска (а не на 30 дней назад, как раньше)",
      "Результаты сканирования теперь показаны списком мероприятий для выбора — выберите сколько нужно, один экран подтверждения, и система внесёт все выбранные мероприятия прямо на страницу мероприятий без формы для каждого",
      "Мероприятие, добавленное так, отмечено на странице мероприятий цветной полосой и меткой «Импортировано из календаря — заполните данные», пока вы не откроете его и не сохраните правку — после этого оно выглядит как любое другое",
    ],
  },
  {
    version: "2.11.15",
    date: "2026-09-08",
    changes: [
      "עידון קטן במסכי הטעינה (העלאה, ייצוא וכו') — אפקט ה-glow מאחורי הספינר נשאר, אבל כבר לא מהבהב, כך שהמסך חוזר להיות רגוע כמו שהיה",
    ],
    en: [
      "A small refinement to the loading screens (upload, export, etc.) — the glow behind the spinner stays, but it no longer flickers, so the screen is calm again like before",
    ],
    ru: [
      "Небольшая доработка экранов загрузки (загрузка, экспорт и т. д.) — свечение за спиннером осталось, но больше не мерцает, и экран снова спокойный, как раньше",
    ],
  },
  {
    version: "2.11.14",
    date: "2026-09-08",
    changes: [
      "הגדרות ← פרופיל: נוספה סריקת יומן Google לאיתור אירועי לקוחות חדשים לפי צבע שבוחרים — כל אירוע כזה נפתח כטופס אירוע חדש ממולא מראש (שם, תאריך, שעות, מיקום, הערות, ואפילו מקדמה/יתרה אם זוהו בתיאור)",
      "צבעי היומן בהגדרות (צבע אירועי המערכת וצבע הזיהוי לייבוא) עברו לרשימות נפתחות עם תצוגת צבע חיה, ולא ניתן יותר לבחור באותו צבע פעמיים",
    ],
    en: [
      "Settings ← Profile: added a Google Calendar scan to find new client events by a color you choose — each such event opens as a new event form, pre-filled (name, date, hours, location, notes, and even deposit/balance if found in the description)",
      "The calendar colors in Settings (the system events color and the import identification color) moved to dropdowns with a live color preview, and the same color can no longer be chosen twice",
    ],
    ru: [
      "Настройки ← Профиль: добавлено сканирование Google Календаря для поиска новых мероприятий клиентов по выбранному цвету — каждое такое мероприятие открывается как заранее заполненная форма нового мероприятия (имя, дата, время, место, заметки и даже предоплата/остаток, если они найдены в описании)",
      "Цвета календаря в настройках (цвет мероприятий системы и цвет для импорта) перенесены в выпадающие списки с живым предпросмотром цвета, и один и тот же цвет больше нельзя выбрать дважды",
    ],
  },
  {
    version: "2.11.13",
    date: "2026-09-07",
    changes: [
      "כרטיס האירוע: שורות התשלום (מקדמה/יתרה) מאפשרות עכשיו לסמן תשלום מלא או חלקי — בתשלום חלקי מזינים כמה שולם והמערכת מחשבת את היתרה אוטומטית, ואפשר להוסיף הערה אישית מתחת לכל שורה",
      "גרף ההכנסות (בדף הבית ובניתוח העסקי) מתעדכן מיד עם סימון תשלום, וסופר גם תשלומים חלקיים כהכנסה בפועל — לא רק תשלומים מלאים",
      "בונה הצעות מחיר: נוסף כפתור מדריך למשתמש (ליד הכותרת) עם הסבר על כל הכפתורים, בעברית, אנגלית ורוסית",
      "בבניית תבנית להצעת מחיר: תא המחיר מציג את המחיר השמור של הפריט הנבחר ברשימה, וניתן לערוך אותו ידנית להצעה הספציפית",
      "מסכי טעינה, העלאה וייצוא: נוסף אפקט glow עדין מאחורי ספינר ההתקדמות",
    ],
    en: [
      "Event card: the payment lines (deposit/balance) now let you mark a full or partial payment — for a partial payment you enter how much was paid and the system calculates the balance automatically, and you can add a personal note under each line",
      "The income chart (on the home screen and in business analytics) updates immediately when a payment is marked, and counts partial payments as actual income too — not only full payments",
      "Price quote builder: added a user guide button (next to the title) explaining every button, in Hebrew, English and Russian",
      "When building a price quote template: the price field shows the saved price of the item selected in the list, and you can edit it manually for the specific quote",
      "Loading, upload and export screens: added a subtle glow behind the progress spinner",
    ],
    ru: [
      "Карточка мероприятия: в строках оплаты (предоплата/остаток) теперь можно отметить полную или частичную оплату — при частичной вы вводите, сколько оплачено, и система автоматически считает остаток, а под каждой строкой можно добавить личную заметку",
      "График дохода (на главном экране и в бизнес-аналитике) обновляется сразу после отметки оплаты и учитывает частичные оплаты как фактический доход — не только полные",
      "Конструктор ценовых предложений: добавлена кнопка руководства пользователя (рядом с заголовком) с объяснением всех кнопок, на иврите, английском и русском",
      "При создании шаблона ценового предложения поле цены показывает сохранённую цену выбранного в списке пункта, и её можно изменить вручную для конкретного предложения",
      "Экраны загрузки и экспорта: за спиннером прогресса добавлено мягкое свечение",
    ],
  },
  {
    version: "2.11.12",
    date: "2026-09-07",
    changes: [
      "בבניית תבנית להצעת מחיר: תא הפריט הפך לרשימה נפתחת מתוך הספקים השמורים (זהה לבונה הצעות המחיר) — כל פריט חדש שנרשם כטקסט חופשי נשמר אוטומטית לרשימת הספקים לפעם הבאה",
    ],
    en: [
      "When building a price quote template: the item field became a dropdown of your saved vendors (same as the price quote builder) — every new item typed as free text is saved automatically to the vendor list for next time",
    ],
    ru: [
      "При создании шаблона ценового предложения поле пункта стало выпадающим списком сохранённых поставщиков (как в конструкторе ценовых предложений) — каждый новый пункт, введённый свободным текстом, автоматически сохраняется в список поставщиков на будущее",
    ],
  },
  {
    version: "2.11.11",
    date: "2026-09-07",
    changes: [
      "הגדרות ← הצעות מחיר: אפשר עכשיו לבנות תבניות מוכנות של פריטים — מופיעות ברשימה נפתחת בבונה הצעות המחיר, ומהוות בסיס להצעה חדשה שאליו מוסיפים שורות ספקים והערות",
    ],
    en: [
      "Settings ← Price quotes: you can now build ready-made item templates — they appear in a dropdown in the price quote builder and serve as the base for a new quote, to which you add vendor rows and notes",
    ],
    ru: [
      "Настройки ← Ценовые предложения: теперь можно создавать готовые шаблоны пунктов — они появляются в выпадающем списке конструктора ценовых предложений и служат основой нового предложения, к которой вы добавляете строки поставщиков и заметки",
    ],
  },
  {
    version: "2.11.10",
    date: "2026-09-07",
    changes: [
      "בונה הצעות מחיר: נוספה אפשרות להוסיף הערות בטקסט חופשי להצעת המחיר — מופיעות בתחתית הקובץ שנשלח ללקוח/ה",
    ],
    en: [
      "Price quote builder: added the option to add free-text notes to the price quote — they appear at the bottom of the file sent to the client",
    ],
    ru: [
      "Конструктор ценовых предложений: добавлена возможность писать заметки свободным текстом — они появляются внизу файла, отправляемого клиенту",
    ],
  },
  {
    version: "2.11.9",
    date: "2026-09-07",
    changes: [
      "דף הלידים: מוצג עכשיו סטטוס ברור לכל ליד — האם ההצעה עדיין ממתינה לאישור הלקוח/ה או שכבר אושרה וממתינה למילוי שאלון פרטי האירוע",
      "ייצוא PDF: נוספה בדיקת תקינות לשרת הרינדור לפני תחילת ייצוא — אם הוא לא זמין או לא מעודכן, תוצג הודעה ברורה במקום שהייצוא ייתקע",
    ],
    en: [
      "Leads page: each lead now shows a clear status — whether the quote is still waiting for the client's approval, or already approved and waiting for the event details questionnaire",
      "PDF export: added a health check of the rendering server before the export starts — if it's unavailable or out of date, a clear message is shown instead of the export getting stuck",
    ],
    ru: [
      "Страница заявок: у каждой заявки теперь виден понятный статус — ждёт ли предложение одобрения клиента или уже одобрено и ждёт заполнения анкеты о мероприятии",
      "Экспорт PDF: перед началом экспорта проверяется работоспособность сервера рендеринга — если он недоступен или не обновлён, показывается понятное сообщение, а не зависший экспорт",
    ],
  },
  {
    version: "2.11.8",
    date: "2026-09-06",
    changes: [
      "גלריות: השם שמוצג בראש הגלריה עוקב אוטומטית אחרי שם הלקוח/ה בעמוד האירוע — אלא אם הקלדתם שם משלכם בהגדרות הגלריה, ואז הוא נשאר קבוע (שינוי שם האירוע לא ישפיע עליו יותר). ניתן לחזור למעקב אוטומטי ע״י מחיקת השם בהגדרות הגלריה",
    ],
    en: [
      "Galleries: the name shown at the top of the gallery automatically follows the client's name on the event page — unless you typed your own name in the gallery settings, in which case it stays fixed (renaming the event won't affect it anymore). You can return to automatic following by deleting the name in the gallery settings",
    ],
    ru: [
      "Галереи: название вверху галереи автоматически следует за именем клиента на странице мероприятия — если только вы не ввели своё название в настройках галереи, тогда оно остаётся неизменным (переименование мероприятия на него больше не влияет). Вернуть автоматическое отслеживание можно, удалив название в настройках галереи",
    ],
  },
  {
    version: "2.11.7",
    date: "2026-09-06",
    changes: [
      "הצעת מחיר ללידים: הלקוח/ה יכולים עכשיו לאשר את ההצעה ולמלא שאלון פרטי אירוע (תאריך, שעות, מיקום) — המערכת פותחת אירוע חדש אוטומטית ושולחת אליכם מייל עם כל הפרטים",
      "תוקן באג שגרם ליצירת הגלריה האוטומטית עבור אירוע חדש להיכשל בשקט (ללא הודעת שגיאה) — גלריות שנפגעו מזה תוקנו",
      "גלריות: הועלתה איכות תצוגת התמונות כדי שהקטנת הגודל לצפייה מהירה לא תורגש",
    ],
    en: [
      "Price quotes for leads: clients can now approve the quote and fill in an event details questionnaire (date, hours, location) — the system opens a new event automatically and sends you an email with all the details",
      "Fixed a bug that made the automatic gallery creation for a new event fail silently (with no error message) — affected galleries were fixed",
      "Galleries: raised the photo display quality so that downsizing for fast viewing isn't noticeable",
    ],
    ru: [
      "Ценовые предложения для заявок: клиенты теперь могут одобрить предложение и заполнить анкету о мероприятии (дата, время, место) — система автоматически открывает новое мероприятие и отправляет вам письмо со всеми данными",
      "Исправлена ошибка, из-за которой автоматическое создание галереи для нового мероприятия молча не срабатывало (без сообщения об ошибке) — затронутые галереи исправлены",
      "Галереи: повышено качество отображения фото, чтобы уменьшение для быстрого просмотра было незаметно",
    ],
  },
  {
    version: "2.11.6",
    date: "2026-09-06",
    changes: [
      "פורטל הלקוח: באירועים מסוג פרילנס כבר לא מוצג פרטי מקדמה ויתרה — לא רלוונטי לחבילות האלה",
    ],
    en: [
      "Client portal: freelance events no longer show deposit and balance details — not relevant for these packages",
    ],
    ru: [
      "Портал клиента: для мероприятий типа «фриланс» больше не показываются предоплата и остаток — для этих пакетов это неактуально",
    ],
  },
  {
    version: "2.11.5",
    date: "2026-09-06",
    changes: [
      "העלאת תמונות: הוסרה אפשרות הריצה ברקע — מסך ההעלאה נשאר פתוח עד לסיום. במקום זאת, אם יצאתם מהאפליקציה תוך כדי, תקבלו מייל עם קישור לגלריה ברגע שההעלאה מסתיימת",
      "העלאת תמונות: אי אפשר יותר להתחיל העלאה בגלריה אחת בזמן שיש העלאה פעילה בגלריה אחרת — המערכת מציגה את ההעלאה הפעילה וניתן לבטל אותה כדי להתחיל חדשה",
    ],
    en: [
      "Photo upload: removed the background option — the upload screen stays open until it finishes. Instead, if you leave the app midway, you'll get an email with a link to the gallery as soon as the upload finishes",
      "Photo upload: you can no longer start an upload in one gallery while there's an active upload in another — the system shows the active upload, and you can cancel it to start a new one",
    ],
    ru: [
      "Загрузка фото: убрана работа в фоне — экран загрузки остаётся открытым до завершения. Вместо этого, если вы выйдете из приложения в процессе, вы получите письмо со ссылкой на галерею, как только загрузка закончится",
      "Загрузка фото: больше нельзя начать загрузку в одной галерее, пока идёт загрузка в другой — система показывает активную загрузку, и её можно отменить, чтобы начать новую",
    ],
  },
  {
    version: "2.11.4",
    date: "2026-09-06",
    changes: [
      "הודעות ללקוח/ה בכל שלב שמול הלקוח (וואטסאפ) שולחות עכשיו קישור לגלריה של האירוע במקום לפורטל הלקוח, במידה ויש גלריה מפורסמת ופעילה מקושרת — אם אין, נשלח כרגיל קישור לפורטל",
    ],
    en: [
      "Client messages at every client-facing stage (WhatsApp) now send a link to the event's gallery instead of the client portal, if there's a published, active linked gallery — if not, a portal link is sent as usual",
    ],
    ru: [
      "Сообщения клиенту на каждом этапе, связанном с клиентом (WhatsApp), теперь содержат ссылку на галерею мероприятия вместо портала клиента, если есть опубликованная активная привязанная галерея — если нет, как обычно отправляется ссылка на портал",
    ],
  },
  {
    version: "2.11.3",
    date: "2026-09-06",
    changes: [
      "בונה הצעות מחיר: הצעה חדשה כבר לא נטענת עם רשימת הספקים של הצעה קודמת — מתחילה ריקה, אלא אם נבחרת הצעה קודמת לטעינה במפורש",
      "בונה הצעות מחיר: כל שורת ספק היא עכשיו רשימה נפתחת מתוך הספקים השמורים בהגדרות (תמחור וחבילות), עם אפשרות טקסט חופשי כברירה אחרונה",
    ],
    en: [
      "Price quote builder: a new quote no longer loads with the vendor list of a previous quote — it starts empty, unless you explicitly choose a previous quote to load",
      "Price quote builder: every vendor row is now a dropdown of the vendors saved in Settings (Pricing & packages), with a free-text option as a last resort",
    ],
    ru: [
      "Конструктор ценовых предложений: новое предложение больше не загружается со списком поставщиков предыдущего — оно начинается пустым, если только вы явно не выберете предыдущее предложение для загрузки",
      "Конструктор ценовых предложений: каждая строка поставщика теперь — выпадающий список поставщиков из настроек (Цены и пакеты), со свободным текстом в крайнем случае",
    ],
  },
  {
    version: "2.11.2",
    date: "2026-09-05",
    changes: [
      "תוקן באג שגרם להודעות מייל (סיום ייצוא, חתימת חוזה, בחירת תמונות, תזכורות מנוי ועוד) לא להגיע בכלל בחלק מהמקרים",
    ],
    en: [
      "Fixed a bug that in some cases stopped email notifications (export finished, contract signed, photo selection, subscription reminders and more) from arriving at all",
    ],
    ru: [
      "Исправлена ошибка, из-за которой в некоторых случаях письма-уведомления (завершение экспорта, подписание договора, выбор фото, напоминания о подписке и другие) вообще не приходили",
    ],
  },
  {
    version: "2.11.1",
    date: "2026-09-05",
    changes: [
      "ייצוא אלבום: תוקן באג שגרם להודעת שגיאה כללית ולא ברורה במקרים מסוימים — עכשיו מוצגת סיבה מדויקת יותר",
    ],
    en: [
      "Album export: fixed a bug that showed a generic, unclear error message in some cases — a more precise reason is now shown",
    ],
    ru: [
      "Экспорт альбома: исправлена ошибка, из-за которой в некоторых случаях показывалось общее непонятное сообщение — теперь указывается более точная причина",
    ],
  },
  {
    version: "2.11.0",
    date: "2026-09-05",
    changes: [
      "מסך הבית, ייצוא מהיר: אפשר עכשיו \"להמשיך ברקע\" — הייצוא ממשיך לרוץ גם אם עוברים לעמוד אחר, עם הודעה צפה בראש העמוד בסיום, בכל עמוד שנמצאים בו",
    ],
    en: [
      "Home screen, quick export: you can now \"Continue in background\" — the export keeps running even if you move to another page, with a floating notice at the top of whatever page you're on when it finishes",
    ],
    ru: [
      "Главный экран, быстрый экспорт: теперь можно «Продолжить в фоне» — экспорт продолжается, даже если вы перешли на другую страницу, а по завершении вверху любой открытой страницы появляется уведомление",
    ],
  },
  {
    version: "2.10.1",
    date: "2026-09-05",
    changes: [
      "מסך הבית, ייצוא מהיר: לחיצה על ייצוא מציגה עכשיו את מסך ההתקדמות המלא עם הספינר, במקום רק טקסט על הכפתור",
    ],
    en: [
      "Home screen, quick export: tapping export now shows the full progress screen with the spinner, instead of just text on the button",
    ],
    ru: [
      "Главный экран, быстрый экспорт: нажатие на экспорт теперь показывает полный экран прогресса со спиннером, а не только текст на кнопке",
    ],
  },
  {
    version: "2.10.0",
    date: "2026-09-05",
    changes: [
      "ייצוא אלבום: כשיש ייצוא פעיל לגלריה (מכל מסך שהוא), לחיצה על כפתור ייצוא נוסף מציגה את ההתקדמות של הייצוא הפעיל במקום להתחיל ייצוא מתחרה — צריך לבטל אותו כדי להתחיל אחר",
    ],
    en: [
      "Album export: when there's an active export for a gallery (from any screen), tapping another export button shows the active export's progress instead of starting a competing export — you need to cancel it to start another",
    ],
    ru: [
      "Экспорт альбома: если для галереи уже идёт экспорт (с любого экрана), нажатие на другую кнопку экспорта показывает прогресс текущего экспорта вместо запуска конкурирующего — чтобы начать другой, его нужно отменить",
    ],
  },
  {
    version: "2.9.0",
    date: "2026-09-05",
    changes: [
      "ייצוא אלבום: הודעת סיום הפעולה כוללת עכשיו כפתור \"שיתוף בוואטסאפ\" ישירות לצ'אט הלקוח/ה (כשיש מספר טלפון שמור בגלריה)",
      "מסך הבית, כפתור \"עיצוב אלבום\": אם לגלריה הנבחרת יש עיצוב אלבום פעיל, אפשר לייצא PDF/JPG/PSD ישירות מהחלונית, בלי להיכנס לכלי העיצוב",
    ],
    en: [
      "Album export: the completion message now includes a \"Share on WhatsApp\" button straight to the client's chat (when a phone number is saved in the gallery)",
      "Home screen, \"Album design\" button: if the selected gallery has an active album design, you can export PDF/JPG/PSD straight from the panel, without opening the design tool",
    ],
    ru: [
      "Экспорт альбома: сообщение о завершении теперь содержит кнопку «Поделиться в WhatsApp» прямо в чат клиента (если в галерее сохранён номер телефона)",
      "Главный экран, кнопка «Дизайн альбома»: если у выбранной галереи есть активный дизайн альбома, можно экспортировать PDF/JPG/PSD прямо из панели, не открывая инструмент дизайна",
    ],
  },
  {
    version: "2.8.0",
    date: "2026-09-05",
    changes: [
      "ייצוא PDF: עודכן שוב שרת הרינדור לגרסה העדכנית — למקרה שקובץ מיוצא חסר שינויים אחרונים",
      "ייצוא אלבום (PDF/JPG/PSD): הודעת סיום הפעולה מופיעה עכשיו בראש המסך במקום בתחתית, כדי שלא תפספסו אותה",
      "ייצוא אלבום (PDF/JPG/PSD): נשלחת עכשיו הודעת מייל אוטומטית לכתובת שלכם בסיום כל ייצוא, גם אם סגרתם את המסך",
      "מד ההתקדמות בכל פעולות הייצוא וההעלאה רץ עכשיו חלק לגמרי, בלי קפיצות",
    ],
    en: [
      "PDF export: the rendering server was updated to the latest version again — in case an exported file was missing recent changes",
      "Album export (PDF/JPG/PSD): the completion message now appears at the top of the screen instead of the bottom, so you don't miss it",
      "Album export (PDF/JPG/PSD): an automatic email is now sent to your address when every export finishes, even if you closed the screen",
      "The progress bar in all export and upload actions now runs completely smoothly, without jumps",
    ],
    ru: [
      "Экспорт PDF: сервер рендеринга снова обновлён до последней версии — на случай, если в экспортированном файле не хватало последних изменений",
      "Экспорт альбома (PDF/JPG/PSD): сообщение о завершении теперь появляется вверху экрана, а не внизу, чтобы вы его не пропустили",
      "Экспорт альбома (PDF/JPG/PSD): по завершении каждого экспорта на ваш адрес автоматически приходит письмо, даже если вы закрыли экран",
      "Индикатор прогресса во всех экспортах и загрузках теперь движется полностью плавно, без скачков",
    ],
  },
  {
    version: "2.7.0",
    date: "2026-09-03",
    changes: [
      "העלאת תמונות: שיפור משמעותי במהירות — תמונות מועלות עכשיו כמה בבת אחת במקום אחת אחרי השנייה",
      "העלאת תמונות: תוקן באג שבו מד ההתקדמות היה נראה \"נתקע\" כל כמה אחוזים — עכשיו מתעדכן ברציפות תוך כדי העלאת כל תמונה",
      "העלאת תמונות: אפשר עכשיו להעביר את מסך ההעלאה לרקע ולהמשיך לעבוד — עם הודעה צפה בסיום",
    ],
    en: [
      "Photo upload: a big speed improvement — photos are now uploaded several at a time instead of one after another",
      "Photo upload: fixed a bug where the progress bar seemed to \"get stuck\" every few percent — it now updates continuously while each photo uploads",
      "Photo upload: you can now send the upload screen to the background and keep working — with a floating notice when it finishes",
    ],
    ru: [
      "Загрузка фото: значительное ускорение — фото теперь загружаются по несколько одновременно, а не по одному",
      "Загрузка фото: исправлена ошибка, из-за которой индикатор прогресса как будто «застревал» каждые несколько процентов — теперь он обновляется непрерывно во время загрузки каждого фото",
      "Загрузка фото: теперь можно свернуть экран загрузки в фон и продолжать работу — с уведомлением по завершении",
    ],
  },
  {
    version: "2.6.0",
    date: "2026-09-03",
    changes: [
      "ייצוא PDF: תוקן באג שגרם לקובץ המיוצא לפעמים לא לכלול שינויים אחרונים שנשמרו בעורך — שרת הרינדור עודכן לגרסה העדכנית",
      "כלי לעיצוב אלבומים: הגודל ההתחלתי של פאנל עריכת התמונה הוגדל",
    ],
    en: [
      "PDF export: fixed a bug where the exported file sometimes didn't include recent changes saved in the editor — the rendering server was updated to the latest version",
      "Album design tool: the initial size of the photo editing panel was increased",
    ],
    ru: [
      "Экспорт PDF: исправлена ошибка, из-за которой экспортированный файл иногда не содержал последних изменений, сохранённых в редакторе — сервер рендеринга обновлён до последней версии",
      "Инструмент дизайна альбомов: увеличен начальный размер панели редактирования фото",
    ],
  },
  {
    version: "2.5.1",
    date: "2026-09-03",
    changes: [
      "כלי לעיצוב אלבומים: מיקום פאנל עריכת התמונה נשמר עכשיו גם אחרי מעבר לתמונה אחרת — לא מתאפס יותר לכל תמונה חדשה, בדיוק כמו הגודל",
    ],
    en: [
      "Album design tool: the position of the photo editing panel is now kept after switching to another photo — it no longer resets for every new photo, just like the size",
    ],
    ru: [
      "Инструмент дизайна альбомов: положение панели редактирования фото теперь сохраняется при переходе к другому фото — оно больше не сбрасывается для каждого нового фото, как и размер",
    ],
  },
  {
    version: "2.5.0",
    date: "2026-09-03",
    changes: [
      "כלי לעיצוב אלבומים: פאנל עריכת התמונה חזר לגודל קבוע (16x7 ס״מ, זהה לכל תמונה) עם אפשרות לשנות את הגודל בגרירה חופשית",
      "כלי לעיצוב אלבומים: ידית הגרירה של הפאנלים הצפים בולטת יותר — צבע וסימן ברור שאפשר להזיז",
      "כלי לעיצוב אלבומים: כפתור \"החל על כל התמונות בדף\" בפאנל צל וקו מתאר חזר לחול על כל התמונות (במקום רק המסומנות)",
    ],
    en: [
      "Album design tool: the photo editing panel is back to a fixed size (16x7 cm, the same for every photo) with the option to resize it by free dragging",
      "Album design tool: the drag handle of the floating panels stands out more — a clear color and mark that it can be moved",
      "Album design tool: the \"Apply to all photos on the page\" button in the shadow and outline panel applies to all photos again (instead of only the selected ones)",
    ],
    ru: [
      "Инструмент дизайна альбомов: панель редактирования фото снова фиксированного размера (16x7 см, одинаково для любого фото) с возможностью менять размер свободным перетаскиванием",
      "Инструмент дизайна альбомов: ручка перетаскивания плавающих панелей стала заметнее — понятный цвет и знак, что её можно двигать",
      "Инструмент дизайна альбомов: кнопка «Применить ко всем фото на странице» в панели тени и контура снова применяется ко всем фото (а не только к выбранным)",
    ],
  },
  {
    version: "2.4.2",
    date: "2026-09-03",
    changes: [
      "כלי לעיצוב אלבומים: אורך פאנל עריכת התמונה גדל ב-8 ס״מ נוספים (סה״כ 16 ס״מ מעבר לגובה התמונה)",
    ],
    en: [
      "Album design tool: the length of the photo editing panel grew by another 8 cm (16 cm in total beyond the photo's height)",
    ],
    ru: [
      "Инструмент дизайна альбомов: длина панели редактирования фото увеличена ещё на 8 см (всего на 16 см больше высоты фото)",
    ],
  },
  {
    version: "2.4.1",
    date: "2026-09-03",
    changes: [
      "כלי לעיצוב אלבומים: אורך פאנל עריכת התמונה גדל ב-8 ס״מ נוספים",
    ],
    en: [
      "Album design tool: the length of the photo editing panel grew by another 8 cm",
    ],
    ru: [
      "Инструмент дизайна альбомов: длина панели редактирования фото увеличена ещё на 8 см",
    ],
  },
  {
    version: "2.4.0",
    date: "2026-09-03",
    changes: [
      "כלי לעיצוב אלבומים: פאנל עריכת התמונה עכשיו בגודל של אזור התמונה הנבחרת עצמה (אורך ורוחב תואמים), במקום גודל קבוע",
    ],
    en: [
      "Album design tool: the photo editing panel is now the size of the selected photo's area (matching length and width), instead of a fixed size",
    ],
    ru: [
      "Инструмент дизайна альбомов: панель редактирования фото теперь размером с область выбранного фото (совпадающие длина и ширина), а не фиксированного размера",
    ],
  },
  {
    version: "2.3.0",
    date: "2026-09-03",
    changes: [
      "כלי לעיצוב אלבומים: פאנל עריכת התמונה עכשיו בגודל אחיד (10x7.5 ס״מ) ובמקום קבוע על המסך, לא משנה איזו תמונה נבחרה",
      "כלי לעיצוב אלבומים: כל פאנל צף (עריכת תמונה, עיטור, צורה, טקסט, התפריט העגול) ניתן עכשיו לגרירה חופשית וחלקה לכל מקום בעמוד",
      "כלי לעיצוב אלבומים: מחווני הצל (עוצמה/מרחק/טשטוש) זזים עכשיו כל אחד בנפרד",
    ],
    en: [
      "Album design tool: the photo editing panel is now a uniform size (10x7.5 cm) in a fixed spot on the screen, no matter which photo is selected",
      "Album design tool: every floating panel (photo editing, ornament, shape, text, the circle menu) can now be dragged freely and smoothly anywhere on the page",
      "Album design tool: the shadow sliders (strength/distance/blur) now each move independently",
    ],
    ru: [
      "Инструмент дизайна альбомов: панель редактирования фото теперь единого размера (10x7.5 см) и в фиксированном месте экрана, независимо от выбранного фото",
      "Инструмент дизайна альбомов: любую плавающую панель (редактирование фото, украшение, фигура, текст, круговое меню) теперь можно свободно и плавно перетащить в любое место страницы",
      "Инструмент дизайна альбомов: ползунки тени (сила/расстояние/размытие) теперь двигаются каждый отдельно",
    ],
  },
  {
    version: "2.2.0",
    date: "2026-09-03",
    changes: [
      "כלי לעיצוב אלבומים: תוקן באג שבו קו מתאר שנוסף לתמונה לא הופיע בכלל בעיצוב חופשי",
      "כלי לעיצוב אלבומים: נוספו שני מחוונים נפרדים לצל — מרחק וטשטוש — בנוסף לעוצמה, גם בעריכה החופשית וגם בייצוא (PDF/JPG/PSD)",
      "כלי לעיצוב אלבומים (מחשב): פאנל עריכת התמונה עכשיו נפתח כשכבה מעל אזור התמונות עצמו, במקום מחוץ לקנבס",
    ],
    en: [
      "Album design tool: fixed a bug where an outline added to a photo didn't show at all in free design",
      "Album design tool: added two separate shadow sliders — distance and blur — in addition to strength, both in free editing and in export (PDF/JPG/PSD)",
      "Album design tool (desktop): the photo editing panel now opens as a layer over the photo area itself, instead of outside the canvas",
    ],
    ru: [
      "Инструмент дизайна альбомов: исправлена ошибка, из-за которой контур, добавленный к фото, вообще не отображался в свободном дизайне",
      "Инструмент дизайна альбомов: добавлены два отдельных ползунка тени — расстояние и размытие — в дополнение к силе, и в свободном редактировании, и при экспорте (PDF/JPG/PSD)",
      "Инструмент дизайна альбомов (компьютер): панель редактирования фото теперь открывается слоем поверх самой области фото, а не за пределами холста",
    ],
  },
  {
    version: "2.1.0",
    date: "2026-09-03",
    changes: [
      "תיקון: שמירת אירוע עם שעת התחלה אך ללא שעת סיום גרמה לפעמים לכישלון בשמירת האירוע ביומן Google — עכשיו נקבעת שעת סיום משוערת של שעה אחת אוטומטית",
    ],
    en: [
      "Fix: saving an event with a start time but no end time sometimes failed to save the event to Google Calendar — an estimated end time of one hour is now set automatically",
    ],
    ru: [
      "Исправление: сохранение мероприятия со временем начала, но без времени окончания иногда не сохраняло его в Google Календарь — теперь автоматически ставится примерное время окончания через час",
    ],
  },
  {
    version: "2.0.9",
    date: "2026-09-03",
    changes: [
      "ייצוא PDF: הרף לגודל קובץ עלה ל-150MB וניסיון האיכות הראשון עודכן ל-45% (במקום 60%) — פחות ניסיונות חוזרים, ייצוא מהיר ויציב יותר",
    ],
    en: [
      "PDF export: the file size limit was raised to 150MB and the first quality attempt was set to 45% (instead of 60%) — fewer retries, a faster and more stable export",
    ],
    ru: [
      "Экспорт PDF: предел размера файла повышен до 150 МБ, а первая попытка качества — 45% (вместо 60%) — меньше повторов, экспорт быстрее и стабильнее",
    ],
  },
  {
    version: "2.0.8",
    date: "2026-09-02",
    changes: [
      "ייצוא אלבום: לחיצה על כפתור ייצוא בזמן שייצוא אחר כבר רץ ברקע פותחת עכשיו את מסך ההתקדמות של הייצוא הרץ, במקום להתחיל ייצוא נוסף במקביל — צריך לבטל את הפעולה הרצה כדי להתחיל אחת חדשה",
    ],
    en: [
      "Album export: tapping an export button while another export is already running in the background now opens the running export's progress screen, instead of starting another export in parallel — you need to cancel the running one to start a new one",
    ],
    ru: [
      "Экспорт альбома: нажатие на кнопку экспорта, когда другой экспорт уже идёт в фоне, теперь открывает экран прогресса текущего экспорта, а не запускает ещё один параллельно — чтобы начать новый, нужно отменить текущий",
    ],
  },
  {
    version: "2.0.7",
    date: "2026-09-02",
    changes: [
      "ייצוא PDF: הוסרה האפשרות לבחור בין איכות הדפסה לאיכות רשת — הייצוא תמיד באיכות רשת, שמספיקה לחלוטין ומייצרת קובץ הרבה יותר מהר",
    ],
    en: [
      "PDF export: removed the choice between print quality and web quality — the export is always web quality, which is entirely sufficient and produces the file much faster",
    ],
    ru: [
      "Экспорт PDF: убран выбор между качеством для печати и для веба — экспорт всегда в веб-качестве, которого вполне достаточно и которое создаёт файл гораздо быстрее",
    ],
  },
  {
    version: "2.0.6",
    date: "2026-09-02",
    changes: [
      "ייצוא אלבום: אחוז ההתקדמות של ייצוא PDF כבר לא מתאפס ל-0% כשהמערכת מנסה לצמצם את גודל הקובץ — עולה ברצף אחד עד 100%",
      "מסכי ייצוא (PDF/JPG/PSD): אפשר לסגור את המסך ולהמשיך ברקע — כשהייצוא מסתיים מופיע התראה צפה עם כפתור הורדה",
      "תיקון: ביטול ייצוא עצר רק את המעקב במסך אך לא תמיד את הפעולה עצמה בשרת",
    ],
    en: [
      "Album export: the PDF export progress no longer resets to 0% when the system tries to reduce the file size — it rises steadily all the way to 100%",
      "Export screens (PDF/JPG/PSD): you can close the screen and continue in the background — when the export finishes, a floating notice with a download button appears",
      "Fix: canceling an export stopped only the tracking on screen, but not always the action itself on the server",
    ],
    ru: [
      "Экспорт альбома: прогресс экспорта PDF больше не сбрасывается до 0%, когда система пытается уменьшить размер файла — он растёт непрерывно до 100%",
      "Экраны экспорта (PDF/JPG/PSD): экран можно закрыть и продолжить в фоне — по завершении экспорта появляется уведомление с кнопкой скачивания",
      "Исправление: отмена экспорта останавливала только отслеживание на экране, но не всегда сам процесс на сервере",
    ],
  },
  {
    version: "2.0.5",
    date: "2026-09-02",
    changes: [
      "תיקון: שדות שעת התחלה/סיום ושעת הגעה לצילומי משפחה בטופס אירוע חדש (ובעריכת אירוע) לא נפתחו במכשירי iOS מסוימים",
    ],
    en: [
      "Fix: the start/end time and family photo arrival time fields in the new event form (and when editing an event) didn't open on some iOS devices",
    ],
    ru: [
      "Исправление: поля времени начала/окончания и времени прибытия на семейную съёмку в форме нового мероприятия (и при редактировании) не открывались на некоторых устройствах iOS",
    ],
  },
  {
    version: "2.0.4",
    date: "2026-08-31",
    changes: [
      "שיפור משמעותי בדיוק זיהוי הפרצופים בגלריה: מנוע זיהוי חזק יותר (פחות פרצופים שלא זוהו בתמונות קבוצתיות/זוויות/תנועה), סינון פרצופים קטנים ולא ברורים ברקע, ואלגוריתם קיבוץ יציב יותר שפחות מערבב בין אנשים שונים",
    ],
  },
  {
    version: "2.0.3",
    date: "2026-08-31",
    changes: [
      "גלריות: לחיצה כפולה על גלריה בעמוד הגלריות פותחת תפריט פעולות מהיר — הוספת כל הגלריה (או לשוניות נבחרות ממנה) לפורטפוליו, שיתוף הגלריה, ומחיקה — בלי לפתוח את הגלריה",
      "פורטפוליו: כפתורי \"העתקת קישור\" ו\"שיתוף\" (וואטסאפ / QR / אחר) חדשים בהגדרות הפורטפוליו",
      "פורטפוליו: אפשרות חדשה להעלות תמונות ישירות לפורטפוליו, עם תיוג ללשונית, בלי לעבור דרך גלריה של לקוח/ה",
      "פורטפוליו: מסך ניהול חדש להצגת כל הלשוניות שבפורטפוליו והסרתן (עם אישור) — תמונה שנוספה לפורטפוליו נשארת שם עד שמחליטים להסיר אותה, גם אם הגלריה המקורית שממנה היא הגיעה נמחקת",
      "תיקון: תוויות (\"קנבס\" וכו') שהלקוח/ה מוסיפים לתמונה דרך סימן היהלום מופיעות כלשונית סינון בעמוד הגלריה גם אם התמונה לא סומנה כמועדפת",
    ],
  },
  {
    version: "2.0.2",
    date: "2026-08-31",
    changes: [
      "תיקון משמעותי: מחיקת כמה תמונות בבת אחת מגלריה גדולה נכשלה בשקט ולא מחקה כלום — התמונות עכשיו נמחקות מיידית ולצמיתות גם בגלריות עם אלפי תמונות",
      "תיקון: תצוגות מקדימות (preview) של תמונות שנמחקות מגלריה עכשיו נמחקות בפועל מהאחסון, לא רק רשומת התמונה עצמה",
    ],
  },
  {
    version: "2.0.1",
    date: "2026-08-31",
    changes: [
      "הודעות ללקוח/ה: התג של שעת ההגעה לצילומי משפחה שונה מ-{{שעת_הגעה}} ל-{{צילומי_משפחה}} (התג הישן ימשיך לעבוד בהודעות שכבר נשמרו איתו)",
      "הודעות ללקוח/ה: שימו לב — תבנית שכבר שמרתם עם תגים \"עירומים\" (בלי טקסט מקדים) ממשיכה להישלח כך; כדי לקבל את הטקסט המקדים החדש יש למחוק את התג הישן ולהוסיף אותו מחדש דרך \"+ הוספת פרט\", או להקליד את הטקסט ידנית",
    ],
  },
  {
    version: "2.0.0",
    date: "2026-08-31",
    changes: [
      "הודעות ללקוח/ה: הוספת פרטים דרך התפריט (\"+ הוספת פרט\") מוסיפה עכשיו טקסט מקדים ברור יותר — לדוגמה {{תאריך}} מוסיף \"תאריך: \", {{שעות}} מוסיף \"שעות עבודה: \" וכו'",
      "הודעות ללקוח/ה: הוספת \"קישור\" מהתפריט מוסיפה עכשיו שורת הקדמה (\"מצורף קישור לפורטל האישי שלכם למעקב התקדמות:\") לפני הקישור עצמו",
    ],
  },
  {
    version: "1.99.0",
    date: "2026-08-31",
    changes: [
      "תיקון: כרטיס אירוע שחסרים בו נתוני שלבים כבר לא קורס למסך שגיאה — פשוט מדלג על השלב החסר ומציג את שאר הכרטיס כרגיל",
      "תיקון: שורה ביומן ההתראות של האירוע עם קישור ארוך (כמו קישור ליומן Google) גרמה לגלילה לצדדים בכל כרטיס האירוע — הטקסט עכשיו נשבר לשורה חדשה במקום לדחוף את הכרטיס לרוחב",
    ],
  },
  {
    version: "1.98.0",
    date: "2026-08-31",
    changes: [
      "תיקון: מחיקת כמה תמונות/כל התמונות מגלריה כעת בטוחה גם בגלריות גדולות מאוד — קובץ שנכשל למחוק מהאחסון כבר לא משאיר את התמונה \"נעלמת\" מהגלריה בזמן שהקובץ עצמו עדיין תפוס באחסון",
      "הגבלה של 8,000 תמונות לגלריה — מונעת מצב שבו העלאה גדולה מדי נתקעת או קורסת באמצע בלי אפשרות להמשיך",
    ],
  },
  {
    version: "1.97.0",
    date: "2026-08-31",
    changes: [
      "הודעות ללקוח/ה בוואטסאפ (כפתור \"שליחת עדכון\", עדכון אוטומטי בסיום שלב, והודעת סגירת אירוע חדש) שולחות עכשיו תמיד בדיוק את התבנית ששמרתם בהגדרות → \"הודעות ללקוח/ה\", כולל שעות, מקדמה/יתרה וכל שאר הפרטים",
      "בניית חבילה מותאמת אישית: מסך חדש עם אפקט טשטוש, ממורכז ומעל פס הניווט העליון",
      "בניית חבילה מותאמת אישית: כל שלב מסומן עכשיו כ\"שלב פנימי\" או \"שלב מול הלקוח/ה\" במתג פשוט אחד",
      "בניית חבילה מותאמת אישית: בתא שם השלב אפשר להקליד טקסט חופשי, וגם לבחור מרשימה נפתחת עם כל 14 שלבי החבילה המלאה",
      "בניית חבילה מותאמת אישית: לשלב עם שם שלא קיים ברשימה שמסומן כ\"מול הלקוח/ה\" אפשר לכתוב תבנית הודעה אישית משלו (עם הוספת פרטים ואימוג'ים) — התבנית מופיעה גם בלשונית \"הודעות ללקוח/ה\"",
      "לשונית \"תמחור\" בהגדרות שונתה ל\"תמחור וחבילות צילום\"",
    ],
  },
  {
    version: "1.96.0",
    date: "2026-08-31",
    changes: [
      "גלריות: אפשרות חדשה בהגדרות (\"הרשאות ושמירה\") — \"אפשרות העלאת תמונות ע\\\"י הלקוח/ה\", כבויה כברירת מחדל. כשמופעלת, גלריית הלקוח/ה מציגה חלונית גרירה גדולה להעלאת תמונות ותיקיות שלמות (בדיוק כמו אצלך בניהול הגלריה), כולל יצירת לשוניות תיקיות אוטומטית ומד טעינה עגול וירוק. כיבוי המתג חוסם מיד כל העלאה נוספת מצד הלקוח/ה",
      "גלריות: אפשר לפרסם גלריה גם כשעדיין אין בה תמונות — שימושי כשמכינים גלריה ריקה ללקוח/ה שיעלו אליה בעצמם",
      "תיקון עיצוב: בהגדרות גלריה, שדות \"תאריך הצילום\" ו\"משך שמירת הגלריה\" יושרו כך שיש רווח אחיד ביניהם והם לא חופפים זה לזה",
    ],
  },
  {
    version: "1.95.0",
    date: "2026-08-30",
    changes: [
      "לידים: יומיים אחרי שליחת הצעת מחיר, ואם עדיין לא נסגר, תתקבל תזכורת מעקב עם כל פרטי הליד (שם, טלפון, תאריך אירוע, סוג אירוע, סכום ההצעה) — במייל וגם כהתראה באפליקציה עם כפתור שליחה בוואטסאפ ללקוח/ה מוכן ללחיצה",
      "לידים: אם יש כתובת מייל ללקוח/ה, נשלחת אליהם אוטומטית גם תזכורת עדינה שההצעה עדיין פתוחה",
      "כרטיס אירוע: הכפתור \"יצירת גלריה\" הפך ל\"יצירה/קישור גלריה\" — אפשר עכשיו לבחור בין גלריה חדשה לבין קישור לגלריה קיימת שכבר יצרת (עם אישור כפול), וגם לנתק גלריה מאירוע בחזרה (גם הוא עם אישור כפול)",
    ],
  },
  {
    version: "1.94.0",
    date: "2026-08-30",
    changes: [
      "כלי עיצוב אלבומים: מסך התחלה חדש עם 5 תבניות מוכנות בסגנון עיצובי אחיד (מסגרת שחורה וצל עדין) — בכל תבנית אפשר לבחור מספר עמודים וסה\"כ תמונות לפני היצירה, והתמונות מונחות כבר בפריסה מוכנה שרק צריך לגרור אליה תמונה",
      "רשימת תבניות שמורות אישית ואפשרות \"עיצוב אישי\" (התחלה מדף ריק, כמו קודם) מופיעות עכשיו יחד עם 5 התבניות המוכנות באותה רשימה אחת",
    ],
  },
  {
    version: "1.93.0",
    date: "2026-08-30",
    changes: [
      "בכלי עיצוב אלבומים: תצוגה מקדימה בריחוף עכבר כבויה כברירת מחדל בפתיחת עמוד חדש",
      "גרירת 2 תמונות ומעלה לעמוד ריק מסדרת אותן אוטומטית ברשת מעוצבת שמכסה כ-85% מהעמוד, כל תמונה בלי חיתוך — אפשר להחליף לתבנית אחרת בכל שלב",
      "סימון כמה תמונות מציג מסגרת מקווקוות סביב כל הבחירה, לצד שמירת המרחקים בין התמונות בשינוי גודל (כבר עבד, עודכן עם אינדיקציה חזותית)",
      "ייצוא PDF: שם הכפתור עודכן ל\"ייצוא PDF\", נוספה בחירת איכות (גבוהה להדפסה / בינונית מותאם לרשת), ואפשרות לבחור את מיקום השמירה בדפדפנים שתומכים בכך",
      "בגלריה: הוספת תגית טקסט חופשי לתמונה מועדפת (סמל יהלום, לצד הלב) — למשל \"קנבס\" — עם סינון לפי תגית בפאנל התמונות שנבחרו",
      "כלי עיצוב אלבומים זמין כרגע רק בחשבון האדמין, עד להשלמת הליטוש",
    ],
  },
  {
    version: "1.92.0",
    date: "2026-08-30",
    changes: [
      "בכלי עיצוב אלבומים: כפתור \"עמוד חדש\" נמצא כעת גם בתוך מסך העיצוב עצמו — עם וידוא שמירה אם יש שינויים שלא נשמרו",
      "תוקן: הזזת צורה קדימה/אחורה לא הזיזה בפועל צורות עם קו מתאר בלבד (מלבן/עיגול ריקים) ביחס לתמונות בקנבס",
      "תוקן באג משמעותי בייצוא JPG/PSD: סדר השכבות בקובץ המיוצא התעלם מהסידור קדימה/אחורה שנקבע בעורך — צורות תמיד יוצאו מעל תמונות, גם אם הוגדרו מתחתיהן",
      "תוקן: כשלון בעיבוד עמוד בודד בייצוא JPG/PSD כבר לא מפיל בשקט את כל שאר העמודים בקובץ",
    ],
  },
  {
    version: "1.91.0",
    date: "2026-08-30",
    changes: [
      "בבחירת תמונת שער לגלריה (מהגדרות הגלריה או מכפתור \"קביעה כשער\" בתצוגת התמונה) נפתח כעת מסך מרכוז — גררו על התמונה כדי לבחור את הנקודה שתישאר במרכז, עם תצוגה מקדימה חיה של נייד ומחשב במקביל",
    ],
  },
  {
    version: "1.90.0",
    date: "2026-08-30",
    changes: [
      "נוספה דף מדיניות פרטיות (/privacy) — נדרש כדי להגיש את חיבור יומן Google לאימות מול Google ולפתוח אותו לכל המשתמשים",
    ],
  },
  {
    version: "1.89.0",
    date: "2026-08-30",
    changes: [
      "תוקן: גלריה עם הרבה מאוד תמונות (שהועלו במספר סבבים, למשל 1000 ואז עוד 500) עלולה הייתה להציג רק חלק מהתמונות — כל טעינת תמונות של גלריה עכשיו דפדוף אמיתי, לא תלויה יותר במגבלת שורות של השרת",
      "תוקן קריסת רינדור בצד השרת בדף ניהול הגלריה (שגרמה למעבר לרינדור בצד הלקוח בלבד בכל טעינה)",
    ],
  },
  {
    version: "1.88.0",
    date: "2026-08-30",
    changes: [
      "בכלי עיצוב אלבומים: קליק ימני על תמונה מועדפת פותח תפריט עם ״קביעה כרקע״ ו(כשהיא כבר הרקע)״הסרה״, במקום תפריט המערכת",
      "תמונה שנקבעה כרקע נשארת זמינה במאגר התמונות המועדפות",
      "כפתור השמירה/פתיחה של שקיפות וטשטוש הרקע עבר לעיגול קטן בפינה השמאלית התחתונה של הקנבס — נגיש גם בטלפון",
    ],
  },
  {
    version: "1.87.0",
    date: "2026-08-30",
    changes: [
      "בכלי עיצוב אלבומים: בחירת תבנית כשכבר יש תמונות על הקנבס מעצבת מחדש את הדף עם אותן תמונות, במקום להחליף אותן בתמונות אחרות מהמאגר",
      "אם יש פחות תמונות מתאים בתבנית, המסגרות העודפות נשארות ריקות למילוי ידני",
      "גרירת כמה תמונות יחד לקנבס שכבר יש בו מסגרות ריקות (מתבנית שנבחרה קודם) ממלאת אותן לפי ההתאמה הכי טובה לכיוון התמונה, במקום ליצור מסגרות חדשות תמיד",
    ],
  },
  {
    version: "1.86.0",
    date: "2026-08-30",
    changes: [
      "בכלי עיצוב אלבומים: קיצורי מקלדת חדשים — Cmd/Ctrl+Z לביטול פעולה אחרונה (עד 20 פעולות אחורה), Cmd/Ctrl+A לסימון כל התמונות/עיטורים/צורות בעמוד, ו-T לפתיחת פאנל הוספת טקסט",
      "סימון עם העכבר (גרירת מלבן בחירה) כולל כעת גם צורות שנוספו לקנבס, לא רק תמונות",
    ],
  },
  {
    version: "1.85.0",
    date: "2026-08-30",
    changes: [
      "בכלי עיצוב אלבומים: העיגול האחרון בתפריט הצף של תמונה הפך לכפתור מחיקה עם קו מתאר אדום, במקום פח האשפה",
      "כפתור מחיקה כללי בסרגל הצד הוסר עבור תמונה/עיטור/צורה שכבר יש להם מחיקה בתפריט הצף — נשאר רק עבור טקסט",
      "שינוי גודל של 2 תמונות מסומנות בו-זמנית לא גורם להן יותר לחפוף אחת את השנייה",
      "תוקן ניגודיות כיתוב במצב כהה בכפתור \"תמונת רקע\" ובכפתורי שיתוף/מצגת תמונות בגלריה — כיתוב לא היה קריא",
      "כפתור השמירה בכלי עיצוב האלבומים מודגש כעת בקו מתאר ירוק",
    ],
  },
  {
    version: "1.84.0",
    date: "2026-08-30",
    changes: [
      "תוקן: הפס הכחול בניווט לא חורג יותר מגבולות פס הזכוכית או מגבולות האייקון",
    ],
  },
  {
    version: "1.83.0",
    date: "2026-08-30",
    changes: [
      "עיצוב הניווט העליון עודכן — פס זכוכית עם אייקונים עגולים קומפקטיים, קווי הפרדה, ופס פעיל שעובר בסלייד בין לשוניות",
      "בתוך גלריה: שיתוף, זיהוי פרצופים, תצוגה מקדימה ומצגת תמונות עברו לאייקונים קטנים לצד המועדפים; תפריט הפעולות המרכזי נשאר עם קישור, הגדרות ועיצוב אלבום בלבד",
      "עדכון תוכן ותמונה במדריך הגלריות כך שישקפו את מדיניות משך השמירה החדשה",
    ],
  },
  {
    version: "1.82.0",
    date: "2026-08-29",
    changes: [
      "אפשרות לשחזר גלריה מלשונית \"פג תוקף\" — חוזרת פעילה עם תוקף לחודש, עם אישור כפול",
      "לכל גלריה יש שחזור חד-פעמי בלבד — בפעם הבאה שהיא פוקעת או נמחקת, יש רק 3 ימים לפני מחיקה סופית ואי אפשר לשחזר שוב",
    ],
  },
  {
    version: "1.81.0",
    date: "2026-08-29",
    changes: [
      "אפשרות חדשה למחיקת גלריה ידנית — בתחתית הגדרות הגלריה, עם אישור כפול",
      "גלריה שנמחקת ידנית נשמרת בארכיון 14 יום (לעומת 7 בפקיעת תוקף טבעית) לפני מחיקה סופית",
      "לשונית חדשה \"פג תוקף\" בעמוד הגלריות — כל הגלריות שנמחקו או פג תוקפן, וממתינות למחיקה סופית",
    ],
  },
  {
    version: "1.80.0",
    date: "2026-08-29",
    changes: [
      "עיצוב הזכוכית עודכן ללוק פרימיום יותר — ריווי צבע מרוסן, מסגרת מדויקת יותר, צל כפול על כרטיסים",
      "צבע הדגש הראשי (כפתורים, קישורים) עודכן לגוון כחול-אינדיגו מעודן יותר",
      "סכומי כסף (הכנסות, יתרה לתשלום) מוצגים עכשיו בצבע ברונזה ייעודי",
      "תוקן באג: בונה הצעות המחיר הציג טקסט לבן על רקע כמעט-לבן במצב כהה",
    ],
  },
  {
    version: "1.79.0",
    date: "2026-08-29",
    changes: [
      "דף הנחיתה: מחירי ההשקה מוצגים עם המחיר הרגיל שיחול בהמשך, מסומן בקו חוצה",
    ],
  },
  {
    version: "1.78.0",
    date: "2026-08-29",
    changes: [
      "יצירת גלריה: משך שמירת התמונות נבחר מתוך רשימה קבועה — שבוע / 14 יום / חודש בפרו, ועד 3 ו-6 חודשים בפרו+",
      "הגדרות > מנוי וצוות: כרטיס חדש מציג את כמות האחסון שנצברה בפועל",
    ],
  },
  {
    version: "1.77.0",
    date: "2026-08-29",
    changes: [
      "שמות המסלולים עודכנו סופית: פרו (הבסיסי) ופרו+ (הפרו)",
      "דף הנחיתה: טבלת השוואה מלאה בין המסלולים — אילו יכולות כלולות בכל אחד",
      "FTP Live זמין רק במסלול פרו+ מעכשיו (חשבון המנהל ממשיך לקבל גישה בכל מסלול)",
    ],
  },
  {
    version: "1.76.0",
    date: "2026-08-29",
    changes: [
      "הגדרות > מנוי וצוות: כפתור \"ביטול מנוי\" ברור ונפרד מהחלפת מסלול, עם מסך אישור סופי לפני הביטול בפועל",
    ],
  },
  {
    version: "1.75.0",
    date: "2026-08-29",
    changes: [
      "המסלולים קיבלו שמות חדשים: המסלול הרגיל הוא עכשיו Flow, ומסלול הפרו הוא Frame+",
      "דף הנחיתה: שני המסלולים מוצגים יחד עם מתג חודשי/שנתי שמעדכן את המחיר החודשי בזמן אמת",
    ],
  },
  {
    version: "1.74.0",
    date: "2026-08-29",
    changes: [
      "FTP Live: מדריך חיבור מותאם אישית לפי דגם המצלמה (Canon/Sony/Nikon/Fujifilm) — עם הכתובת, שם המשתמש והסיסמה שלכם כבר ממולאים בכל שלב",
    ],
  },
  {
    version: "1.73.0",
    date: "2026-08-29",
    changes: [
      "FTP Live — כל גלריה יכולה עכשיו ליצור פרטי חיבור FTP ייעודיים; תמונות שמצולמות ומועלות ישירות מהמצלמה מופיעות בגלריה תוך שניות (דורש את שרת ה-FTP הנפרד, בפריסה)",
    ],
  },
  {
    version: "1.72.0",
    date: "2026-08-28",
    changes: [
      "העלאת סרטוני וידאו לגלריה (MP4/MOV/WebM) — מופיעים ללקוח בראש הגלריה עם נגן וידאו רגיל, כולל דילוג/הרצה קדימה",
    ],
  },
  {
    version: "1.71.0",
    date: "2026-08-28",
    changes: [
      "פורטפוליו ציבורי: אפשר לתייג תמונה בנושא (למשל \"חתונות\", \"בר/בת מצווה\") בזמן ההוספה, ובעמוד הפורטפוליו הציבורי מופיע סינון לפי נושא",
      "אפליקציית הדסקטופ: מסך העלאת תמונות חדש — בחירת גלריה, בחירת תמונות מרובה, והעלאה מהירה עם תור והתאוששות מכשלים",
    ],
  },
  {
    version: "1.70.0",
    date: "2026-08-28",
    changes: [
      "תיקון: עמוד הפורטפוליו הציבורי לא נטען עבור צלמים עם מספר טלפון מוגדר — תוקן",
      "עמוד ההגדרות: לשוניות הבחירה עברו לתפריט נפתח אחד במקום שורת כפתורים עמוסה",
    ],
  },
  {
    version: "1.69.0",
    date: "2026-08-28",
    changes: [
      "פורטפוליו ציבורי חדש — עמוד תיק עבודות משלכם בכתובת myframeflow.com/p/הכתובת-שבחרתם, עם תמונות שאתם בוחרים מתוך הגלריות שלכם וכפתור יצירת קשר בוואטסאפ",
      "בניהול גלריה: אפשר לסמן כל תמונה \"הוספה לפורטפוליו הציבורי\" ישירות מתפריט הפעולות שלה",
    ],
  },
  {
    version: "1.68.0",
    date: "2026-08-28",
    changes: [
      "גלריה נוצרת אוטומטית עם סגירת אירוע חדש — שם ומספר הטלפון של הלקוח ממולאים לבד, בלי צעד נפרד ליצירת גלריה",
      "דף הנחיתה: מחשבון אינטראקטיבי \"כמה שעות אתם מבזבזים על ניהול\", וכרטיסי הפיצ׳רים נהיו לחיצים עם חלון פרטים מורחב לכל אחד",
      "מסכי טעינה (skeleton) בדשבורד ובדפים הראשיים במקום ספינר גנרי",
      "כלי מיון תמונות חדש בכל גלריה — מסך שמירה/פסילה פנימי לצלם לפני שהתמונות נחשפות ללקוח, כולל קיצורי מקלדת",
      "דף הנחיתה עבר לראוט סטטי נפרד — טעינה מהירה משמעותית למבקרים אנונימיים (פרסומות, גוגל, קישורים חיצוניים)",
      "מסלול מנוי חדש \"סטודיו פרו\" (₪99/חודש) — עד 3 חברי צוות במקום 1, ומיתוג מלא: לוגו וצבע מותג אישי על כל הגלריות ללקוחות",
    ],
  },
  {
    version: "1.67.0",
    date: "2026-08-28",
    changes: [
      "שיתוף גלריה — גם בצד הלקוח וגם בצד הצלם: אפשר לבחור עכשיו גם באיזו איכות לשתף (מלאה או מותאמת לרשת), לצד בחירת הלשוניות, ופאנל השיתוף עבר לתחתית המסך כמו מסך ההורדה",
      "קישור גלריה שנשלח באיכות מותאמת לרשת נשאר מוגבל לאיכות הזו גם בהורדה וגם בשיתוף חוזר מצד הלקוח",
      "לשונית חדשה בהגדרות — \"הודעות ללקוח/ה\": עריכה חופשית של נוסח ההודעות שנשלחות דרך כפתור \"שליחת עדכון ללקוח\" בכל שלב באירוע, כולל הוספת קישור אוטומטי לפורטל האישי של הלקוח",
    ],
  },
  {
    version: "1.66.0",
    date: "2026-08-26",
    changes: [
      "בגלריית הלקוח: שיתוף תמונות מסומנות (לחיצה כפולה) עכשיו פותח את אותו פאנל שיתוף עשיר (וואטסאפ/אינסטגרם/טיקטוק/QR) של כפתור השיתוף הראשי, אבל מוגבל בקישור רק לתמונות שנבחרו",
      "כפתור השיתוף הראשי בגלריית הלקוח: אם יש בגלריה לשוניות (תיקיות), אפשר לבחור אילו מהן לשתף — קישור לכל הגלריה או רק ללשוניות הנבחרות",
      "תיקון: שדה המייל בטופס הצעת מחיר בהגדרות כבר לא חורג מגבולות המסך",
    ],
  },
  {
    version: "1.65.0",
    date: "2026-08-25",
    changes: [
      "לשונית \"תמחור\" בהגדרות: בניית הצעות מחיר עצמאיות ללקוחות, עם טבלת פריטים, חישוב אוטומטי של מע\"מ, תצוגה מקדימה, ושליחה כקובץ PDF במייל או בוואטסאפ",
      "אפשר להעלות לוגו עסקי שמופיע בפינת כל הצעת מחיר",
    ],
  },
  {
    version: "1.64.0",
    date: "2026-08-21",
    changes: [
      "אחרי פרסום גלריה, כפתור \"פרסום הגלריה ללקוח\" הופך לכפתור \"העתקת קישור\" באותו מקום — גם בעמוד הגלריה עצמה וגם ברשימת הגלריות הראשית",
    ],
  },
  {
    version: "1.63.0",
    date: "2026-08-21",
    changes: [
      "פאנל התמונות המועדפות בכלי עיצוב האלבום גדול יותר, ומעבר עכבר מעל תמונה בפאנל מציג תצוגה מוגדלת שלה — עם מתג לכיבוי/הפעלה של התצוגה הזו",
      "בגרסת הטלפון: כפתורי הפעולות בעמוד הגלריה עברו לרשת אחידה ומרווחת, ושורת הלשוניות כבר לא נדחסת יחד עם כפתור העלאת התמונות",
      "מדריך מפורט חדש לכלי עיצוב האלבום — נגיש בלחיצה על סימן השאלה ליד \"עיצוב אלבום\" וליד \"עיצוב חופשי\", עובר על כל הכפתורים והפעולות של הכלי",
    ],
  },
  {
    version: "1.62.0",
    date: "2026-08-21",
    changes: [
      "כלי עיצוב האלבום נטען הרבה יותר מהר: התמונות בקנבס, בפאנל הגרירה ובחלוני הבחירה נטענות כעת בגרסת תצוגה קלה במקום בקובץ המקורי הכבד — הגודל המלא נשמר רק בייצוא הסופי",
      "תיקון: כשחלון (עיצוב אלבום, הגדרות, בחירת תבנית וכו׳) פתוח, גלילת העכבר כבר לא מזיזה את הרקע המטושטש מאחוריו",
      "בתצוגת התמונה המוגדלת בגלריה אפשר כעת לדפדף בין תמונות עם מקשי החצים במקלדת",
    ],
  },
  {
    version: "1.61.0",
    date: "2026-08-20",
    changes: [
      "העלאת תמונות עמידה יותר: קובץ בודד שנכשל בגלל תקלת רשת רגעית מנסה שוב באופן אוטומטי לפני שהוא נחשב לכישלון, וההודעה בסיום מציגה את כל הקבצים שנכשלו (לא רק את האחרון)",
      "תיקון: חלון התקדמות ההעלאה/ייצוא הציג טקסט לבן על רקע בהיר ולא קריא במצב כהה",
      "סמל הפח למחיקת לשונית עודכן לעיצוב אחיד עם שאר הסמלים במערכת",
    ],
  },
  {
    version: "1.60.0",
    date: "2026-08-20",
    changes: [
      "אפשר עכשיו למחוק לשוניות (תיקיות) מהגלריה — לחיצה כפולה על הלשונית ואז על סמל הפח, עם מסך אישור במרכז המסך לפני המחיקה. התמונות שבתוך הלשונית לא נמחקות, הן פשוט עוברות ל\"הכל\"",
    ],
  },
  {
    version: "1.59.0",
    date: "2026-08-20",
    changes: [
      "תמונות התצוגה בגלריות עוברות דרך רשת הפצה (CDN) ייעודית — טעינה מהירה ויציבה יותר, במיוחד בכניסות חוזרות לאותה גלריה",
    ],
  },
  {
    version: "1.58.0",
    date: "2026-08-20",
    changes: [
      "תמונות התצוגה בגלריות עוברות עכשיו לפורמט קליל יותר (WebP) — קובץ קטן יותר באותה איכות, טעינה מהירה יותר",
    ],
  },
  {
    version: "1.57.0",
    date: "2026-08-20",
    changes: [
      "בזמן שהתמונות בגלריה נטענות מוצגת עכשיו גרסה מטושטשת קלה של כל תמונה במקומה המדויק במקום שטח ריק — ואז כל התמונות מתחדדות ביחד באותו רגע",
    ],
  },
  {
    version: "1.56.0",
    date: "2026-08-20",
    changes: [
      "בזמן טעינת התמונות בגלריה מוצג עכשיו סימן טעינה במקום שהתמונות אמורות להופיע (ולא על כל המסך), ואז כולן מופיעות ביחד",
      "פתיחת תמונה בגדול בגלריה מפעילה ברקע טעינה מוקדמת של כל שאר התמונות, כדי שהמעבר בין תמונות בתצוגה המוגדלת יהיה מהיר",
    ],
  },
  {
    version: "1.55.0",
    date: "2026-08-20",
    changes: [
      "תחושת הלחיצה ה\"שוקעת\" נוספה גם לשורת שם הגלריה (ברשימת הגלריות) ולשורת שם האירוע (ברשימת האירועים) בכניסה אליהן",
    ],
  },
  {
    version: "1.54.0",
    date: "2026-08-20",
    changes: [
      "בגלריה שרואה הלקוח/ה, התמונות עכשיו גם נטענות מהגרסה הקלה ומופיעות ביחד ברגע אחד — לא רק בגלריית הצלם/ת",
      "תחושת לחיצה ברורה יותר על כל כפתור באפליקציה: הכפתור \"שוקע\" פנימה בבירור בזמן הלחיצה, כדי שיהיה ברור שהלחיצה נקלטה",
    ],
  },
  {
    version: "1.53.0",
    date: "2026-08-20",
    changes: [
      "כשנכנסים לגלריה, כל תמונות התצוגה נטענות ברקע ומופיעות ביחד ברגע אחד, במקום להופיע אחת אחרי השנייה",
      "תמונות התצוגה בגלריית הצלם/ת עכשיו טוענות מהגרסה הקלה (כשקיימת) — טעינה מהירה יותר",
    ],
  },
  {
    version: "1.52.0",
    date: "2026-08-20",
    changes: [
      "אפשר עכשיו לשנות שם של לשונית/תיקייה בגלריה — לחיצה כפולה על שם הלשונית",
      "נוסף כפתור \"תצוגה מקדימה\" שמראה איך הגלריה תיראה ללקוח/ה לפני הפרסום, בדיוק כמו אחרי",
      "בגלריית הלקוח: נוסף כפתור שיתוף (וואטסאפ, אינסטגרם, טיקטוק, קוד QR, אחר) וכפתור חזרה לראש העמוד",
      "בהעלאה/ייצוא קבצים: אפשר עכשיו לבטל את הפעולה תוך כדי (כפתור X אדום), עם בקשת אישור לפני הביטול בפועל",
      "אפשר לקבוע תמונה כשער הגלריה גם מתוך התצוגה המוגדלת (לא רק מהתפריט של לחיצה ארוכה)",
    ],
  },
  {
    version: "1.51.0",
    date: "2026-08-20",
    changes: [
      "התמונה הקלה שמוצגת בצפייה מוגדלת קטנה משמעותית ברזולוציה (עד 1200px) ונוצרת בפעימה אחת ומהירה במקום כמה ניסיונות דחיסה — פותר טעינה איטית ותקיעות בטלפון, בלי לפגוע בהורדות באיכות מקורית",
    ],
  },
  {
    version: "1.50.0",
    date: "2026-08-20",
    changes: [
      "התמונה הקלה שמוצגת ללקוח בגלריה מכוונת עכשיו ליעד תובעני יותר (~20% ממשקל הקובץ המקורי) לטעינה מהירה יותר; ההורדה נשארת תמיד באיכות המקורית המלאה",
      "צפייה בתמונה מוגדלת (בעורך הגלריה ובגלריה הציבורית) נטענת עכשיו ישירות בלי שלב ביניים בשרת — מהירה משמעותית",
      "תוקן באג שגרם לתמונות ברשת (בפריסת \"רשת\") להיראות כאילו הן נטענות מחדש בכל מעבר בין תיקיות/לשוניות",
    ],
  },
  {
    version: "1.49.0",
    date: "2026-08-20",
    changes: [
      "כל תמונה שעולה לגלריה מקבלת עכשיו אוטומטית, ברקע, גרסה קלה (יעד ~40% ממשקל הקובץ המקורי) — כך שכשלוחצים על תמונה כדי להגדיל אותה היא כבר מוכנה ומופיעה כמעט מיידית",
    ],
  },
  {
    version: "1.48.0",
    date: "2026-08-20",
    changes: [
      "צפייה בתמונת גלריה מוגדלת (אחרי לחיצה) נטענת עכשיו הרבה יותר מהר — התצוגה משתמשת בגרסה קלה יותר של התמונה, וההורדה ממשיכה להיות באיכות המקורית המלאה",
      "כפתור \"פרסום הגלריה ללקוח\" נוסף גם לחלק העליון של המסך, ליד כפתור הגדרות הגלריה",
    ],
  },
  {
    version: "1.47.0",
    date: "2026-08-20",
    changes: [
      "העלאת תמונות, זיהוי פרצופים וייצוא אלבום (PDF/JPG/PSD) מציגים עכשיו חלון התקדמות מרכזי אחד — עיגול עם אחוזים במרכז ורקע שמתמלא בירוק בקבוק מלמטה למעלה — שנסגר אוטומטית בסיום הפעולה ומונע התחלת פעולה כבדה נוספת במקביל",
    ],
  },
  {
    version: "1.46.0",
    date: "2026-08-20",
    changes: [
      "בתצוגת ניהול הגלריה: סליידר גודל התמונות מתחיל בגודל המקסימלי במסך רחב (דסקטופ); בטלפון נשאר כמו שהיה",
      "נוסף כפתור עגול לחזרה לראש העמוד, מופיע בפינה השמאלית התחתונה לאחר גלילה של כ-15%",
    ],
  },
  {
    version: "1.45.0",
    date: "2026-08-20",
    changes: [
      "חדש ביצירת/עריכת גלריה: טלפון הלקוח/ה (לא חובה) — תזכורת שבוע לפני שהגלריה נמחקת נשלחת עכשיו גם בוואטסאפ, בנוסף לתזכורת המייל הקיימת",
    ],
  },
  {
    version: "1.44.0",
    date: "2026-08-20",
    changes: ["סליידר הסיבוב של תמונות, עיטורים וצורות בעורך האלבום עובד עכשיו במעלות (0–360°) במקום באחוזים"],
  },
  {
    version: "1.43.0",
    date: "2026-08-20",
    changes: [
      "תוקן: שינוי בסליידרים של עריכת תמונה היה מתעדכן על התמונה רק כשמורידים את הסימון ממנה — עכשיו מתעדכן מיידית תוך כדי גרירה",
      "חלוני מסכות/עיטורים/צורות כבר לא נחתכים בתחתית המסך — הפריטים האחרונים תמיד נגישים",
      "צורות בקו מתאר בלבד (ריבוע/מלבן/עיגול/קו) אפשר עכשיו למתוח גם מעבר לגבולות העמוד",
      "לצורת קו נוסף סליידר עובי ייעודי (1-100 פיקסלים)",
    ],
  },
  {
    version: "1.42.0",
    date: "2026-08-19",
    changes: [
      "חדש בעורך האלבום החופשי: תפריט עריכת תמונה — חשיפה, ניגודיות, אורות/צללים, לבנים/שחורים, איזון לבן (חום/גוון), עוצמת צבע ורוויה, נפתח בבחירת תמונה ומוחל גם בייצוא PDF/JPG/PSD",
      "חדש בצורות: ריבוע, מלבן ועיגול בקו מתאר בלבד (ללא רקע), וגם צורת קו",
      "בהוספת תמונה אפשר עכשיו לבחור גודל קבוע מרשימה — מלבן 10x7.5 ס״מ, עיגול Ø5 ס״מ או ריבוע 5x5 ס״מ — במקום גודל אוטומטי בלבד",
      "הוסר כפתור \"שינוי מסכה\" הכפול מתפריט הצורות — בחירת מסכה תמיד דרך כפתור \"מסכות\" הראשי",
    ],
  },
  {
    version: "1.41.0",
    date: "2026-08-19",
    changes: [
      "חלוני מסכות/עיטורים/צורות בעורך האלבום נפתחים עכשיו ממש מתחת לכפתור המתאים, ברוחב שלו",
      "הוסר כפתור ייצוא הבטא לסקריפט Photoshop (.jsx)",
      "תוקנו מידות אלבום שהיו רשומות הפוך באשף יצירת אלבום חדש (60×30, 80×30, 54×20)",
      "נוסף כפתור \"חזרה\" באשף יצירת אלבום חדש",
    ],
  },
  {
    version: "1.40.0",
    date: "2026-08-19",
    changes: [
      "חדש בעורך האלבום: עיטורים — כ-70 עיטורי קישוט מוכנים (פרחוני/גיאומטרי/וינטג'), עם צבע/שקיפות/סיבוב משלהם, וגם אפשרות ליצור לשוניות עיטורים אישיות ולהעלות עיטורים מהמחשב שלכם",
      "חדש: צורות גיאומטריות — מלבן או כל אחת מ-19 צורות מוכנות (עיגול, כוכב, לב ועוד), עם צבע/שקיפות/סיבוב משלהן, ואפשר להחיל עליהן כל אחת מ-50 המסכות הקיימות",
      "חדש: כפתורי \"קדימה\"/\"אחורה\" לשינוי סדר השכבות של כל אלמנט בעורך",
      "חדש: מחיקת אלמנט מסומן במקש Delete/Backspace, וקליק ימני עליו פותח ישירות את תפריט העיצוב שלו",
      "עיטורים וצורות נכללים עכשיו גם בייצוא PDF/JPG/PSD, ובתצוגת האישור ללקוח",
    ],
  },
  {
    version: "1.39.0",
    date: "2026-08-18",
    changes: [
      "רשימת החבילות בטופס \"ליד חדש\" מסונכרנת עכשיו עם רשימת החבילות ביצירת אירוע — כולל חבילות מותאמות אישית שהוגדרו בעבר, ואפשרות ליצור חבילה מותאמת אישית חדשה ישירות מטופס הליד",
    ],
  },
  {
    version: "1.38.0",
    date: "2026-08-18",
    changes: [
      "יצירת אלבום חדש מתחילה עכשיו מעמוד ריק אחד (במקום 20 עמודים עם תבניות) — בוחרים תבנית מוכנה או מעצבים בעצמכם, ומוסיפים עוד עמודים בהמשך",
      "תצוגת העמודים באלבום הצטמצמה לרשת קומפקטית (4 בשורה) — לחיצה על עמוד פותחת אותו במסך מלא לעריכה",
      "תוקן (בטא, סקריפט Photoshop): הקובץ שיורד כולל עכשיו גם את התמונות עצמן (בתיקיית \"photos\" ליד הסקריפט) — אין יותר בחירת תיקיות ידנית, והסקריפט תמיד יודע בדיוק איפה התמונות שלו",
    ],
  },
  {
    version: "1.37.2",
    date: "2026-08-18",
    changes: [
      "תוקן (בטא, סקריפט Photoshop): מידות העמוד שנוצר יכלו לצאת הפוכות (רוחב/גובה מוחלפים) — הסקריפט עכשיו קובע את המידות באופן מפורש וגם בודק ומתקן את עצמו אם המסמך יצא בגודל לא נכון",
      "תוקן (בטא, סקריפט Photoshop): חיפוש התמונות בתיקייה שנבחרת הוא עכשיו רקורסיבי (כולל תת-תיקיות) ולא רגיש לרישיות, כדי למצוא תמונות גם כשהן מסודרות בתתי-תיקיות",
      "הובהר (בטא, סקריפט Photoshop): כדי להריץ את הקובץ יש להשתמש ב-File > Scripts > Browse בתוך Photoshop — לחיצה כפולה על הקובץ עלולה לפתוח תוכנה אחרת (כמו After Effects) שגם משתמשת בסיומת .jsx",
    ],
  },
  {
    version: "1.37.1",
    date: "2026-08-18",
    changes: [
      "תוקן: הורדת קבצי ייצוא אלבום (PDF/JPG/PSD/סקריפט Photoshop) ב-Safari/Firefox במחשב ירדה עכשיו ישירות לתיקיית ההורדות, במקום לפתוח את תפריט השיתוף של המערכת",
    ],
  },
  {
    version: "1.37.0",
    date: "2026-08-17",
    changes: [
      "חדש (בטא): כפתור \"ייצוא סקריפט ל-Photoshop\" בעורך האלבום — מוריד קובץ .jsx לכל עמוד, ובהרצה שלו ב-Photoshop (File > Scripts > Browse) הוא בונה בעצמו מסמך PSD אמיתי וניתן לעריכה, עם התמונות ממוקמות וחתוכות בדיוק כמו בעורך",
      "התאמת התמונות נעשית לפי שם הקובץ המקורי שלהן בתיקייה שבוחרים על המחשב — לא נדרשת העלאה מחדש",
      "שלב ראשון בלבד: מסכות, מסגרות, צללים, סיבוב וטקסט עדיין לא כלולים בסקריפט ויתווספו בהמשך",
    ],
  },
  {
    version: "1.36.0",
    date: "2026-08-17",
    changes: [
      "מידות האלבום ביצירת אלבום חדש עברו לתפריט נפתח קומפקטי; חלון \"אלבום חדש\" נפתח ממורכז עם טשטוש רקע במקום כפתחון תחתון",
      "השדות \"מספר עמודים רצוי\" ו\"כמות תמונות רצויה\" הוסתרו מאשף יצירת האלבום",
      "חלון בחירת המסכות נפתח בסלייד מלמעלה ונסגר בסלייד למעלה, בלי רקע כהה שמכסה את שאר המסך",
      "אפשר להזיז תמונה או תמונות מסומנות בעורך האלבום עם מקשי החיצים במקלדת",
      "לחיצה ימנית (וגם shift+לחיצה ימנית) בעורך האלבום כבר לא פותחת את תפריט הדפדפן",
      "כפתור \"+תמונה\" מוסיף כעת את התמונה/ות החדשות בגודל בינוני לצד התמונות הקיימות בעמוד, במקום להחליף את כל העמוד",
    ],
  },
  {
    version: "1.35.0",
    date: "2026-08-17",
    changes: [
      "כפתור \"מסכות\" חדש בעורך האלבום: 50 מסכות (דהיות כיווניות, צורות כמו כוכב/לב/משושה/ענן, דוגמאות פסים ונקודות, ועוד) — גוררים מסכה אל תמונה בעמוד כדי להחיל אותה, בדיוק כמו גרירת תמונה אל מסגרת",
      "המסכה נשמרת ומופיעה זהה בכל מקום: עורך העיצוב, מסך האישור של הלקוח/ה, וגם בייצוא PDF / JPG / PSD",
      "סגנונות העיצוב באשף בניית האלבום (מגזין/קלאסי/מקושקש/אורבני/קו נקי) הוסתרו זמנית — האלבום עדיין נבנה אוטומטית בסגנון קבוע",
    ],
  },
  {
    version: "1.34.1",
    date: "2026-08-17",
    changes: ["מידות אלבום נוספות בבחירה המהירה ביצירת אלבום חדש: 20×54, 30×60, 30×80"],
  },
  {
    version: "1.34.0",
    date: "2026-08-17",
    changes: [
      "שינוי גודל תמונה בעורך האלבום מציג עכשיו קו הנחיה כשמגיעים לגבול של תמונה אחרת באותה שורה/טור — גם באורך וגם ברוחב",
      "קווי הנחיה (יישור ומרחק שווה) פועלים עכשיו גם כשמזיזים כמה תמונות נבחרות יחד, לא רק תמונה בודדת",
      "קו מרכז קבוע (אופקי ואנכי) בעמוד האלבום, בצבע כמו מסגרת השוליים הירוקה",
      "תוקנו התבניות המובנות: תבניות עם הרבה תמונות (כמו 7-10) כבר לא מצטופפות בטור צר באמצע הדף — התמונות מתפרסות עכשיו על רוב רוחב הדף",
      "אפשר לקבוע את מרחק המסגרת הירוקה מקצוות הדף (בס״מ) בעת יצירת אלבום חדש, וגם לערוך אותו אחר כך",
      "מסך יצירת אלבום חדש כולל עכשיו מידות אלבום נפוצות לבחירה מהירה (עם ערך שוליים מומלץ לכל מידה) — עדיין אפשר להזין מידות ידנית",
    ],
  },
  {
    version: "1.33.0",
    date: "2026-08-17",
    changes: [
      "אפשר לבחור כמה תמונות בעורך האלבום בבת אחת — Shift+לחיצה על כל תמונה, או גרירת מלבן בחירה עם העכבר על שטח ריק — וכל פעולה (הזזה, שינוי גודל, סינון, שקיפות, טשטוש, סיבוב, צל, מחיקה) חלה על כל התמונות שנבחרו יחד",
      "כפתור מחיקה חדש בתפריט העיגולים, מוחק את כל התמונות שנבחרו",
      "כפתור \"+ מסגרת\" חדש בעורך האלבום — מוסיף מסגרת ריקה שאפשר להזיז ולשנות גודל לפני שממלאים אותה בתמונה, בלי לגעת בשאר העמוד",
      "קווי עזר חדשים לריווח שווה — כשגוררים תמונה בין שתי שכנות, המערכת מזהה מרווחים כמעט שווים ומיישרת אותם בדיוק",
      "תבניות מובנות בעורך האלבום כבר לא כוללות פריסה של טור אנכי אחד עם כל התמונות זו מתחת לזו",
      "תוקן: אייקוני תפריט העיגולים היו כמעט בלתי-נראים במצב כהה",
    ],
  },
  {
    version: "1.32.0",
    date: "2026-08-17",
    changes: [
      "תמונה שכבר שובצה בעמוד אחד באלבום כבר לא מוצגת כאפשרות בעמודים הבאים — גם בחלון בחירת התמונות וגם בפאנל הגרירה",
      "שינוי גודל תמונה בעורך האלבום: מסגרות עם ידיות בכל 8 הצדדים והפינות (לא רק פינה אחת), עם סמן עכבר שמשתנה בהתאם; כפתור חדש בתפריט העיגולים לנעילת יחס גובה-רוחב בשינוי גודל מהפינות",
      "תבניות מובנות בעורך האלבום מאורגנות עכשיו בלשוניות לפי כמות תמונות (2 עד 10+), עם 50 תבניות שונות בכל לשונית — כל התבניות שומרות על יחסי תמונה סטנדרטיים להדפסה (10×15, 10×7.5, 13×18)",
      "בהוספת טקסט לעמוד אלבום אפשר עכשיו לבחור מתוך מפת צבעים (לא רק שחור/לבן)",
      "אייקונים חדשים תואמי-עיצוב בעורך האלבום במקום אימוג'ים",
      "תוקן: סימן ה-\"+\" במסגרת ריקה היה כמעט בלתי-נראה במצב בהיר",
    ],
  },
  {
    version: "1.31.0",
    date: "2026-08-17",
    changes: [
      "5 סגנונות באשף בניית האלבום (נוסף \"מקושקש\") — כל סגנון עודכן לפי אלבומי הדפסה אמיתיים: מגזין (תמונה מרכזית מול רשת דחוסה), קלאסי (מסגרת לבנה וצל רך), מקושקש (תמונות מפוזרות ומוטות עם מסגרת פולארויד), אורבני (רשתות נקיות ואחידות), קו נקי (ללא שינוי)",
    ],
  },
  {
    version: "1.30.1",
    date: "2026-08-17",
    changes: [
      "כפתור \"+ אלבום חדש\" בעורך עיצוב האלבום (ליד כפתור הסגירה) — פותח מחדש את האשף המלא כדי לבנות אלבום מאפס, עם אישור לפני מחיקת האלבום הקיים",
    ],
  },
  {
    version: "1.30.0",
    date: "2026-08-17",
    changes: [
      "אשף בניית אלבום חדש: בוחרים מידות, מספר עמודים, כמות תמונות וסגנון (מגזין / קלאסי / קו נקי / אורבני) — והמערכת בונה אוטומטית שבלונה מלאה לכל האלבום, כולל כל התאים הריקים, שנשאר רק לגרור לתוכם תמונות",
      "כל בנייה יוצרת מבנה שונה, גם עם אותם פרמטרים בדיוק — ואפשר לשמור מבנה שיצא מוצלח כתבנית אלבום שלמה לשימוש חוזר, עם שם חופשי",
    ],
  },
  {
    version: "1.29.0",
    date: "2026-08-16",
    changes: [
      "כפתור \"זיהוי פרצופים\" חדש בניהול הגלריה: מזהה את כל הפרצופים השונים בתמונות (ריצה מלאה בדפדפן — אף תמונה לא נשלחת לשרת חיצוני), ומציג עיגול לכל אדם מתחת לשם הגלריה; לחיצה על עיגול מסננת לתמונות שלו בלבד",
      "עורך עיצוב האלבום מוסתר עכשיו בגרסת הסלולר ומופיע רק בדסקטופ",
    ],
  },
  {
    version: "1.28.0",
    date: "2026-08-16",
    changes: [
      "חוזים דיגיטליים: נוסף שדה חתימה ידנית — הלקוח/ה חותמים עם האצבע או העכבר, והחתימה נשמרת ומוצגת גם בצד הצלם/ת",
    ],
  },
  {
    version: "1.27.2",
    date: "2026-08-16",
    changes: [
      "ייצוא PDF/JPG/PSD בטלפון: אחרי בחירת טווח העמודים נפתח כעת תפריט השיתוף הרגיל של המכשיר (כמו AirDrop / שמירה לקבצים) במקום הורדה שקטה לתיקיית ההורדות",
    ],
  },
  {
    version: "1.27.1",
    date: "2026-08-16",
    changes: [
      "תוקן: חלון בחירת טווח העמודים לייצוא הופיע מאחורי חלון עיצוב האלבום במקום לפניו",
    ],
  },
  {
    version: "1.27.0",
    date: "2026-08-16",
    changes: [
      "ייצוא PSD: אפקט הצל חוזר גם הוא להיות מוטבע בתוך התמונה (בדיוק כמו קו המתאר מגרסה 1.26.2), אחרי שהתברר שגם הוא גרם לשגיאת פתיחה ולעמודים ריקים בפוטושופ — כעת קובץ ה-PSD הוא שכבות רגילות בלבד, בלי אפקטי Layer Style חיים, ותואם לכל גרסאות פוטושופ הנפוצות ללא צורך בבחירת גרסה",
      "אומת ותוקן: טשטוש רקע עמוד בייצוא PSD",
      "ייצוא PDF/JPG/PSD: לפני הייצוא נפתח כעת חלון לבחירת טווח עמודים (מאיזה עמוד עד איזה עמוד), ורק אחרי האישור נפתח חלון בחירת מיקום השמירה במכשיר",
      "חלון בחירת מיקום השמירה נוסף גם לייצוא PDF (עד כה היה קיים רק ב-JPG ו-PSD)",
    ],
  },
  {
    version: "1.26.2",
    date: "2026-08-16",
    changes: [
      "ייצוא PSD: קו המתאר חוזר להיות מוטבע בתוך התמונה עצמה (במקום אפקט חי) אחרי שהתברר שפוטושופ מסרב לפתוח קבצים עם קו מתאר כאפקט — הצל נשאר אפקט Layer Style חי וניתן לעריכה כרגיל",
    ],
  },
  {
    version: "1.26.1",
    date: "2026-08-16",
    changes: [
      "תוקן באג בייצוא PSD שגרם לשקיפות אפקט הצל להישמר בסולם הלא נכון",
      "תוקן באג שגרם לכך שקו מתאר, סיבוב וטשטוש שהוגדרו לתמונה בעמוד לא הופיעו בתצוגה המקדימה של העמוד ברשימת עמודי האלבום אחרי השמירה (הם כן נשמרו בפועל — רק לא הוצגו)",
      "תוקן באג שגרם לכך שחלון בחירת מיקום השמירה בייצוא JPG/PSD לא נפתח בפועל בדפדפנים שכן תומכים בו",
    ],
  },
  {
    version: "1.26.0",
    date: "2026-08-16",
    changes: [
      "תפריט העיגולים, הגדרות צל וקו מתאר: כפתור \"החל על כל התמונות בדף\" שמעתיק את הערכים לכל התמונות בעמוד בבת אחת",
      "ייצוא JPG ו-PSD: בדפדפנים שתומכים בכך (Chrome/Edge בדסקטופ) נפתח חלון בחירת מיקום שמירה אמיתי במקום שמירה אוטומטית לתיקיית ההורדות",
      "ייצוא PSD: קו מתאר וצל הופכים לאפקטי Layer Style אמיתיים וניתנים לעריכה בפוטושופ (Stroke ו-Drop Shadow חיים על שכבת התמונה) במקום שכבות פיקסלים קפואות — כולל תמונות מסובבות, שקודם לא קיבלו את זה בכלל",
    ],
  },
  {
    version: "1.25.0",
    date: "2026-08-16",
    changes: [
      "לחיצה כפולה על תמונה בעמוד נכנסת ישירות למצב מיקום תמונה — גרירה מזיזה את התמונה בתוך המסגרת הקבועה שלה, לא את המסגרת עצמה",
      "Alt/Cmd + לחיצה על תמונה ממרכזת אותה בתוך המסגרת שלה (ולא למרכז העמוד)",
      "תפריט העיגולים: כפתור חדש \"הצגה בגודל נכון\" שמתאים את המסגרת ליחס הרוחב/גובה האמיתי של התמונה, גם אם זה חורג מעבר לתמונה סמוכה",
      "עיצוב אלבום בדסקטופ נפתח כעת על פני כל המסך, לא רק עורך העמוד",
      "מסגרת ההדפסה הירוקה: תבניות ופריסות אוטומטיות (מובנות ושמורות) לא יחרגו ממנה יותר — רק הזזה ידנית של תמונה יכולה לחרוג",
      "תוקן באג שגרם לכך שבחירת פונט לשכבת טקסט לא באמת שינתה את הפונט המוצג; גודל הטקסט המקסימלי הוגדל ל-250pt",
      "כל חלונות עיצוב האלבום (בחירת תמונה, תבניות, שמירת תבנית, הוספת טקסט) קיבלו כפתור סגירה ✕ ברור",
    ],
  },
  {
    version: "1.24.0",
    date: "2026-08-16",
    changes: [
      "עורך עיצוב חופשי: פאנל תמונות מועדפות לגרירה מתחת לכפתור השמירה, מקובץ לפי לשוניות הגלריה (או אזור אחד אם אין לשוניות)",
      "גרירת תמונה מהפאנל ישירות למסגרת הרצויה בעמוד — המערכת ממרכזת אותה בצורה מיטבית בתוך המסגרת",
      "תמונה שנגררה למסגרת מסומנת ✅ ונעלמת מהפאנל כדי שלא תיבחר שוב בטעות, עם כפתור \"הצג הכל\" שמראה גם את התמונות שכבר שובצו",
    ],
  },
  {
    version: "1.23.0",
    date: "2026-08-16",
    changes: [
      "מיקום תמונה בתוך המסגרת: כפתור חדש בתפריט הצף פותח מצב \"גרירה\" שמזיז את התמונה בתוך המסגרת הקבועה שלה, עם כפתור מרכוז מהיר",
      "זום לתמונה: Ctrl וגרירה אופקית של העכבר (שמאלה = זום אין, ימינה = זום אאוט) — עד 400%",
      "מסגרת ירוקה דקה שמסמנת את שטח ההדפסה הבטוח (0.5 ס\"מ מכל קצה) בכל עמוד, לפי מידות האלבום שנקבעו",
      "קווי יישור חכמים בזמן גרירה: קו שמראה שהתמונה הגיעה למרכז העמוד, וקווים שמראים יישור עם תמונות אחרות בעמוד — עם הצמדה קלה",
      "תפריט העיגולים לעריכת תמונה קטן יותר עם אייקונים בסגנון המערכת במקום אמוג'י",
      "לחיצה על \"+ תמונה\" מאפשרת לבחור כמה תמונות בבת אחת — המערכת מסדרת אותן אוטומטית בפריסה שמכבדת את הכיוון של כל תמונה (תמונות לאורך במסגרת לאורך, לרוחב במסגרת לרוחב)",
      "סיבוב תמונה: קו המתאר והצל מסתובבים יחד עם התמונה כיחידה אחת (במקום שרק התמונה תסתובב בתוך מסגרת קבועה) — בעורך, אצל הלקוח/ה, ובייצוא PDF/JPG/PSD",
      "Alt/Cmd + לחיצה על תמונה ממרכזת אותה אוטומטית בעמוד",
    ],
  },
  {
    version: "1.22.0",
    date: "2026-08-16",
    changes: [
      "תהליך יצירת אלבום חדש: קודם קובעים את מידות האלבום להדפסה, ואז מוסיפים עמודים אחד-אחד — מתבנית שמורה או עיצוב אישי לפי מספר תמונות, כשהמערכת מסדרת ומשבצת תמונות מועדפות באופן אוטומטי",
      "תמונות שכבר שובצו במקום אחר באלבום מסומנות ב-✅ בכל בורר תמונות, כדי שלא תיבחר אותה תמונה פעמיים בטעות",
      "לחיצה על תמונה בעיצוב חופשי פותחת תפריט עגול צף לצד התמונה: שחור-לבן, ספיה, שקיפות, טשטוש, סיבוב וצל+קו מתאר — כל אחד עם סליידר משלו",
      "אפקט צל חדש לתמונות בעיצוב חופשי — מוצג גם בתצוגת הלקוח וגם בייצוא PDF/JPG/PSD",
      "תוקן באג בייצוא PDF: תמונות עם סיבוב אוטומטי מהמצלמה (EXIF) הוצגו לפעמים בכיוון/חיתוך שגוי בקובץ ה-PDF בלבד, למרות שהוצגו נכון בעורך ובייצוא JPG/PSD",
    ],
  },
  {
    version: "1.21.0",
    date: "2026-08-16",
    changes: [
      "עובי מסגרת לתמונה באלבום: כפתור שפותח בורר עם טווח מלא של 2px עד 50px",
      "שליטה מלאה בתמונה בעיצוב חופשי: סיבוב, שקיפות (0%-100%) וטשטוש (0%-100%) — משתקף גם בתצוגת הלקוח וגם בייצוא PDF/JPG/PSD",
      "תמונת רקע לעמוד שלם: בוחרים תמונה שתשמש רקע לכל העמוד, עם שליטה נפרדת בשקיפות ובטשטוש שלה",
      "בחירת פונט לטקסט מתוך 20 פונטים (10 בעברית, 10 באנגלית כולל כתבי יד) מתפריט נפתח, וגודל טקסט מ-2pt עד 96pt מתפריט נפתח",
      "לטקסט בעיצוב חופשי: הזזה חופשית בכל חלקי העמוד והגדלה/הקטנה עם ריבוע גרירה בפינת המסגרת, בדיוק כמו לתמונות",
    ],
  },
  {
    version: "1.20.0",
    date: "2026-08-15",
    changes: [
      "50 תבניות פריסה חדשות בספריית התבניות המובנות של עיצוב האלבום — 10 עם 5 תמונות, 10 עם 8 תמונות, 10 עם 10 תמונות, ועוד 20 תבניות יצירתיות (בין 2 ל-20 תמונות בעמוד)",
    ],
  },
  {
    version: "1.19.0",
    date: "2026-08-15",
    changes: [
      "ייצוא עמודי אלבום ל-JPG: כפתור חדש בכלי עיצוב האלבום שמייצא את כל העמודים כתמונות באיכות הדפסה, ארוזות בקובץ ZIP",
      "ייצוא ל-PSD (פוטושופ): כל עמוד נוצר כקובץ פוטושופ אמיתי עם שכבות נפרדות לכל תמונה — כולל שכבת אפקט שחור-לבן חיה שאפשר לערוך או להסיר בתוך פוטושופ",
      "קביעת גודל האלבום להדפסה בס״מ (רוחב וגובה) — לפי הגודל שתזינו המערכת מחשבת את רזולוציית ההדפסה הנכונה לייצוא JPG ו-PSD (ייצוא ה-PDF להדפסה נשאר בגודל התצוגה הקבוע כמו קודם)",
    ],
  },
  {
    version: "1.18.0",
    date: "2026-08-15",
    changes: [
      "בעיצוב חופשי של עמוד: אפשר להוסיף כמה תמונות שרוצים ולא רק שתיים, וגם להפוך עמוד קיים לעיצוב חופשי בלי לאבד את התמונות שכבר נבחרו לו",
      "ספריית תבניות פריסה: שומרים עיצוב שבניתם כתבנית לשימוש חוזר, בוחרים מתוך תבניות מובנות או מהתבניות ששמרתם — המערכת פורשת מסגרות ריקות וממלאת אותן אוטומטית מהתמונות המועדפות",
      "לחיצה על מסגרת ריקה פותחת את התמונות המועדפות של הלקוח/ה לבחירה — ואפשר גם לראות את כל תמונות הגלריה",
      "לכל תמונה בעיצוב חופשי: קביעת שחור-לבן/גווני סאפיה, עובי וצבע למסגרת התמונה — משתקף גם בתצוגת הלקוח וגם ב-PDF",
    ],
  },
  {
    version: "1.17.0",
    date: "2026-08-15",
    changes: [
      "עיצוב חופשי לעמוד אלבום: מוסיפים כמה תמונות שרוצים, גוררים אותן וגם משנים את הגודל שלהן בעצמכם — לא רק שלוש התבניות הקבועות",
      "אפשר להוסיף שכבת טקסט (בעברית או אנגלית) לכל עמוד באלבום — כולל בעמודים בתבנית רגילה — עם בחירת מיקום, צבע ויישור",
      "הטקסטים והעיצוב החופשי מופיעים גם בתצוגה שהלקוח/ה רואים וגם בקובץ ה-PDF המיוצא, בדיוק כמו שעוצבו",
    ],
  },
  {
    version: "1.16.0",
    date: "2026-08-15",
    changes: [
      "בכל תמונה בעמוד אלבום אפשר עכשיו לקבוע נקודת מיקוד (מתוך 9 אפשרויות) — כדי שהחיתוך בתצוגה ובהדפסה לא יחתוך ראשים או פרטים חשובים",
      "אפשר להחליף תמונה בודדת בתוך עמוד קיים באלבום, בלי לפרק ולבנות מחדש",
      "התראה עדינה כשמספר העמודים באלבום אי-זוגי — חלק ממעבדות הדפוס דורשות מספר זוגי",
      "כפתור חדש \"ייצוא PDF להדפסה\" בכלי עיצוב האלבום — מייצא את כל האלבום (כולל השער והחיתוכים שנקבעו) לקובץ PDF מוכן לשליחה למעבדת דפוס",
    ],
  },
  {
    version: "1.15.0",
    date: "2026-08-15",
    changes: [
      "אפשר עכשיו לבחור ספק חשבוניות בהגדרות — נוסף חשבונית ירוקה (מורנינג) לצד Finbot, כל אחד עם חיבור חשבון משלו",
      "כלי עיצוב האלבום שודרג: תמונת שער לאלבום, בחירת פריסה לכל עמוד (שווה / מודגש / אנכי), וגרירה לשינוי סדר העמודים במחשב",
      "כשלקוח/ה מגיבים או מאשרים את עיצוב האלבום, נשלחת גם התראת וואטסאפ לצלם/ת (בנוסף להתראה במערכת)",
    ],
  },
  {
    version: "1.14.0",
    date: "2026-08-15",
    changes: [
      "כלי proofing לעיצוב אלבום: בוחרים תמונות לפי סדר בחירה, המערכת מסדרת אותן אוטומטית לעמודי אלבום (זוג תמונות לעמוד), ושולחים ללקוח/ה לאישור מתוך הגלריה",
      "הלקוח/ה יכולים לעבור על עיצוב האלבום, לכתוב הערות על כל עמוד ולאשר את העיצוב הסופי — הערה מחזירה את האלבום אוטומטית לטיפולכם",
    ],
  },
  {
    version: "1.13.0",
    date: "2026-08-15",
    changes: [
      "חשבוניות אמיתיות ללקוחות: מחברים חשבון Finbot אישי בהגדרות (עם סטטוס עוסק פטור/מורשה), ומפיקים קבלה/חשבונית אוטומטית ברגע שמסמנים תשלום כ\"שולם\" בכרטיס האירוע",
      "המסמך יוצא תחת הפרטים העסקיים שלכם ונשלח ישירות ללקוח/ה במייל",
    ],
  },
  {
    version: "1.12.0",
    date: "2026-08-15",
    changes: [
      "רצף מעקב אוטומטי אחר לידים: עד 3 הודעות וואטסאפ נשלחות אוטומטית לליד שלא הפך ללקוח (אחרי יומיים, 5 ימים ו-10 ימים) — נעצר אוטומטית ברגע שהליד מסומן כלקוח/כאבוד",
      "אפשר להפעיל/לכבות את המעקב האוטומטי בהגדרות",
    ],
  },
  {
    version: "1.11.6",
    date: "2026-08-15",
    changes: [
      "בגלריה שרואה הלקוח, כפתור הורדת המועדפים מוצג רק בתוך חלון \"התמונות שבחרתם\" — לא מופיע מראש בסרגל התחתון לפני שנפתח",
    ],
  },
  {
    version: "1.11.5",
    date: "2026-08-15",
    changes: [
      "מצגת התמונות מציגה כל תמונה 3 שניות (במקום 5), עם אפקטי מעבר בולטים ורנדומליים יותר בין תמונה לתמונה",
      "כפתור הורדה חדש במצגת, ליד כפתור הסגירה — מוריד את כל תמונות המצגת כקובץ ZIP מאורגן לפי לשוניות",
    ],
  },
  {
    version: "1.11.4",
    date: "2026-08-15",
    changes: [
      "ליד \"הצגת מועדפים בלבד\" במסך ניהול הגלריה נוסף כפתור להורדת התמונות המועדפות כקובץ ZIP מאורגן לפי לשוניות — עובד גם כשהורדות ללקוח מכובות",
      "\"תצוגה מקדימה\" הפכה לכפתור עגול עם אייקון עין במקום קישור טקסט",
      "כיוון החץ בקישור \"כל הגלריות\" תוקן להתאים לכיוון RTL",
    ],
  },
  {
    version: "1.11.3",
    date: "2026-08-15",
    changes: [
      "הורדת תמונות מרובות (כל התמונות / מועדפים / תמונות שנבחרו) יורדת עכשיו כקובץ ZIP מאורגן: תיקייה ראשית עם שם הגלריה והתאריך, ובתוכה תיקייה נפרדת לכל לשונית שהתמונות נשמרו ממנה",
    ],
  },
  {
    version: "1.11.2",
    date: "2026-08-15",
    changes: [
      "תיקון שורש: כפתור \"רשת/פסיפס\" הישן במסך ניהול הגלריה הציג פריסה משלו במקום זו שנבחרה בעיצוב הגלריה — הוסר, ומסך הניהול מציג עכשיו תמיד את הפריסה האמיתית שנבחרה",
      "לשוניות \"הגדרות גלריה\" עוצבו מחדש כך שיהיה ברור שאלו לשוניות עיקריות, בנפרד מתת-הלשוניות של פרטי הגלריה",
      "אפשר עכשיו לשנות את משך שמירת הגלריה גם אחרי שהיא פורסמה, ישירות מ\"פרטי הגלריה\"",
    ],
  },
  {
    version: "1.11.1",
    date: "2026-08-15",
    changes: [
      "\"עריכת פרטי הגלריה\" ו-\"עיצוב הגלריה\" אוחדו לכפתור אחד — \"הגדרות גלריה\" — עם לשוניות פנימיות",
      "מצגת התמונות עברה למסך הראשי של הגלריה עם כפתור נפרד, וכפתור התצוגה המקדימה שלה הפך לאייקון",
      "תיקון: שינוי פריסת תמונות בעיצוב הגלריה לא היה נראה בתצוגה המקדימה — עכשיו מוצגת דוגמת תמונות אמיתית בפריסה שנבחרה",
      "בעמוד הגלריה שרואה הלקוח, כשרשימת המועדפים פתוחה מופיע כפתור צף להורדת כל התמונות המסומנות בלב",
    ],
  },
  {
    version: "1.11.0",
    date: "2026-08-15",
    changes: [
      "עיצוב הגלריה קיבל גמישות מלאה: כל אחת מ-5 ערכות הנושא ניתנת עכשיו להתאמה אישית — סוג פונט ופריסת תמונות (רשת / פסיפס / ממוסגר / שורות מוצדקות) בנפרד מהערכה עצמה",
      "בוררי מיקום הכיתוב, צורת התמונה וערכת הנושא עוצבו מחדש: כפתורים גדולים עם אייקון ברור, כולם בשורה אחת, ושם ערכת הנושא מוצג עכשיו בגופן של הערכה עצמה",
      "מצגת תמונות חדשה ללקוח: בוחרים אילו תמונות ייכנסו למצגת, והיא מוצגת במסך מלא עם אפקטים רנדומליים (זום, דהייה, החלקה) בין תמונה לתמונה",
    ],
  },
  {
    version: "1.10.1",
    date: "2026-08-14",
    changes: [
      "תיקון: הבאנר של הגלריה לא הופיע כשלא נבחרה במפורש תמונת שער — כעת ברירת המחדל היא התמונה הראשונה שהועלתה",
      "אפשר לבחור את תמונת השער ישירות בתוך \"עיצוב הגלריה\", בלי צורך בלחיצה ארוכה על תמונה בנפרד",
    ],
  },
  {
    version: "1.10.0",
    date: "2026-08-14",
    changes: [
      "כל ערכת נושא בגלריה מציגה עכשיו גם פריסת תמונות שונה משלה, לא רק צבעים: רשת אחידה במינימלי, פסיפס צפוף ודרמטי בדרמטי, פריסה עם מסגרת עדינה סביב כל תמונה ברומנטי, ועוד",
      "הבאנר של הגלריה מקבל טיפול ייחודי לכל ערכה — קו מפריד עדין בקלאסי, מסגרת כמו תמונה מודפסת בחם, תמונה עד קצה המסך בדרמטי",
    ],
  },
  {
    version: "1.9.0",
    date: "2026-08-14",
    changes: [
      "תיקון: עיצוב הגלריה השתקף רק ברקע הדף ולא באלמנטים עצמם (באנרים, כפתורים, כרטיסי תמונה) — עכשיו כל הגלריה משתנה בהתאם לבחירה",
      "5 ערכות נושא חדשות ומלאות לגלריה: קלאסי, דרמטי, מינימלי, חם ורומנטי — כל אחת עם צבעים, טיפוגרפיה (כולל גופן סריף חדש לגלריות) וצורת פינות משלה",
      "תיקון נגישות: כל כפתורי עמוד ניהול הגלריה מוצגים כעת בניגודיות תקינה במצב כהה",
    ],
  },
  {
    version: "1.8.0",
    date: "2026-08-14",
    changes: [
      "עיצוב הגלריה הורחב: תמונת שער כבאנר עם 4 מיקומי כיתוב (מעל / מתחת / מרכז שמאל / מרכז ימין) ו-4 צורות תמונה (באנר, מלבן, ריבוע, עיגול)",
      "פריסת התמונות בגלריה שרואה הלקוח שונתה לפריסת פסיפס טבעית (כמו באתרי גלריה מקצועיים), במקום רשת ריבועים אחידה",
      "כפתורי \"עריכת פרטי הגלריה\" ו\"עיצוב הגלריה\" הפכו לכפתורים בולטים במקום קישורי טקסט",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-08-14",
    changes: [
      "תיקון קריטי: תמונות שהועלו לגלריה לא הוצגו כלל בצד הלקוח (אייקון תמונה שבורה) — הגדרת תצורה שגויה מנעה מהשרת לטעון תמונות מהאחסון",
    ],
  },
  {
    version: "1.6.1",
    date: "2026-08-14",
    changes: [
      "תמיכה בהעלאת תמונות HEIC/HEIF (הפורמט שאייפון שומר בו תמונות כברירת מחדל) — הן מומרות אוטומטית ל-JPG לפני ההעלאה",
      "תיקון: כשל בהעלאת תמונה (לדוגמה בעיית רשת) היה משאיר את המסך תקוע על \"מעלה...\" בלי הודעה — כעת מוצגת שגיאה ברורה וההעלאה ממשיכה לתמונה הבאה",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-08-14",
    changes: [
      "כפתור \"עיצוב הגלריה\" חדש: בחירת סגנון (קלאסי / דרמטי / מינימלי / חם) וצבע רקע לגלריה, עם תצוגה מקדימה חיה, שמשתקפים ישירות בגלריה שרואים הלקוחות",
    ],
  },
  {
    version: "1.5.1",
    date: "2026-08-14",
    changes: [
      "תיקון: הוספת לשונית לגלריה בשם שכבר קיים הציגה שגיאת מסד נתונים גולמית — כעת עוברים ללשונית הקיימת במקום",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-08-14",
    changes: [
      "כפתור \"שיתוף\" חדש בגלריות: בחירת אילו לשוניות לשתף, ושליחת קישור מוכן עם הודעה מסבירה — בוואטסאפ, קוד QR, או תפריט השיתוף של המכשיר",
      "שדה \"הערות\" חופשי לכל אירוע — נוסף בטופס אירוע חדש, מוצג בדף האירוע, וניתן לעריכה מתוך עריכת פרטי האירוע",
    ],
  },
  {
    version: "1.4.1",
    date: "2026-08-12",
    changes: [
      "כפתור הייצוא בניתוח עסקי פותח כעת אפשרויות שליחה: מייל (עם קובץ מצורף), וואטסאפ, או תפריט השיתוף של המכשיר",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-08-12",
    changes: [
      "עמוד ניתוח עסקי: כפתור \"ייצוא ל-CSV\" להורדת כל תשלומי החודש הנבחר בקובץ מסודר לרואה חשבון",
    ],
  },
  {
    version: "1.3.1",
    date: "2026-08-12",
    changes: [
      "שורת החיפוש ותאי המיון של רשימת האירועים אוחדו לשורה אחת קומפקטית, גם בנייד וגם במחשב",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-08-12",
    changes: [
      "מדריך חיבור יומן Apple נפתח כעת בחלון בתוך המערכת עצמה, עם כל 5 השלבים בפירוט מלא — בלי לצאת לעמוד חיצוני",
      "נוטיפיקציה על כפתור ההגדרות בעמוד הראשי כשיש עדכון חדש שעדיין לא נצפה",
      "מיון אירועים לפי תאריך: מהקרוב לרחוק, מהרחוק לקרוב, או בחירת חודש מסוים לצפייה",
    ],
  },
  {
    version: "1.2.1",
    date: "2026-08-12",
    changes: [
      "תיקון: התראת \"עדכון חדש\" ליד סמל ההגדרות נעלמת מיד אחרי לחיצה על אישור, במקום להישאר עד רענון הדף",
      "מדריך מדויק ומעודכן להוספת סיסמה ייעודית לחיבור יומן Apple, כולל הקישור הנכון והשלבים המדויקים",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-08-12",
    changes: [
      "סנכרון יומן חדש: תמיכה גם ביומן Apple (iCloud), לצד Google Calendar — אפשר לחבר את שניהם יחד",
      "מסך היומן מציג כעת 180 יום קדימה (במקום 60), ומסנן רק את האירועים בצבע שנבחר בהגדרות",
      "בדיקת כפילות תאריך בשמירת אירוע חדש: הודעה ברורה עם אפשרות מיידית להוספה לרשימת המתנה",
      "רשימת המתנה: אפשרות חדשה \"אישור האירוע\" להעברת אירוע כפול לרשימת האירועים עם ציון סיבה (צלם אחר / צוות שלם / טקסט חופשי), ומסך אישור לפני מחיקת רשומה",
      "סינון \"כפילויות / פרילנס\" חדש בעמוד האירועים הראשי",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-08-08",
    changes: [
      "לשונית \"עדכונים\" חדשה בהגדרות — כל היסטוריית העדכונים זמינה לצפייה בכל רגע",
      "תיקון תצוגה בנייד: שדה תאריך הצילום ומשך שמירת הגלריה לא הופיעו נכון זה לצד זה במסכים צרים",
      "אימות דומיין למיילים היוצאים מהמערכת — תזכורות פקיעת גלריה מגיעות כעת ללקוחות באמת",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-08-08",
    changes: [
      "מסך יצירה/עריכה חדש לגלריות, עם לשוניות פרטים והרשאות — גם לגלריה עצמאית וגם ליצירת גלריה ישירות מתוך אירוע",
      "אפשרות לכבות הורדת קבצים מקוריים מהגלריה, לבחירת הצלם/ת",
      "קישור לפורטל הלקוח נשלח אוטומטית ב-WhatsApp ברגע שנוצר אירוע חדש",
      "תזכורת אוטומטית ללקוח שבוע לפני שהגלריה נמחקת סופית מהמערכת",
      "חיזוק אבטחה: אימות חתימה על הודעות נכנסות מ-WhatsApp",
      "שיפורי מצב כהה ותיקוני תצוגה שונים",
    ],
  },
];

export const CURRENT_VERSION = CHANGELOG[0].version;
