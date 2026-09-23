export type GuideLang = "he" | "en" | "ru";

export type GuideSection = {
  heading: string;
  body: string;
  image?: string;
};

export type Guide = {
  title: string;
  intro: string;
  sections: GuideSection[];
};

export type PageGuideKey = "galleries" | "client-portals" | "leads" | "waitlist" | "analytics" | "quote-builder" | "calendar-scan" | "new-event" | "event-card";

export const GUIDE_LANG_LABELS: Record<GuideLang, string> = {
  he: "עברית",
  en: "English",
  ru: "Русский",
};

export const PAGE_GUIDES: Record<PageGuideKey, Record<GuideLang, Guide>> = {
  galleries: {
    he: {
      title: "מדריך: גלריות",
      intro:
        "עמוד הגלריות הוא המקום שבו יוצרים, מארגנים ושולחים ללקוחות את גלריות התמונות מהאירועים. כל גלריה מקבלת קישור אישי שהלקוח פותח בלי צורך בהתחברות.",
      sections: [
        {
          heading: "יצירת גלריה",
          body: "אפשר ליצור גלריה עצמאית מכאן, או ישירות מתוך כרטיס אירוע קיים. בזמן היצירה בוחרים משך שמירה קבוע מתוך רשימה (שבוע, 14 יום או חודש במסלול פרו; עד חצי שנה במסלול פרו+) וכן אם מותר ללקוח להוריד את התמונות.",
          image: "/guides/galleries-1.png",
        },
        {
          heading: "העלאת תמונות",
          body: "מעלים תמונות בגרירה או בבחירה מהמכשיר, כולל תמיכה בקבצי HEIC מאייפון, שממירים אוטומטית. אפשר לארגן את התמונות בתיקיות, לקבוע תמונת שער לגלריה, ולסמן מועדפות.",
        },
        {
          heading: "פרסום ושיתוף עם הלקוח",
          body: "לחיצה על \"פרסום הגלריה ללקוח\" הופכת אותה לזמינה, ופותחת הודעת וואטסאפ מוכנה עם הקישור לשליחה. אפשר גם להעתיק את הקישור ישירות או לשתף קוד QR.",
        },
        {
          heading: "מה הלקוח רואה ועושה",
          body: "הלקוח פותח את הקישור בלי להתחבר, יכול לדפדף בתמונות, לסמן מועדפות, ולהוריד תמונות בודדות או את כל הגלריה כקובץ ZIP אחד (אם ההורדה מאושרת).",
        },
        {
          heading: "עיצוב אלבום",
          body: "לגלריות שכוללות אלבום מודפס יש כלי עיצוב מובנה, גוררים תמונות לפריסת עמודים, ומייצאים כקובץ להדפסה או לאישור הלקוח.",
        },
        {
          heading: "ניהול תוקף אוטומטי",
          body: "המערכת שולחת תזכורת ללקוח לקראת סיום תוקף הגלריה, ומעדכנת את הסטטוס בהתאם, כדי שאף אחד לא יופתע שהקישור הפסיק לעבוד.",
        },
      ],
    },
    en: {
      title: "Guide: Galleries",
      intro:
        "The Galleries page is where you create, organize, and send clients their event photo galleries. Every gallery gets a personal link the client can open without logging in.",
      sections: [
        {
          heading: "Creating a gallery",
          body: "Create a standalone gallery here, or straight from an existing event card. When creating it, choose a fixed retention period from a list (a week, 14 days, or a month on the Pro plan; up to six months on Pro+) and whether the client is allowed to download the photos.",
          image: "/guides/galleries-1.png",
        },
        {
          heading: "Uploading photos",
          body: "Upload by dragging files or picking them from your device — including iPhone HEIC files, which are converted automatically. Photos can be organized into folders, a cover photo can be set, and favorites can be marked.",
        },
        {
          heading: "Publishing and sharing with the client",
          body: "Tapping \"Publish gallery to client\" makes it available and opens a ready-made WhatsApp message with the link to send. You can also copy the link directly or share a QR code.",
        },
        {
          heading: "What the client sees and does",
          body: "The client opens the link without logging in, can browse the photos, mark favorites, and download individual photos or the whole gallery as one ZIP file (if downloads are allowed).",
        },
        {
          heading: "Album design",
          body: "Galleries that include a printed album have a built-in design tool — drag photos into page layouts and export a file for printing or client approval.",
        },
        {
          heading: "Automatic expiry management",
          body: "The system sends the client a reminder as the gallery's expiry approaches, and updates its status accordingly — so no one is surprised when the link stops working.",
        },
      ],
    },
    ru: {
      title: "Руководство: Галереи",
      intro:
        "На странице «Галереи» вы создаёте, упорядочиваете и отправляете клиентам фотогалереи с мероприятий. Каждая галерея получает персональную ссылку, которую клиент открывает без входа в систему.",
      sections: [
        {
          heading: "Создание галереи",
          body: "Создайте отдельную галерею здесь или прямо из карточки существующего мероприятия. При создании выберите фиксированный срок хранения из списка (неделя, 14 дней или месяц на тарифе Про; до полугода на Про+), и разрешено ли клиенту скачивать фотографии.",
          image: "/guides/galleries-1.png",
        },
        {
          heading: "Загрузка фотографий",
          body: "Загружайте фотографии перетаскиванием или выбором с устройства — включая файлы HEIC с iPhone, которые конвертируются автоматически. Фото можно организовать по папкам, назначить обложку галереи и отметить избранные.",
        },
        {
          heading: "Публикация и отправка клиенту",
          body: "Нажатие «Опубликовать галерею для клиента» делает её доступной и открывает готовое сообщение WhatsApp со ссылкой для отправки. Можно также скопировать ссылку напрямую или поделиться QR-кодом.",
        },
        {
          heading: "Что видит и делает клиент",
          body: "Клиент открывает ссылку без входа в систему, может просматривать фотографии, отмечать избранные и скачивать отдельные фото или всю галерею одним ZIP-файлом (если скачивание разрешено).",
        },
        {
          heading: "Дизайн альбома",
          body: "Для галерей, включающих печатный альбом, есть встроенный инструмент дизайна — перетаскивайте фото в макет страниц и экспортируйте файл для печати или согласования с клиентом.",
        },
        {
          heading: "Автоматическое управление сроком действия",
          body: "Система отправляет клиенту напоминание перед истечением срока действия галереи и соответствующим образом обновляет статус — чтобы никто не удивился, когда ссылка перестанет работать.",
        },
      ],
    },
  },

  "client-portals": {
    he: {
      title: "מדריך: פורטל לקוח",
      intro:
        "לכל אירוע יש עמוד אישי ללקוח, \"פורטל\", שבו הוא יכול לעקוב אחרי התקדמות האירוע, לראות תשלומים, לחתום על חוזה ולצפות בגלריה, הכל בלי להתחבר למערכת.",
      sections: [
        {
          heading: "מה זה בעצם הפורטל",
          body: "קישור ייחודי לכל אירוע, שנוצר אוטומטית ברגע שהאירוע נסגר במערכת. הלקוח פותח אותו בכל דפדפן, בלי סיסמה ובלי הרשמה.",
          image: "/guides/client-portals-1.png",
        },
        {
          heading: "מעקב אחרי התקדמות האירוע",
          body: "הלקוח רואה את מסלול השלבים של האירוע, מיום הצילום ועד המסירה הסופית, ויודע בדיוק באיזה שלב הצלם נמצא כרגע.",
        },
        {
          heading: "תשלומים",
          body: "מוצגים סכומי המקדמה והיתרה, אילו כבר שולמו ואילו עדיין ממתינים, כולל תאריך היעד לתשלום.",
        },
        {
          heading: "חוזה דיגיטלי",
          body: "אם הועלה חוזה לאירוע, הלקוח יכול לקרוא אותו ולחתום ישירות בפורטל. בלי להדפיס או לסרוק כלום.",
        },
        {
          heading: "גלריה ואישור אלבום",
          body: "ברגע שהגלריה מתפרסמת, קישור אליה מופיע אוטומטית בפורטל. גם אישור עיצוב האלבום, כשרלוונטי, מתבצע דרך אותו עמוד.",
        },
        {
          heading: "שליחה קלה ללקוח",
          body: "כפתור \"העתקת קישור\" אחד ליד כל אירוע ברשימה, מעתיקים ושולחים בכל ערוץ שנוח (וואטסאפ, מייל, סמס).",
        },
      ],
    },
    en: {
      title: "Guide: Client Portal",
      intro:
        "Every event gets a personal page for the client — a \"portal\" — where they can track the event's progress, see payments, sign a contract, and view the gallery, all without logging in.",
      sections: [
        {
          heading: "What the portal actually is",
          body: "A unique link for each event, created automatically as soon as the event is booked. The client opens it in any browser, no password and no sign-up required.",
          image: "/guides/client-portals-1.png",
        },
        {
          heading: "Tracking event progress",
          body: "The client sees the event's stage track — from shoot day to final delivery — and knows exactly which stage the photographer is currently at.",
        },
        {
          heading: "Payments",
          body: "The deposit and balance amounts are shown, which ones are already paid and which are still pending, including the payment due date.",
        },
        {
          heading: "Digital contract",
          body: "If a contract was uploaded for the event, the client can read and sign it directly in the portal — no printing or scanning needed.",
        },
        {
          heading: "Gallery and album approval",
          body: "As soon as the gallery is published, a link to it appears automatically in the portal. Album design approval, when relevant, also happens through the same page.",
        },
        {
          heading: "Easy to send to the client",
          body: "One \"Copy link\" button next to each event in the list — copy it and send it through whichever channel is convenient (WhatsApp, email, SMS).",
        },
      ],
    },
    ru: {
      title: "Руководство: Портал клиента",
      intro:
        "У каждого мероприятия есть персональная страница для клиента — «портал», где он может отслеживать ход мероприятия, видеть платежи, подписать договор и просматривать галерею — всё без входа в систему.",
      sections: [
        {
          heading: "Что такое портал",
          body: "Уникальная ссылка для каждого мероприятия, создаваемая автоматически сразу после подтверждения бронирования. Клиент открывает её в любом браузере, без пароля и регистрации.",
          image: "/guides/client-portals-1.png",
        },
        {
          heading: "Отслеживание хода мероприятия",
          body: "Клиент видит этапы мероприятия — от дня съёмки до финальной передачи — и точно знает, на каком этапе сейчас находится фотограф.",
        },
        {
          heading: "Платежи",
          body: "Отображаются суммы задатка и остатка, какие уже оплачены, а какие ещё в ожидании, включая срок оплаты.",
        },
        {
          heading: "Электронный договор",
          body: "Если для мероприятия загружен договор, клиент может прочитать и подписать его прямо в портале — без печати и сканирования.",
        },
        {
          heading: "Галерея и утверждение альбома",
          body: "Как только галерея публикуется, ссылка на неё автоматически появляется в портале. Утверждение дизайна альбома, если это актуально, также происходит на этой странице.",
        },
        {
          heading: "Легко отправить клиенту",
          body: "Одна кнопка «Скопировать ссылку» рядом с каждым мероприятием в списке — скопируйте и отправьте любым удобным способом (WhatsApp, email, SMS).",
        },
      ],
    },
  },

  leads: {
    he: {
      title: "מדריך: לידים ופניות",
      intro:
        "כל פנייה חדשה של לקוח פוטנציאלי מתחילה כאן, כ\"ליד\". מכאן עוקבים אחרי הפנייה עד שהיא הופכת לאירוע סגור, או נסגרת בלי המשך.",
      sections: [
        {
          heading: "הוספת ליד חדש",
          body: "מוסיפים שם, טלפון, תאריך ואירוע מבוקשים, וחבילה בערך. אפשר להוסיף כל פנייה שמגיעה, טלפון, וואטסאפ, אתר או כל ערוץ אחר.",
          image: "/guides/leads-1.png",
        },
        {
          heading: "מעקב לפי סטטוס",
          body: "כל ליד עובר בין סטטוסים: חדש → יצרתי קשר → נשלחה הצעת מחיר → הפך ללקוח (או לא התקדם). כך רואים בבת אחת איפה כל פנייה עומדת.",
        },
        {
          heading: "בניית הצעת מחיר",
          body: "ישר מתוך הליד אפשר לבנות ולשלוח הצעת מחיר מותאמת אישית, בלי לצאת לעמוד אחר.",
        },
        {
          heading: "המרה לאירוע סגור",
          body: "כשהלקוח מאשר, לחיצה אחת הופכת את הליד לאירוע מלא במערכת, עם כל הפרטים שכבר הוזנו, בלי להקליד שוב.",
        },
        {
          heading: "מעקב אוטומטי אחרי לידים",
          body: "לליד שלא ענה, המערכת שולחת הודעות מעקב אוטומטיות בפרקי זמן קבועים, כדי שאף פנייה לא תישכח.",
        },
      ],
    },
    en: {
      title: "Guide: Leads",
      intro:
        "Every new inquiry from a potential client starts here, as a \"lead.\" From here you track the inquiry until it becomes a booked event — or gets closed without one.",
      sections: [
        {
          heading: "Adding a new lead",
          body: "Add a name, phone number, the requested date and event, and an approximate package. Add any inquiry that comes in — phone, WhatsApp, website, or any other channel.",
          image: "/guides/leads-1.png",
        },
        {
          heading: "Tracking by status",
          body: "Every lead moves through statuses: New → Contacted → Quote sent → Became a client (or Didn't proceed). This gives you an at-a-glance view of where every inquiry stands.",
        },
        {
          heading: "Building a price quote",
          body: "Build and send a customized price quote right from the lead, without leaving to another page.",
        },
        {
          heading: "Converting to a booked event",
          body: "Once the client confirms, one tap turns the lead into a full event in the system, with all the details already entered — no retyping needed.",
        },
        {
          heading: "Automatic lead follow-up",
          body: "For a lead who hasn't replied, the system sends automatic follow-up messages at set intervals — so no inquiry gets forgotten.",
        },
      ],
    },
    ru: {
      title: "Руководство: Заявки",
      intro:
        "Каждое новое обращение потенциального клиента начинается здесь, как «заявка». Отсюда вы отслеживаете обращение, пока оно не превратится в подтверждённое мероприятие — или не закроется без результата.",
      sections: [
        {
          heading: "Добавление новой заявки",
          body: "Добавьте имя, телефон, желаемую дату и мероприятие, а также примерный пакет услуг. Добавляйте любое обращение — по телефону, WhatsApp, с сайта или из другого канала.",
          image: "/guides/leads-1.png",
        },
        {
          heading: "Отслеживание по статусу",
          body: "Каждая заявка проходит статусы: Новая → Связались → Отправлено предложение → Стал клиентом (или Не продвинулось). Так вы сразу видите, на каком этапе находится каждое обращение.",
        },
        {
          heading: "Составление коммерческого предложения",
          body: "Прямо из заявки можно составить и отправить индивидуальное ценовое предложение, не переходя на другую страницу.",
        },
        {
          heading: "Превращение в подтверждённое мероприятие",
          body: "Как только клиент подтверждает — одно нажатие превращает заявку в полноценное мероприятие в системе, со всеми уже введёнными данными, без повторного ввода.",
        },
        {
          heading: "Автоматическое сопровождение заявок",
          body: "Для заявки, на которую не ответили, система автоматически отправляет напоминания через заданные промежутки времени — чтобы ни одно обращение не было забыто.",
        },
      ],
    },
  },

  waitlist: {
    he: {
      title: "מדריך: רשימת המתנה",
      intro:
        "כשלקוח מבקש תאריך שכבר תפוס באירוע אחר, המערכת מציעה להוסיף אותו לרשימת המתנה במקום לדחות אותו. ברגע שהתאריך מתפנה, הופכים אותו לאירוע בלחיצה.",
      sections: [
        {
          heading: "איך רשומה מגיעה לרשימה",
          body: "בזמן יצירת אירוע או ליד בתאריך שכבר תפוס, המערכת מזהה את ההתנגשות ומציעה להוסיף את הפנייה לרשימת המתנה במקום לדחות אותה.",
          image: "/guides/waitlist-1.png",
        },
        {
          heading: "התאריך התפנה",
          body: "כפתור \"התאריך התפנה, יצירת אירוע\" הופך את הרשומה לאירוע חדש בלחיצה אחת, עם כל הפרטים שכבר הוזנו מראש.",
        },
        {
          heading: "אישור בדרך אחרת",
          body: "אם הלקוח הסתדר בעצמו, למשל שכר צלם אחר או צוות נוסף. אפשר לסמן זאת ולתעד איך הפנייה נסגרה, בלי למחוק את ההיסטוריה.",
        },
        {
          heading: "ניקוי הרשימה",
          body: "רשומה שכבר לא רלוונטית אפשר למחוק ישירות מהרשימה.",
        },
      ],
    },
    en: {
      title: "Guide: Waitlist",
      intro:
        "When a client asks for a date that's already booked for another event, the system offers to add them to the waitlist instead of turning them away. Once the date frees up, one tap turns them into an event.",
      sections: [
        {
          heading: "How an entry lands on the waitlist",
          body: "While creating an event or lead on a date that's already taken, the system detects the conflict and offers to add the inquiry to the waitlist instead of rejecting it.",
          image: "/guides/waitlist-1.png",
        },
        {
          heading: "The date freed up",
          body: "The \"Date freed up — create event\" button turns the entry into a new event with one tap, using all the details that were already entered.",
        },
        {
          heading: "Resolved another way",
          body: "If the client sorted it out on their own — for example, booked another photographer or an extra crew — you can mark that and record how the inquiry was resolved, without deleting the history.",
        },
        {
          heading: "Cleaning up the list",
          body: "An entry that's no longer relevant can be deleted directly from the list.",
        },
      ],
    },
    ru: {
      title: "Руководство: Лист ожидания",
      intro:
        "Когда клиент просит дату, уже занятую другим мероприятием, система предлагает добавить его в лист ожидания вместо отказа. Как только дата освобождается — одно нажатие превращает запись в мероприятие.",
      sections: [
        {
          heading: "Как запись попадает в лист ожидания",
          body: "При создании мероприятия или заявки на уже занятую дату система обнаруживает конфликт и предлагает добавить обращение в лист ожидания вместо отказа.",
          image: "/guides/waitlist-1.png",
        },
        {
          heading: "Дата освободилась",
          body: "Кнопка «Дата освободилась — создать мероприятие» превращает запись в новое мероприятие одним нажатием, используя все уже введённые данные.",
        },
        {
          heading: "Решено другим способом",
          body: "Если клиент решил вопрос самостоятельно — например, нанял другого фотографа или дополнительную команду — можно отметить это и зафиксировать, как обращение было закрыто, не удаляя историю.",
        },
        {
          heading: "Очистка списка",
          body: "Запись, которая больше не актуальна, можно удалить прямо из списка.",
        },
      ],
    },
  },

  analytics: {
    he: {
      title: "מדריך: ניתוח עסקי",
      intro:
        "עמוד הדשבורד נותן תמונה עסקית מלאה, כמה הרווחת בכל חודש, אילו תשלומים עדיין ממתינים, ואיזה סוגי חבילות הכי מבוקשים.",
      sections: [
        {
          heading: "הכנסות חודשיות",
          body: "גרף שמראה כמה שולם בפועל (מקדמות ויתרות) בכל חודש, עם אפשרות לדפדף בין חודשים ושנים שונות ולראות פירוט של כל תשלום.",
          image: "/guides/analytics-1.png",
        },
        {
          heading: "תשלומים ממתינים",
          body: "רשימה של כל הסכומים שעדיין לא שולמו, כולל שם הלקוח ותאריך היעד לתשלום, כדי לדעת למי להזכיר ומתי.",
        },
        {
          heading: "התפלגות לפי חבילות",
          body: "כמה אירועים מכל סוג חבילה נסגרו, כדי להבין מה הכי מבוקש ולתכנן לפי זה.",
        },
        {
          heading: "ייצוא לרואה חשבון",
          body: "כפתור אחד מוריד את כל נתוני החודש כקובץ CSV, מוכן להעברה לרואה החשבון או לתוכנת הנהלת חשבונות.",
        },
        {
          heading: "שליחת דו״ח במייל",
          body: "אפשר לשלוח את סיכום החודש ישירות למייל, לרואה החשבון, לשותף, או לכל כתובת שנוחה.",
        },
      ],
    },
    en: {
      title: "Guide: Business Analytics",
      intro:
        "The dashboard page gives you the full business picture — how much you earned each month, which payments are still pending, and which package types are most in demand.",
      sections: [
        {
          heading: "Monthly revenue",
          body: "A chart showing how much was actually paid (deposits and balances) each month, with the ability to browse different months and years and see a breakdown of every payment.",
          image: "/guides/analytics-1.png",
        },
        {
          heading: "Pending payments",
          body: "A list of every amount not yet paid, including the client's name and the payment due date — so you know who to remind, and when.",
        },
        {
          heading: "Breakdown by package",
          body: "How many events of each package type were booked, to understand what's most in demand and plan accordingly.",
        },
        {
          heading: "Export for your accountant",
          body: "One button downloads the whole month's data as a CSV file, ready to hand off to your accountant or bookkeeping software.",
        },
        {
          heading: "Emailing a report",
          body: "Send the month's summary straight to email — to your accountant, a business partner, or any address that's convenient.",
        },
      ],
    },
    ru: {
      title: "Руководство: Бизнес-аналитика",
      intro:
        "Страница дашборда даёт полную картину бизнеса — сколько вы заработали за каждый месяц, какие платежи ещё ожидаются и какие пакеты услуг наиболее востребованы.",
      sections: [
        {
          heading: "Ежемесячный доход",
          body: "График, показывающий, сколько фактически оплачено (задатки и остатки) за каждый месяц, с возможностью просматривать разные месяцы и годы и видеть детализацию каждого платежа.",
          image: "/guides/analytics-1.png",
        },
        {
          heading: "Ожидающие платежи",
          body: "Список всех ещё не оплаченных сумм, включая имя клиента и срок оплаты — чтобы знать, кому и когда напомнить.",
        },
        {
          heading: "Распределение по пакетам",
          body: "Сколько мероприятий каждого типа пакета было забронировано — чтобы понять, что наиболее востребовано, и планировать соответственно.",
        },
        {
          heading: "Экспорт для бухгалтера",
          body: "Одна кнопка скачивает все данные за месяц в виде файла CSV, готового для передачи бухгалтеру или в программу учёта.",
        },
        {
          heading: "Отправка отчёта по email",
          body: "Отправьте итоги месяца прямо на email — бухгалтеру, партнёру по бизнесу или на любой удобный адрес.",
        },
      ],
    },
  },
  "quote-builder": {
    he: {
      title: "מדריך: בונה הצעות מחיר",
      intro:
        "הכלי הזה בונה הצעת מחיר מלאה ללקוח תוך דקה, כולל חישוב מע\"מ, ספקים, והפקת קובץ PDF מוכן לשליחה. אפשר לבנות הצעה מאפס, או להתחיל מהצעה קודמת ומתבנית שמורה.",
      sections: [
        {
          heading: "שלבים להכנת הצעת מחיר",
          body: "1. בחרו למעלה את סוג ההצעה, אירוע, סטנדרטי או פרילנס.\n2. הזינו שעות צילום ותעריף לשעה, או טענו הצעה קודמת או תבנית שמורה.\n3. הוסיפו ספקים רלוונטיים באמצעות הכפתור הבולט \"+ הוספת ספק\", ואם צריך שנו את המחיר של כל ספק ישירות בשורה.\n4. בדקו את הסכום הכולל בתחתית המסך (כולל מע\"מ אם רלוונטי).\n5. לחצו \"יצירת הצעת מחיר ללקוח\" ומלאו את פרטי הלקוח/ה והאירוע.\n6. עברו על התצוגה המקדימה ולחצו \"שליחה ללקוח/ה\" כדי לשתף את קובץ ה-PDF.\n7. אחרי השליחה אפשר לשמור את ההצעה לרשימה, ולהוסיף את הלקוח/ה לרשימת הלידים כדי לקבל תזכורת מעקב אם לא תחזרו אליה תוך יומיים.",
        },
        {
          heading: "בחירת סוג ההצעה",
          body: "שלושה מצבים למעלה: \"אירוע\" מחשב לפי שעות צילום ומחיר לשעה ומאפשר להוסיף ספקים; \"סטנדרטי\" דומה אבל בלי טעינה מהצעות קודמות; \"פרילנס\" הוא תעריף שעתי פשוט בלי ספקים, למקרה שמצלמים עבור צלם/ית אחר/ת.",
        },
        {
          heading: "טעינה מהצעה קודמת או מתבנית",
          body: "במצב \"אירוע\" אפשר לטעון הצעת מחיר ששלחתם בעבר, ולערוך אותה במקום להתחיל מחדש. תבניות (שנבנות בהגדרות ← הצעות מחיר) הן ערכות פריטים קבועות, למשל \"חבילת חתונה בסיסית\", שמהוות בסיס להצעה חדשה.",
        },
        {
          heading: "עוסק פטור / עוסק מורשה",
          body: "קובע אם מע\"מ מתווסף למחיר הסופי. הבחירה כאן היא לחישוב הנוכחי בלבד ולא משנה את סטטוס העסק שלכם במערכת.",
        },
        {
          heading: "ספקים לאירוע זה",
          body: "כל שורת ספק היא רשימה נפתחת מתוך הספקים השמורים בהגדרות (תמחור וחבילות), או טקסט חופשי למחיר חד-פעמי. אפשר לשנות את המחיר בכל שורה ישירות, גם עבור ספק מהרשימה הקבועה, בלי להשפיע על המחיר השמור שלו בהגדרות. \"עריכת ספקים\" (מופיע רק אחרי שנוספו ספקים להצעה זו) פותח מחיקה מרובה מהירה מתוך רשימת הספקים של ההצעה הנוכחית בלבד.",
        },
        {
          heading: "יצירת הצעת מחיר ללקוח",
          body: "פותח טופס קצר לפרטי הלקוח/ה והאירוע (כולל שדה הערות חופשי), ואז מציג תצוגה מקדימה של קובץ ה-PDF לפני השליחה. אפשר לשתף אותו ישירות מהמכשיר, לשמור אותו לרשימת ההצעות השמורות, ולהוסיף את הלקוח/ה לרשימת הלידים לקבלת תזכורת מעקב.",
        },
      ],
    },
    en: {
      title: "Guide: Quote Builder",
      intro:
        "This tool builds a complete client price quote in under a minute — VAT calculation, vendor costs, and a ready-to-send PDF. Start from scratch, or from a previous quote or a saved template.",
      sections: [
        {
          heading: "Steps to prepare a price quote",
          body: "1. Choose the quote type at the top — Event, Standard, or Freelance.\n2. Enter shoot hours and hourly rate, or load a previous quote or a saved template.\n3. Add relevant vendors with the prominent \"+ Add vendor\" button — edit each vendor's price directly in its row if needed.\n4. Check the total at the bottom of the screen (including VAT if relevant).\n5. Tap \"Create a quote for a client\" and fill in the client's and event's details.\n6. Review the PDF preview and tap \"Send to client\" to share the file.\n7. After sending, you can save the quote to your list, and add the client to your leads list to get a follow-up reminder if you haven't gotten back to them within two days.",
        },
        {
          heading: "Choosing the quote type",
          body: "Three modes at the top: \"Event\" calculates from shoot hours and hourly rate and lets you add vendors; \"Standard\" is similar but without loading previous quotes; \"Freelance\" is a simple hourly rate with no vendors, for shooting on behalf of another photographer.",
        },
        {
          heading: "Loading a previous quote or a template",
          body: "In \"Event\" mode you can load a quote you sent before and edit it instead of starting over. Templates (built in Settings → Price Quotes) are fixed item sets — e.g. \"Basic wedding package\" — that serve as the starting point for a new quote.",
        },
        {
          heading: "VAT-exempt / VAT-registered",
          body: "Decides whether VAT is added to the final price. This choice only applies to the current calculation and doesn't change your account's actual business status.",
        },
        {
          heading: "Vendors for this event",
          body: "Each vendor row is a dropdown of the suppliers saved in Settings (Pricing & Packages), or free text for a one-off price — you can edit the price directly in any row, even for a supplier from the saved list, without affecting that supplier's saved default price. \"Edit vendors\" (appears only once vendors have been added to this quote) opens quick multi-select deletion from this quote's own vendor list.",
        },
        {
          heading: "Creating a quote for a client",
          body: "Opens a short form for the client's and event's details (including a free-text notes field), then shows a PDF preview before sending — share it straight from the device, save it to the list of saved quotes, and add the client to your leads list for a follow-up reminder.",
        },
      ],
    },
    ru: {
      title: "Руководство: Конструктор ценовых предложений",
      intro:
        "Этот инструмент создаёт полное ценовое предложение для клиента менее чем за минуту — расчёт НДС, стоимость поставщиков и готовый PDF-файл для отправки. Можно начать с нуля, из предыдущего предложения или из сохранённого шаблона.",
      sections: [
        {
          heading: "Шаги для подготовки ценового предложения",
          body: "1. Выберите тип предложения сверху — Мероприятие, Стандарт или Фриланс.\n2. Введите часы съёмки и почасовую ставку, либо загрузите предыдущее предложение или сохранённый шаблон.\n3. Добавьте нужных поставщиков с помощью заметной кнопки «+ Добавить поставщика» — при необходимости измените цену каждого поставщика прямо в строке.\n4. Проверьте итоговую сумму внизу экрана (включая НДС, если применимо).\n5. Нажмите «Создать предложение для клиента» и заполните данные клиента и мероприятия.\n6. Просмотрите предпросмотр PDF и нажмите «Отправить клиенту», чтобы поделиться файлом.\n7. После отправки можно сохранить предложение в список и добавить клиента в список лидов, чтобы получить напоминание о необходимости связаться с ним, если вы не сделаете этого в течение двух дней.",
        },
        {
          heading: "Выбор типа предложения",
          body: "Три режима сверху: «Мероприятие» рассчитывает по часам съёмки и почасовой ставке и позволяет добавлять поставщиков; «Стандарт» похож, но без загрузки предыдущих предложений; «Фриланс» — простая почасовая ставка без поставщиков, для съёмки от имени другого фотографа.",
        },
        {
          heading: "Загрузка предыдущего предложения или шаблона",
          body: "В режиме «Мероприятие» можно загрузить ранее отправленное предложение и отредактировать его вместо того, чтобы начинать заново. Шаблоны (создаются в Настройки → Ценовые предложения) — это фиксированные наборы позиций, например «Базовый свадебный пакет», которые служат основой для нового предложения.",
        },
        {
          heading: "Освобождён от НДС / плательщик НДС",
          body: "Определяет, добавляется ли НДС к итоговой цене. Этот выбор действует только для текущего расчёта и не меняет фактический статус вашего бизнеса в системе.",
        },
        {
          heading: "Поставщики для этого мероприятия",
          body: "Каждая строка поставщика — это выпадающий список поставщиков, сохранённых в Настройках (Цены и пакеты), либо свободный текст для разовой цены — цену можно изменить прямо в строке, даже для поставщика из сохранённого списка, не затрагивая его сохранённую цену по умолчанию. «Редактировать поставщиков» (появляется только после добавления поставщиков к этому предложению) открывает быстрое множественное удаление из списка поставщиков именно этого предложения.",
        },
        {
          heading: "Создание предложения для клиента",
          body: "Открывает короткую форму с данными клиента и мероприятия (включая поле для свободных заметок), затем показывает предпросмотр PDF перед отправкой — можно поделиться им прямо с устройства, сохранить в список сохранённых предложений и добавить клиента в список лидов для напоминания о последующем контакте.",
        },
      ],
    },
  },
  "calendar-scan": {
    he: {
      title: "מדריך: סריקת יומן לאירועים חדשים",
      intro:
        "התכונה הזו מוצאת אירועי לקוחות שכבר נמצאים ביומן Google שלכם אך עדיין אין להם כרטיס במערכת, ופותחת לכל אחד מהם טופס \"אירוע חדש\" ממולא מראש: כדי לחסוך את ההקלדה החוזרת.",
      sections: [
        {
          heading: "שני צבעים, שני תפקידים",
          body: "\"צבע האירועים ביומן\" הוא הצבע שבו המערכת עצמה מסמנת אירועים שהיא יצרה. \"צבע לזיהוי אירועים לייבוא\" הוא הצבע שבו אתם מסמנים ביד ביומן Google אירוע לקוח חדש שעדיין לא נכנס למערכת. אפשר לבחור באותו הצבע לשניהם, המערכת מזהה אירוע שכבר יובא לפי הקישור שלו לכרטיס אירוע, לא רק לפי הצבע.",
        },
        {
          heading: "איך מסמנים אירוע לסריקה",
          body: "ביומן Google עצמו (לא במערכת), בעת יצירת אירוע חדש או עריכת קיים, בוחרים את צבע האירוע ומשנים אותו לצבע שבחרתם כאן להגדרות. אפשר גם לכתוב בתיאור האירוע \"מקדמה: [סכום]\" ו/או \"יתרה: [סכום]\", הסריקה תנסה לזהות את זה אוטומטית.",
        },
        {
          heading: "הפעלת הסריקה",
          body: "לוחצים על כפתור הסריקה, בוחרים כמה קדימה בזמן לסרוק (חודש / 3 חודשים / חצי שנה / שנה), והמערכת מציגה רשימה של כל האירועים בצבע שנבחר שעדיין אין להם כרטיס.",
        },
        {
          heading: "השלמת הפרטים",
          body: "לחיצה על אירוע ברשימה פותחת טופס \"אירוע חדש\" עם שם, תאריך, שעות, מיקום והערות ממולאים מראש (וגם מקדמה/יתרה אם זוהו בתיאור). כל שדה ניתן לעריכה או השלמה לפני השמירה. אחרי השמירה, האירוע המקורי ביומן מתעדכן ומקבל את צבע המערכת הרגיל, כך שהוא לא יופיע שוב בסריקה הבאה.",
        },
      ],
    },
    en: {
      title: "Guide: Calendar Scan for New Events",
      intro:
        "This feature finds client events that already exist in your Google Calendar but have no event card in the system yet, and opens a prefilled \"new event\" form for each one — saving you re-typing everything.",
      sections: [
        {
          heading: "Two colors, two roles",
          body: "\"Calendar event color\" is the color the system itself uses for events it created. \"Import-detection color\" is the one you manually assign in Google Calendar to a new client booking not yet in the system — you can set both to the same color; the system tells an already-imported event apart by its link to a real event card, not just by color.",
        },
        {
          heading: "Marking an event for the scan",
          body: "In Google Calendar itself (not the app), when creating or editing an event, set its color to the one you chose here in Settings. You can also write \"מקדמה: [amount]\" and/or \"יתרה: [amount]\" in the description, the scan will try to detect these automatically.",
        },
        {
          heading: "Running a scan",
          body: "Click the scan button, choose how far ahead to look (1 month / 3 months / 6 months / a year), and the system shows every event in the chosen color that has no card yet.",
        },
        {
          heading: "Finishing the details",
          body: "Clicking an event in the list opens a \"new event\" form with name, date, times, location and notes prefilled (plus deposit/balance if detected in the description) — every field stays editable before saving. Once saved, the original calendar event is updated and recolored to the regular system color, so it won't show up again in the next scan.",
        },
      ],
    },
    ru: {
      title: "Руководство: сканирование календаря на новые события",
      intro:
        "Эта функция находит события клиентов, которые уже есть в вашем Google Календаре, но ещё не имеют карточки в системе, и открывает для каждого из них предзаполненную форму «новое событие» — экономя повторный ввод данных.",
      sections: [
        {
          heading: "Два цвета, две роли",
          body: "«Цвет событий в календаре» — это цвет, которым сама система помечает созданные ею события. «Цвет для распознавания импорта» — цвет, которым вы сами вручную помечаете в Google Календаре новое бронирование клиента, ещё не внесённое в систему. Можно назначить оба одним и тем же цветом — система отличает уже импортированное событие по его связи с карточкой события, а не только по цвету.",
        },
        {
          heading: "Как пометить событие для сканирования",
          body: "В самом Google Календаре (не в приложении), при создании или редактировании события, установите его цвет на тот, что вы выбрали здесь, в настройках. Также можно написать в описании события «מקדמה: [сумма]» и/или «יתרה: [сумма]», сканирование попытается распознать их автоматически.",
        },
        {
          heading: "Запуск сканирования",
          body: "Нажмите кнопку сканирования, выберите, на сколько вперёд смотреть (1 месяц / 3 месяца / полгода / год), и система покажет все события выбранного цвета, у которых ещё нет карточки.",
        },
        {
          heading: "Завершение данных",
          body: "Нажатие на событие в списке открывает форму «новое событие» с предзаполненными именем, датой, временем, местом и заметками (а также задатком/остатком, если они распознаны в описании) — каждое поле можно отредактировать перед сохранением. После сохранения исходное событие в календаре обновляется и перекрашивается в обычный цвет системы, поэтому оно не появится снова при следующем сканировании.",
        },
      ],
    },
  },
  "new-event": {
    he: {
      title: "מדריך: אירוע חדש",
      intro:
        "הטופס הזה פותח אירוע חדש במערכת בשלושה שלבים קצרים: פרטי הלקוח/ה והחבילה, מתי ואיפה, ותשלום. בסיום האירוע נשמר, נוסף ליומן Google שלכם (אם חיברתם אותו), ואפשר לשלוח ללקוח/ה חוזה לחתימה והודעת פתיחה בוואטסאפ.",
      sections: [
        {
          heading: "שלבים לפתיחת אירוע",
          body: "1. שלב ראשון: בחרו סוג אירוע, הזינו שם לקוח/ה וטלפון, ובחרו חבילה.\n2. שלב שני: בחרו תאריך (חובה), שעות, מיקום, שעת הגעה לצילומי משפחה והערות.\n3. שלב שלישי, הזינו מקדמה ויתרה, ואם רוצים סמנו תזכורת תשלום אוטומטית.\n4. לחצו \"שמירת האירוע\" ואשרו.\n5. בחרו אם לשלוח חוזה לחתימה (או דלגו).\n6. בסוף לחצו על שליחת עדכון בוואטסאפ ללקוח/ה, או עברו ישר לעמוד האירוע.",
        },
        {
          heading: "סוג האירוע",
          body: "רשימה נפתחת: חתונה, חינה, בת מצווה, בר מצווה, עלייה לתורה, הכנסת ספר תורה, ברית, בריתה ומגנטים. לא מצאתם? בחרו \"אחר: הקלדה חופשית\" והקלידו את הסוג בעצמכם. אחרי שמירת האירוע הסוג יישמר ברשימה ויופיע גם באירועים הבאים. האירוע יוצג בכרטיס כ\"סוג האירוע - שם הלקוח/ה\", למשל: עלייה לתורה - יוני כהן. השדה אינו חובה.",
        },
        {
          heading: "שם ופרטי קשר",
          body: "שם הלקוח/ה הוא שדה חובה כדי להמשיך. הטלפון משמש לתזכורות ולשליחת הודעות בוואטסאפ, בלעדיו אי אפשר לשלוח ללקוח/ה עדכון מהמערכת.",
        },
        {
          heading: "בחירת חבילה",
          body: "החבילה (המסומנת במסגרת בולטת) קובעת אילו שלבי עבודה יופיעו באירוע ובאיזה סדר. ברירת המחדל היא חבילה בשם \"ברירת מחדל\" עם שני שלבים בלבד: יום הצילום ומסירה סופית. אפשר לבחור חבילה מלאה מהרשימה, או ליצור חבילה מותאמת אישית משלכם עם \"+ חבילה מותאמת אישית חדשה\". את חבילת ברירת המחדל אפשר לערוך בהגדרות.",
        },
        {
          heading: "מתי ואיפה",
          body: "התאריך והשעות משמשים גם לסנכרון עם יומן Google ולזיהוי כפילויות. אם כבר קיים אירוע חופף באותו תאריך ובאותן שעות, המערכת תציע להכניס את האירוע החדש לרשימת המתנה במקום לשמור אותו.",
        },
        {
          heading: "תשלום ותזכורת",
          body: "מקדמה ויתרה בשקלים. סימון \"תזכורת תשלום אוטומטית ליתרה\" קובע תאריך שבו המערכת תשאל אתכם אם היתרה שולמה, ורק אם לא, תשלח ללקוח/ה תזכורת. כברירת מחדל התאריך הוא יום אחרי האירוע.",
        },
        {
          heading: "חוזה והודעת פתיחה",
          body: "אחרי השמירה אפשר לבחור תבנית חוזה, לערוך את התנאים רק עבור האירוע הזה, וליצור קישור לחתימה דיגיטלית שאותו שולחים ללקוח/ה. אפשר גם לדלג ולפתוח חוזה מאוחר יותר מעמוד האירוע. בשלב האחרון הכפתור פותח את הוואטסאפ שלכם עם הודעה מוכנה, פרטי האירוע, המקדמה והיתרה וקישור לפורטל האישי של הלקוח/ה. אתם בודקים ושולחים בעצמכם.",
        },
      ],
    },
    en: {
      title: "Guide: New event",
      intro:
        "This form creates a new event in three short steps: client and package, when and where, and payment. When you finish, the event is saved, added to your Google Calendar (if connected), and you can send the client a contract to sign and an opening WhatsApp message.",
      sections: [
        {
          heading: "Steps to create an event",
          body: "1. Step one — choose an event type, enter the client's name and phone, and pick a package.\n2. Step two — pick a date (required), times, location, family-photos arrival time and notes.\n3. Step three — enter the deposit and balance, and optionally turn on an automatic payment reminder.\n4. Tap \"Save event\" and confirm.\n5. Choose whether to send a contract for signature (or skip it).\n6. Finally, send the client a WhatsApp update, or go straight to the event page.",
        },
        {
          heading: "Event type",
          body: "A dropdown: wedding, henna, bat mitzvah, bar mitzvah, aliyah to the Torah, Torah scroll dedication, brit milah, brit bat, and magnets. Not in the list? Choose \"Other — free text\" and type the type yourself — once the event is saved, it is kept in the list and appears for your next events too. The event is shown on its card as \"event type - client name\", for example: Aliyah to the Torah - Yoni Cohen. This field is optional.",
        },
        {
          heading: "Name and contact details",
          body: "The client's name is required to continue. The phone number is used for reminders and WhatsApp messages — without it the system can't send the client an update.",
        },
        {
          heading: "Choosing a package",
          body: "The package (in the highlighted frame) decides which work stages the event has, and in what order. The default is a package called \"ברירת מחדל\" (Default) with just two stages: the shoot day and final delivery. You can pick a full package from the list, or build your own with \"+ New custom package\". You can edit the default package in Settings.",
        },
        {
          heading: "When and where",
          body: "The date and times are also used for Google Calendar sync and for detecting overlaps. If another event already overlaps on the same date and hours, the system offers to put the new event on the waitlist instead of saving it.",
        },
        {
          heading: "Payment and reminder",
          body: "Deposit and balance in shekels. Turning on \"automatic payment reminder for the balance\" sets a date on which the system asks you whether the balance was paid — and only if not, sends the client a reminder. By default the date is the day after the event.",
        },
        {
          heading: "Contract and opening message",
          body: "After saving you can pick a contract template, edit the terms for this event only, and create a digital signing link to send to the client. You can also skip it and create a contract later from the event page. In the last step, the button opens your WhatsApp with a ready message — the event details, deposit and balance, and a link to the client's personal portal. You review and send it yourself.",
        },
      ],
    },
    ru: {
      title: "Руководство: Новое событие",
      intro:
        "Эта форма создаёт новое событие в три коротких шага: клиент и пакет, когда и где, и оплата. В конце событие сохраняется, добавляется в ваш Google Календарь (если он подключён), а клиенту можно отправить договор на подпись и первое сообщение в WhatsApp.",
      sections: [
        {
          heading: "Шаги создания события",
          body: "1. Шаг первый — выберите тип события, введите имя и телефон клиента и выберите пакет.\n2. Шаг второй — выберите дату (обязательно), время, место, время прибытия на семейные фото и заметки.\n3. Шаг третий — введите задаток и остаток, при желании включите автоматическое напоминание об оплате.\n4. Нажмите «Сохранить событие» и подтвердите.\n5. Выберите, отправлять ли договор на подпись (или пропустите).\n6. В конце отправьте клиенту сообщение в WhatsApp или сразу перейдите на страницу события.",
        },
        {
          heading: "Тип события",
          body: "Выпадающий список: свадьба, хна, бат-мицва, бар-мицва, подъём к Торе, внесение свитка Торы, брит-мила, брит-бат и магниты. Нет нужного? Выберите «Другое — свободный ввод» и введите тип сами — после сохранения события он останется в списке и появится в следующих событиях. На карточке событие отображается как «тип события - имя клиента», например: Подъём к Торе - Йони Коэн. Поле необязательное.",
        },
        {
          heading: "Имя и контакты",
          body: "Имя клиента обязательно, чтобы продолжить. Телефон используется для напоминаний и сообщений в WhatsApp — без него система не сможет отправить клиенту обновление.",
        },
        {
          heading: "Выбор пакета",
          body: "Пакет (в выделенной рамке) определяет, какие этапы работы будут в событии и в каком порядке. По умолчанию выбран пакет «ברירת מחדל» («По умолчанию») всего с двумя этапами: день съёмки и финальная передача. Можно выбрать полный пакет из списка или создать свой через «+ Новый персональный пакет». Пакет по умолчанию можно изменить в настройках.",
        },
        {
          heading: "Когда и где",
          body: "Дата и время также используются для синхронизации с Google Календарём и для поиска пересечений. Если в те же дату и часы уже есть событие, система предложит добавить новое событие в список ожидания вместо сохранения.",
        },
        {
          heading: "Оплата и напоминание",
          body: "Задаток и остаток в шекелях. Включение «автоматического напоминания об остатке» задаёт дату, когда система спросит вас, оплачен ли остаток, — и только если нет, отправит клиенту напоминание. По умолчанию дата — на следующий день после события.",
        },
        {
          heading: "Договор и первое сообщение",
          body: "После сохранения можно выбрать шаблон договора, изменить условия только для этого события и создать ссылку для цифровой подписи, которую вы отправляете клиенту. Можно пропустить и создать договор позже на странице события. На последнем шаге кнопка открывает ваш WhatsApp с готовым сообщением — детали события, задаток и остаток и ссылка на личный портал клиента. Проверяете и отправляете вы сами.",
        },
      ],
    },
  },
  "event-card": {
    he: {
      title: "מדריך: כרטיס אירוע",
      intro:
        "כרטיס האירוע הוא מרכז השליטה של אירוע אחד: הפרטים שלו, התשלומים, החוזה, הגלריה, הפורטל של הלקוח/ה ומסלול העבודה שלב אחרי שלב. כל הפעולות בכרטיס הן בלחיצה אחת. אין צורך בלחיצה כפולה.",
      sections: [
        {
          heading: "שלבים לעבודה עם כרטיס אירוע",
          body: "1. בדקו למעלה את פרטי האירוע (תאריך, חבילה, טלפון, מיקום והערות), ואם צריך לחצו על \"עריכת פרטי האירוע\".\n2. שלחו ללקוח/ה את הודעת הפתיחה (אם עדיין לא נשלחה), ובחרו אם ליצור חוזה לחתימה.\n3. סמנו תשלומים בכרטיס \"תשלומים\" כשהם מתקבלים.\n4. עברו על \"מסלול התהליך\" שלב אחרי שלב וסמנו כל שלב כשהוא הושלם.\n5. אחרי כל שלב שסומן אפשר לשלוח ללקוח/ה עדכון בוואטסאפ בלחיצה על \"שליחת עדכון\".\n6. כשהכול הסתיים לחצו על \"סגירת אירוע\" ואשרו. כך האירוע עובר לרשימת ״הושלמו״.",
        },
        {
          heading: "החלק העליון: פרטי האירוע",
          body: "מציג את שם האירוע (סוג האירוע - שם הלקוח/ה), התאריך, שם החבילה ומספר הטלפון. מתחת מופיעים מיקום האירוע, שעת ההגעה לצילומי משפחה וההערות. לחיצה על המיקום פותחת בחירה בין Waze ל-Google Maps. \"עריכת פרטי האירוע\" מאפשרת לשנות כל פרט, כולל החבילה, שינוי חבילה מעדכן את השלבים, את הפורטל של הלקוח/ה ואת האירוע ביומן. \"סנכרון מחדש ליומן\" שומר את האירוע ביומן אם הסנכרון הראשון נכשל.",
        },
        {
          heading: "סגירת אירוע ושחזור אירוע",
          body: "הכפתור \"סגירת אירוע\" מופיע מתחת לשם החבילה וגם בתחתית הכרטיס. לחיצה עליו פותחת חלון אישור באמצע המסך שמסביר מה יקרה. גם אם עדיין יש שלבים פתוחים, האירוע ייסגר והם יישארו פתוחים כפי שהם. סימון כל השלבים לבדו לא סוגר את האירוע: רק הכפתור והאישור שלכם. אירוע סגור מסומן ב\"✓ האירוע סגור\" ועובר לרשימת ״הושלמו״. כדי להחזיר אותו, היכנסו לכרטיס האירוע ולחצו על \"שחזור אירוע\".",
        },
        {
          heading: "הודעת פתיחה ללקוח/ה",
          body: "כל עוד ההודעה לא נשלחה מופיע כרטיס \"שליחת הודעת פתיחה ללקוח/ה\". לחיצה על הכפתור פותחת את הוואטסאפ שלכם עם הודעה מוכנה, פרטי האירוע, המקדמה והיתרה וקישור לפורטל האישי. אתם בודקים ושולחים בעצמכם.",
        },
        {
          heading: "תשלומים",
          body: "לחיצה אחת על שורת \"מקדמה\" או \"יתרה\" פותחת בחירה: שולם במלואו, שולם חלקית (מזינים כמה שולם) או לא שולם. אפשר להוסיף הערה לכל תשלום, היא נשמרת כשעוברים לשדה אחר. הפורטל של הלקוח/ה מציג את מצב התשלומים בהתאם.",
        },
        {
          heading: "פורטל ללקוח, גלריה וחוזה",
          body: "פורטל ללקוח: קישור אישי שבו הלקוח/ה רואים את סטטוס האירוע והתשלומים בלי להתחבר. אפשר להעתיק אותו או לשלוח בוואטסאפ.\nגלריית תמונות: יצירה או קישור של גלריה לאירוע, וכניסה לניהול הגלריה בלחיצה עליה.\nחוזה הזמנה: יצירת חוזה לחתימה דיגיטלית, תצוגה מקדימה, עריכה והעתקת קישור לחתימה. אחרי שהלקוח/ה חתמו מופיע \"נחתם ✓\" עם שם החותם/ת.",
        },
        {
          heading: "צוות משוייך לאירוע",
          body: "מופיע רק אם הוספתם חברי צוות. לחיצה אחת על שם משייכת אותו לאירוע (\"משוייך ✓\"), ולחיצה נוספת מסירה את השיוך. חבר צוות רואה רק אירועים ששויכו אליו.",
        },
        {
          heading: "מסלול התהליך: איך מסמנים שלבים",
          body: "כל שורה היא שלב. לחיצה אחת על השורה מסמנת אותו כבוצע (✓). לא צריך לחיצה כפולה. אפשר לסמן שלבים בכל סדר; השלב המסומן \"לסמן בוצע\" הוא רק הצעה לשלב הבא. \"מול הלקוח\" הוא שלב שהלקוח/ה רואים בפורטל, \"שלב פנימי\" הוא רק שלכם.\nאחרי שסימנתם שלב מופיעים שני כפתורים: \"שליחת עדכון\", פותח וואטסאפ עם הודעה מוכנה ללקוח/ה, ו\"↺ ביטול סימון\", מחזיר את השלב למצב פתוח.\nשלב \"מסירה סופית\" רק מסומן כבוצע ואינו פותח הודעה, כדי לשלוח ללקוח/ה לחצו על \"שליחת עדכון\" כמו בכל שלב אחר. אחרי סימונו תופיע גם שאלה אם לתזמן בקשת ביקורת.\nבשלב \"אישור עיצוב אלבום\" מעלים קודם קובץ PDF, והלקוח/ה מאשרים דרך הפורטל.",
        },
        {
          heading: "יומן התראות",
          body: "בתחתית הכרטיס מופיע יומן של כל מה שקרה באירוע: שלבים שסומנו, הודעות שנשלחו, שינויי פרטים, סגירה ושחזור, וסנכרון היומן. לקריאה בלבד.",
        },
      ],
    },
    en: {
      title: "Guide: Event card",
      intro:
        "The event card is the control center for one event: its details, payments, contract, gallery, the client's portal, and the work process stage by stage. Every action on the card is a single click — no double-click is needed anywhere.",
      sections: [
        {
          heading: "Steps for working with an event card",
          body: "1. Check the event details at the top (date, package, phone, location and notes), and tap \"עריכת פרטי האירוע\" (Edit event details) if something needs changing.\n2. Send the client the opening message (if not sent yet), and choose whether to create a contract to sign.\n3. Mark payments in the \"Payments\" card as they come in.\n4. Go through the \"Process\" stages one by one and mark each when it's done.\n5. After marking a stage you can send the client a WhatsApp update with \"Send update\".\n6. When everything is finished, tap \"Close event\" and confirm: the event then moves to the completed list.",
        },
        {
          heading: "The top part — event details",
          body: "Shows the event name (event type - client name), the date, the package name and the phone number. Below are the event location, the family-photos arrival time and the notes. Tapping the location offers Waze or Google Maps. \"Edit event details\" lets you change anything, including the package — changing the package updates the stages, the client's portal and the calendar event. \"Re-sync to calendar\" saves the event to your calendar if the first sync failed.",
        },
        {
          heading: "Close event and restore event",
          body: "The \"Close event\" button sits under the package name and again at the bottom of the card. Tapping it opens a confirmation window in the middle of the screen explaining what will happen — even if some stages are still open, the event will be closed and they stay open as they are. Marking every stage does not close the event by itself: only the button and your confirmation do. A closed event shows \"✓ Event closed\" and moves to the completed list. To bring it back, open the event card and tap \"Restore event\".",
        },
        {
          heading: "Opening message to the client",
          body: "Until it is sent, a \"Send opening message to the client\" card is shown. Tapping the button opens your WhatsApp with a ready message — the event details, deposit and balance, and a link to the client's personal portal. You review and send it yourself.",
        },
        {
          heading: "Payments",
          body: "One tap on the \"Deposit\" or \"Balance\" row opens a choice: paid in full, partly paid (enter the amount paid), or unpaid. You can add a note to each payment — it saves when you move to another field. The client's portal shows the payment status accordingly.",
        },
        {
          heading: "Client portal, gallery and contract",
          body: "Client portal: a personal link where the client sees the event status and payments without logging in — copy it or send it via WhatsApp.\nPhoto gallery: create or link a gallery to the event, and tap it to manage the gallery.\nBooking contract: create a contract for digital signing, preview it, edit it and copy the signing link. Once the client has signed, \"Signed ✓\" appears with the signer's name.",
        },
        {
          heading: "Team assigned to the event",
          body: "Only appears if you have added team members. One tap on a name assigns them to the event (\"Assigned ✓\"), another tap removes the assignment. A team member only sees events assigned to them.",
        },
        {
          heading: "The process — how to mark stages",
          body: "Each row is a stage. One tap on the row marks it done (✓) — no double-click needed. You can mark stages in any order; the stage tagged \"Mark done\" is only a suggestion for what's next. \"Client-facing\" stages are visible to the client in the portal; \"Internal stage\" is only for you.\nAfter marking a stage, two buttons appear: \"Send update\" — opens WhatsApp with a ready message to the client, and \"↺ Undo\" — returns the stage to open.\nThe \"Final delivery\" stage only gets marked done and does not open a message — to message the client tap \"Send update\" like on any other stage. After marking it you'll also be asked whether to schedule a review request.\nFor the \"Album design approval\" stage you upload a PDF first, and the client approves through the portal.",
        },
        {
          heading: "Notification log",
          body: "At the bottom of the card is a log of everything that happened on the event: stages marked, messages sent, detail changes, closing and restoring, and calendar sync. Read-only.",
        },
      ],
    },
    ru: {
      title: "Руководство: Карточка события",
      intro:
        "Карточка события — центр управления одним событием: его данные, платежи, договор, галерея, портал клиента и рабочий процесс по этапам. Все действия в карточке выполняются одним нажатием — двойной клик нигде не нужен.",
      sections: [
        {
          heading: "Шаги работы с карточкой события",
          body: "1. Проверьте данные события вверху (дата, пакет, телефон, место и заметки) и при необходимости нажмите «עריכת פרטי האירוע» (Редактировать данные события).\n2. Отправьте клиенту первое сообщение (если ещё не отправлено) и решите, создавать ли договор на подпись.\n3. Отмечайте платежи в карточке «Платежи» по мере поступления.\n4. Проходите этапы в разделе «Процесс» по порядку и отмечайте каждый по завершении.\n5. После отметки этапа можно отправить клиенту сообщение в WhatsApp кнопкой «Отправить обновление».\n6. Когда всё закончено, нажмите «Закрыть событие» и подтвердите, событие перейдёт в список завершённых.",
        },
        {
          heading: "Верхняя часть — данные события",
          body: "Показывает название события (тип события - имя клиента), дату, название пакета и номер телефона. Ниже — место события, время прибытия на семейные фото и заметки. Нажатие на место предлагает Waze или Google Maps. «Редактировать данные события» позволяет изменить всё, включая пакет — смена пакета обновляет этапы, портал клиента и событие в календаре. «Повторная синхронизация с календарём» сохраняет событие в календаре, если первая синхронизация не удалась.",
        },
        {
          heading: "Закрыть событие и восстановить событие",
          body: "Кнопка «Закрыть событие» находится под названием пакета и ещё раз внизу карточки. Нажатие открывает окно подтверждения в центре экрана с объяснением, что произойдёт — даже если ещё есть незавершённые этапы, событие будет закрыто, а они останутся открытыми как есть. Отметка всех этапов сама по себе событие не закрывает: только кнопка и ваше подтверждение. Закрытое событие помечено «✓ Событие закрыто» и переходит в список завершённых. Чтобы вернуть его, откройте карточку события и нажмите «Восстановить событие».",
        },
        {
          heading: "Первое сообщение клиенту",
          body: "Пока сообщение не отправлено, показывается карточка «Отправить первое сообщение клиенту». Нажатие кнопки открывает ваш WhatsApp с готовым сообщением — данные события, задаток и остаток и ссылка на личный портал клиента. Вы проверяете и отправляете его сами.",
        },
        {
          heading: "Платежи",
          body: "Одно нажатие на строку «Задаток» или «Остаток» открывает выбор: оплачено полностью, оплачено частично (вводите сумму) или не оплачено. К каждому платежу можно добавить заметку — она сохраняется при переходе в другое поле. Портал клиента показывает статус платежей соответственно.",
        },
        {
          heading: "Портал клиента, галерея и договор",
          body: "Портал клиента: личная ссылка, по которой клиент видит статус события и платежи без входа в систему — её можно скопировать или отправить в WhatsApp.\nГалерея фотографий: создайте или привяжите галерею к событию, нажмите на неё для управления.\nДоговор: создание договора для цифровой подписи, предпросмотр, редактирование и копирование ссылки на подпись. После подписи клиента появляется «Подписан ✓» с именем подписавшего.",
        },
        {
          heading: "Команда, назначенная на событие",
          body: "Появляется только если вы добавили сотрудников. Одно нажатие на имя назначает его на событие («Назначен ✓»), повторное нажатие снимает назначение. Сотрудник видит только назначенные ему события.",
        },
        {
          heading: "Процесс — как отмечать этапы",
          body: "Каждая строка — этап. Одно нажатие на строку отмечает его выполненным (✓) — двойной клик не нужен. Этапы можно отмечать в любом порядке; метка «Отметить выполненным» — лишь подсказка, что делать дальше. «С клиентом» — этап, который клиент видит в портале, «Внутренний этап» — только для вас.\nПосле отметки этапа появляются две кнопки: «Отправить обновление» — открывает WhatsApp с готовым сообщением клиенту, и «↺ Отменить отметку» — возвращает этап в открытое состояние.\nЭтап «Финальная передача» только отмечается выполненным и не открывает сообщение — чтобы написать клиенту, нажмите «Отправить обновление», как на любом другом этапе. После отметки также появится вопрос, назначить ли запрос отзыва.\nДля этапа «Утверждение дизайна альбома» сначала загружается PDF, а клиент утверждает его через портал.",
        },
        {
          heading: "Журнал уведомлений",
          body: "Внизу карточки — журнал всего, что происходило по событию: отмеченные этапы, отправленные сообщения, изменения данных, закрытие и восстановление, синхронизация с календарём. Только для чтения.",
        },
      ],
    },
  },
};
