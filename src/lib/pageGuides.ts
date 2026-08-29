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

export type PageGuideKey = "galleries" | "client-portals" | "leads" | "waitlist" | "analytics";

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
          body: "אפשר ליצור גלריה עצמאית מכאן, או ישירות מתוך כרטיס אירוע קיים. בזמן היצירה בוחרים כמה זמן הגלריה תישאר פתוחה (חודש, 3 חודשים, או ללא הגבלת זמן) וכן אם מותר ללקוח להוריד את התמונות.",
          image: "/guides/galleries-1.png",
        },
        {
          heading: "העלאת תמונות",
          body: "מעלים תמונות בגרירה או בבחירה מהמכשיר — כולל תמיכה בקבצי HEIC מאייפון, שממירים אוטומטית. אפשר לארגן את התמונות בתיקיות, לקבוע תמונת שער לגלריה, ולסמן מועדפות.",
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
          body: "לגלריות שכוללות אלבום מודפס יש כלי עיצוב מובנה — גוררים תמונות לפריסת עמודים, ומייצאים כקובץ להדפסה או לאישור הלקוח.",
        },
        {
          heading: "ניהול תוקף אוטומטי",
          body: "המערכת שולחת תזכורת ללקוח לקראת סיום תוקף הגלריה, ומעדכנת את הסטטוס בהתאם — כדי שאף אחד לא יופתע שהקישור הפסיק לעבוד.",
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
          body: "Create a standalone gallery here, or straight from an existing event card. When creating it, choose how long it stays open (one month, three months, or unlimited) and whether the client is allowed to download the photos.",
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
          body: "Создайте отдельную галерею здесь или прямо из карточки существующего мероприятия. При создании выберите, как долго галерея будет открыта (месяц, 3 месяца или без ограничения), и разрешено ли клиенту скачивать фотографии.",
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
        "לכל אירוע יש עמוד אישי ללקוח — \"פורטל\" — שבו הוא יכול לעקוב אחרי התקדמות האירוע, לראות תשלומים, לחתום על חוזה ולצפות בגלריה, הכל בלי להתחבר למערכת.",
      sections: [
        {
          heading: "מה זה בעצם הפורטל",
          body: "קישור ייחודי לכל אירוע, שנוצר אוטומטית ברגע שהאירוע נסגר במערכת. הלקוח פותח אותו בכל דפדפן, בלי סיסמה ובלי הרשמה.",
          image: "/guides/client-portals-1.png",
        },
        {
          heading: "מעקב אחרי התקדמות האירוע",
          body: "הלקוח רואה את מסלול השלבים של האירוע — מיום הצילום ועד המסירה הסופית — ויודע בדיוק באיזה שלב הצלם נמצא כרגע.",
        },
        {
          heading: "תשלומים",
          body: "מוצגים סכומי המקדמה והיתרה, אילו כבר שולמו ואילו עדיין ממתינים, כולל תאריך היעד לתשלום.",
        },
        {
          heading: "חוזה דיגיטלי",
          body: "אם הועלה חוזה לאירוע, הלקוח יכול לקרוא אותו ולחתום ישירות בפורטל — בלי להדפיס או לסרוק כלום.",
        },
        {
          heading: "גלריה ואישור אלבום",
          body: "ברגע שהגלריה מתפרסמת, קישור אליה מופיע אוטומטית בפורטל. גם אישור עיצוב האלבום, כשרלוונטי, מתבצע דרך אותו עמוד.",
        },
        {
          heading: "שליחה קלה ללקוח",
          body: "כפתור \"העתקת קישור\" אחד ליד כל אירוע ברשימה — מעתיקים ושולחים בכל ערוץ שנוח (וואטסאפ, מייל, סמס).",
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
        "כל פנייה חדשה של לקוח פוטנציאלי מתחילה כאן, כ\"ליד\". מכאן עוקבים אחרי הפנייה עד שהיא הופכת לאירוע סגור — או נסגרת בלי המשך.",
      sections: [
        {
          heading: "הוספת ליד חדש",
          body: "מוסיפים שם, טלפון, תאריך ואירוע מבוקשים, וחבילה בערך. אפשר להוסיף כל פנייה שמגיעה — טלפון, וואטסאפ, אתר או כל ערוץ אחר.",
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
          body: "כשהלקוח מאשר — לחיצה אחת הופכת את הליד לאירוע מלא במערכת, עם כל הפרטים שכבר הוזנו, בלי להקליד שוב.",
        },
        {
          heading: "מעקב אוטומטי אחרי לידים",
          body: "לליד שלא ענה, המערכת שולחת הודעות מעקב אוטומטיות בפרקי זמן קבועים — כדי שאף פנייה לא תישכח.",
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
        "כשלקוח מבקש תאריך שכבר תפוס באירוע אחר, המערכת מציעה להוסיף אותו לרשימת המתנה במקום לדחות אותו. ברגע שהתאריך מתפנה — הופכים אותו לאירוע בלחיצה.",
      sections: [
        {
          heading: "איך רשומה מגיעה לרשימה",
          body: "בזמן יצירת אירוע או ליד בתאריך שכבר תפוס, המערכת מזהה את ההתנגשות ומציעה להוסיף את הפנייה לרשימת המתנה במקום לדחות אותה.",
          image: "/guides/waitlist-1.png",
        },
        {
          heading: "התאריך התפנה",
          body: "כפתור \"התאריך התפנה — יצירת אירוע\" הופך את הרשומה לאירוע חדש בלחיצה אחת, עם כל הפרטים שכבר הוזנו מראש.",
        },
        {
          heading: "אישור בדרך אחרת",
          body: "אם הלקוח הסתדר בעצמו — למשל שכר צלם אחר או צוות נוסף — אפשר לסמן זאת ולתעד איך הפנייה נסגרה, בלי למחוק את ההיסטוריה.",
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
        "עמוד הדשבורד נותן תמונה עסקית מלאה — כמה הרווחת בכל חודש, אילו תשלומים עדיין ממתינים, ואיזה סוגי חבילות הכי מבוקשים.",
      sections: [
        {
          heading: "הכנסות חודשיות",
          body: "גרף שמראה כמה שולם בפועל (מקדמות ויתרות) בכל חודש, עם אפשרות לדפדף בין חודשים ושנים שונות ולראות פירוט של כל תשלום.",
          image: "/guides/analytics-1.png",
        },
        {
          heading: "תשלומים ממתינים",
          body: "רשימה של כל הסכומים שעדיין לא שולמו, כולל שם הלקוח ותאריך היעד לתשלום — כדי לדעת למי להזכיר ומתי.",
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
          body: "אפשר לשלוח את סיכום החודש ישירות למייל — לרואה החשבון, לשותף, או לכל כתובת שנוחה.",
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
};
