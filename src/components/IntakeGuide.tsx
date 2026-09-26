"use client";

import { useEffect, useState } from "react";

type Lang = "he" | "en" | "ru";
type Section = { title: string; intro?: string; items: string[]; ordered?: boolean };
type Guide = { heading: string; blurb: string; sections: Section[] };

const LANGS: { id: Lang; label: string }[] = [
  { id: "he", label: "עברית" },
  { id: "en", label: "English" },
  { id: "ru", label: "Русский" },
];

// Settings › אוטומציה: the user guide for the intake assistant and for the sponsored campaign that
// sends clients straight to it (owner's request, 2026-09-26). Three languages; the app's own labels
// stay in Hebrew, so the English and Russian texts quote them.
const GUIDE: Record<Lang, Guide> = {
  he: {
    heading: "מדריך: איך העוזר עובד וקמפיין ממומן",
    blurb: "כל מה שצריך כדי שלקוחות יגיעו לעוזר ויהפכו ללידים.",
    sections: [
      {
        title: "איך העוזר עובד",
        items: [
          "לקוח נכנס לקישור שלך (ממודעה, אינסטגרם, וואטסאפ או קוד QR) ומקבל תשובה מיד, בכל שעה.",
          "העוזר שואל על האירוע ובודק שהתאריך פנוי: גם מול האירועים במערכת וגם מול יומן Google, לפי הצבע שבחרת בהגדרות › פרופיל.",
          "הוא אוסף את פרטי החובה: סוג האירוע, תאריך, מקום, מספר אורחים, שם וטלפון.",
          "ברגע שיש טלפון נפתח ליד בעמוד הלידים, עם התג \"מהעוזר\" ועם המקור שממנו הלקוח הגיע. כשכל הפרטים נאספו, מגיע אליך מייל.",
          "תאריך תפוס: העוזר מציע רשימת המתנה. בשישי בערב ובשבת (אם סימנת \"לא מצלם בשבת\") הוא מבקש תאריך אחר.",
          "על מחירים הוא לא מדבר לעולם. ההצעה תמיד ממך, בזמן שהגדרת.",
          "כל לקוח מקבל שיחה פרטית משלו, וכל כניסה חדשה לקישור פותחת שיחה חדשה. לקוח שחוזר עם אותו טלפון מעדכן את הליד הקיים ולא פותח ליד כפול.",
          "אם שואלים אותו אם הוא בוט, הוא עונה בכנות שהוא העוזר שלך.",
        ],
      },
      {
        title: "מה להגדיר לפני שמתחילים",
        ordered: true,
        items: [
          "להדליק את המתג \"עוזר פניות\" בראש העמוד.",
          "לבחור תוך כמה זמן אתה חוזר עם הצעה. זה מה שהעוזר מבטיח ללקוח.",
          "למלא שאלות נפוצות (ראו הסעיף הבא) ושאלה נוספת אם יש.",
          "לכתוב כותרת לדף הצ'אט, למשל \"השם שלך - צילום אירועים\".",
          "לסמן \"אירוע בוקר ואירוע ערב באותו יום\" ו\"לא מצלם בשבת\" לפי מה שמתאים לך.",
          "לוודא שיומן Google מחובר (הגדרות › פרופיל) ושאירועים סגורים ביומן בצבע שבחרת.",
          "לנסות את הקישור בעצמך (הכפתור \"לנסות\") לפני שמפרסמים.",
        ],
      },
      {
        title: "למה השאלות הנפוצות חשובות",
        items: [
          "העוזר עונה על שאלות כלליות רק מתוך מה שכתוב כאן. כשאין תשובה, הוא אומר \"את זה [השם שלך] יענה\", והלקוח נשאר עם סימן שאלה ולפעמים עוזב.",
          "כל שאלה שנענית מיד מקרבת את הלקוח להשאיר פרטים. זה ההבדל בין צ'אט שממיר לבין צ'אט שמאבד לקוחות.",
          "מה כדאי לכתוב: מתי מקבלים את התמונות והווידאו, מה כולל הצילום, כמה שעות, איפה רואים עבודות, איך שומרים תאריך, מה קורה בדחייה או ביטול.",
          "איך לכתוב: משפט או שניים, עובדות ברורות (\"עד 7 ימי עסקים\" עדיף על \"די מהר\"). בלי מחירים וסכומים.",
          "העוזר אומר ללקוח בדיוק את מה שכתוב, אז כדאי לוודא שכל תשובה נכונה ומעודכנת.",
        ],
      },
      {
        title: "קמפיין ממומן בפייסבוק ובאינסטגרם",
        intro: "המטרה: לחיצה על המודעה פותחת ישר את הצ'אט עם העוזר, בלי לעבור דרך וואטסאפ או מסנג'ר.",
        ordered: true,
        items: [
          "במנהל המודעות של מטא: יצירה ← מטרה \"תנועה\" (Traffic).",
          "בקבוצת המודעות: מיקום ההמרה \"אתר\", ואופטימיזציה \"צפיות בדף נחיתה\" (לא \"קליקים על קישור\").",
          "קהל ותקציב: אזור השירות שלך וגילאי הקהל. תקציב יומי קטן, ולתת לקמפיין 5 עד 7 ימים בלי לשנות.",
          "במודעה, בשדה \"אתר\": הקישור \"מודעה\" מתוך \"קישורים לפי מקור\" למטה (מסתיים ב-?src=ad). כך הלידים יסומנו \"מקור: מודעה\".",
          "קריאה לפעולה: \"קבלת הצעת מחיר\" או \"מידע נוסף\". לא \"שליחת הודעה\": היא פותחת מסנג'ר ולא את העוזר.",
          "בתצוגה המקדימה צריך להופיע שם האתר ולא המילה MESSENGER. אם מופיע MESSENGER, היעד שגוי.",
          "טקסט: שאלה שמדברת אל הלקוח (\"עלייה לתורה בקרוב?\") ואחריה \"בדקו עכשיו אם התאריך פנוי, תשובה תוך שניות\". כותרת: \"התאריך שלכם פנוי? בדיקה מיידית\".",
          "תמונה ממוזערת לסרטון: פריים עם פנים ורגע מרגש, לא נוף או קיר.",
          "אחרי הפרסום: ללחוץ בעצמך על המודעה ולוודא שנפתח הצ'אט.",
          "אחרי 10 עד 20 לידים, עם פיקסל מחובר: לעבור לקמפיין \"לידים\" ← מיקום המרה \"אתר\" ← אירוע Lead. מטא תלמד להביא אנשים שמשאירים פרטים, לא רק לוחצים.",
        ],
      },
      {
        title: "וואטסאפ העסקי ומקורות",
        items: [
          "את \"הודעת הפתיחה לוואטסאפ העסקי\" מעתיקים ומדביקים ב-WhatsApp Business: הגדרות › כלים לעסקים › הודעת פתיחה. כל לקוח חדש מקבל מיד קישור לעוזר.",
          "לכל ערוץ יש קישור משלו (מודעה, אינסטגרם, פייסבוק, QR). בעמוד הלידים רואים ליד כל פנייה מאיפה הגיעה, וסיכום של 30 הימים האחרונים.",
          "ביו באינסטגרם: הקישור \"אינסטגרם\". סטורי: מדבקת קישור, ולשמור ב-Highlight קבוע.",
        ],
      },
      {
        title: "פיקסל של מטא (לא חובה, מומלץ לקמפיינים)",
        ordered: true,
        items: [
          "מנהל האירועים של מטא (Events Manager) ← \"+\" (חיבור נתונים) ← \"אינטרנט\" (Web).",
          "לתת שם, ולדלג על הצעות ההתקנה. הקוד כבר מותקן במערכת.",
          "לבחור מקור מסוג אינטרנט, לא אפליקציה, ולהעתיק את המזהה (Dataset ID).",
          "להדביק אותו בחלק \"חיבור למטא\" למטה ולשמור. מאותו רגע כל ליד שהעוזר יוצר מדווח למטא.",
        ],
      },
    ],
  },
  en: {
    heading: "Guide: how the assistant works, and a sponsored campaign",
    blurb: "Everything you need so clients reach the assistant and become leads.",
    sections: [
      {
        title: "How the assistant works",
        items: [
          "A client opens your link (from an ad, Instagram, WhatsApp or a QR code) and gets an answer right away, at any hour.",
          "The assistant asks about the event and checks that the date is free: against your events in the system and against your Google Calendar, by the color you chose in Settings › Profile (\"פרופיל\").",
          "It collects the required details: event type, date, location, number of guests, name and phone.",
          "As soon as there is a phone number, a lead opens on the Leads page, tagged \"מהעוזר\" (from the assistant) with the source the client came from. Once everything is collected, you get an email.",
          "Taken date: the assistant offers the waitlist. On Friday evening and Saturday (if you ticked \"לא מצלם בשבת\") it asks for another date.",
          "It never talks about prices. The quote always comes from you, within the time you set.",
          "Every client gets a private conversation, and every new visit to the link starts a new one. A returning client with the same phone updates the existing lead instead of opening a duplicate.",
          "If asked whether it's a bot, it answers honestly that it's your assistant.",
        ],
      },
      {
        title: "What to set up before you start",
        ordered: true,
        items: [
          "Turn on the \"עוזר פניות\" (intake assistant) switch at the top of the page.",
          "Choose how soon you get back with a quote. This is what the assistant promises the client.",
          "Fill in the frequently asked questions (see next section) and an extra question if you have one.",
          "Write a heading for the chat page, e.g. \"Your name - Event Photography\".",
          "Tick \"אירוע בוקר ואירוע ערב באותו יום\" (morning and evening on the same day) and \"לא מצלם בשבת\" (no Shabbat) as fits you.",
          "Make sure Google Calendar is connected (Settings › Profile) and that booked events in the calendar use the color you chose.",
          "Try the link yourself (the \"לנסות\" button) before you publish.",
        ],
      },
      {
        title: "Why the frequently asked questions matter",
        items: [
          "The assistant answers general questions only from what is written here. Without an answer it says \"[your name] will answer that\", and the client is left wondering, sometimes leaving.",
          "Every question answered on the spot brings the client closer to leaving details. That is the difference between a chat that converts and one that loses clients.",
          "What to write: when photos and video arrive, what the package includes, how many hours, where to see your work, how to reserve a date, what happens if the event is postponed or cancelled.",
          "How to write: one or two sentences, clear facts (\"within 7 business days\" beats \"pretty quickly\"). No prices or amounts.",
          "The assistant tells clients exactly what is written, so make sure every answer is correct and up to date.",
        ],
      },
      {
        title: "A sponsored campaign on Facebook and Instagram",
        intro: "The goal: tapping the ad opens the chat with the assistant directly, without going through WhatsApp or Messenger.",
        ordered: true,
        items: [
          "In Meta Ads Manager: Create › objective \"Traffic\".",
          "In the ad set: conversion location \"Website\", optimization \"Landing page views\" (not \"Link clicks\").",
          "Audience and budget: your service area and the audience's ages. A small daily budget, and give the campaign 5 to 7 days without changes.",
          "In the ad, the \"Website\" field: the \"מודעה\" (ad) link from \"קישורים לפי מקור\" (links by source) below, ending in ?src=ad. Leads will then be tagged as coming from the ad.",
          "Call to action: \"Get quote\" or \"Learn more\". Not \"Send message\": it opens Messenger, not the assistant.",
          "The preview should show your website name, not the word MESSENGER. If it says MESSENGER, the destination is wrong.",
          "Text: a question that speaks to the client (\"Bar mitzvah coming up?\") followed by \"Check now if your date is free, an answer in seconds\". Headline: \"Is your date free? Instant check\".",
          "Video thumbnail: a frame with faces and an emotional moment, not scenery or a wall.",
          "After publishing: tap the ad yourself and make sure the chat opens.",
          "After 10 to 20 leads, with the pixel connected: switch to a \"Leads\" campaign › conversion location \"Website\" › the Lead event. Meta will learn to bring people who leave details, not just clickers.",
        ],
      },
      {
        title: "WhatsApp Business and sources",
        items: [
          "Copy the \"הודעת פתיחה לוואטסאפ העסקי\" (WhatsApp greeting) and paste it in WhatsApp Business: Settings › Business tools › Greeting message. Every new client instantly gets a link to the assistant.",
          "Each channel has its own link (ad, Instagram, Facebook, QR). On the Leads page you see where each inquiry came from, plus a 30-day summary.",
          "Instagram bio: the \"אינסטגרם\" link. Stories: a link sticker, saved to a permanent Highlight.",
        ],
      },
      {
        title: "Meta pixel (optional, recommended for campaigns)",
        ordered: true,
        items: [
          "Meta Events Manager › \"+\" (Connect data) › \"Web\".",
          "Give it a name and skip the installation offers. The code is already installed in the system.",
          "Pick a source of type Web, not an app, and copy its Dataset ID.",
          "Paste it in the \"חיבור למטא\" (Meta connection) section below and save. From then on every lead the assistant creates is reported to Meta.",
        ],
      },
    ],
  },
  ru: {
    heading: "Руководство: как работает ассистент и рекламная кампания",
    blurb: "Всё, что нужно, чтобы клиенты попадали к ассистенту и становились лидами.",
    sections: [
      {
        title: "Как работает ассистент",
        items: [
          "Клиент открывает вашу ссылку (из рекламы, Instagram, WhatsApp или QR-кода) и сразу получает ответ, в любое время суток.",
          "Ассистент спрашивает о мероприятии и проверяет, свободна ли дата: по событиям в системе и по Google Календарю, по цвету, выбранному в Настройки › Профиль (\"פרופיל\").",
          "Он собирает обязательные данные: тип мероприятия, дату, место, количество гостей, имя и телефон.",
          "Как только есть номер телефона, на странице лидов появляется лид с пометкой \"מהעוזר\" (от ассистента) и источником, откуда пришёл клиент. Когда все данные собраны, вам приходит письмо.",
          "Дата занята: ассистент предлагает лист ожидания. В пятницу вечером и в субботу (если отмечено \"לא מצלם בשבת\") он просит выбрать другую дату.",
          "О ценах он не говорит никогда. Предложение всегда от вас, в срок, который вы указали.",
          "Каждый клиент получает отдельный чат, и каждый новый вход по ссылке начинает новый разговор. Повторное обращение с тем же телефоном обновляет существующий лид, а не создаёт дубликат.",
          "Если спросить, бот ли это, он честно отвечает, что это ваш ассистент.",
        ],
      },
      {
        title: "Что настроить перед стартом",
        ordered: true,
        items: [
          "Включить переключатель \"עוזר פניות\" (ассистент) вверху страницы.",
          "Выбрать, как быстро вы присылаете предложение. Именно это ассистент обещает клиенту.",
          "Заполнить частые вопросы (см. следующий раздел) и дополнительный вопрос, если он есть.",
          "Написать заголовок страницы чата, например \"Ваше имя - фотосъёмка мероприятий\".",
          "Отметить \"אירוע בוקר ואירוע ערב באותו יום\" (утро и вечер в один день) и \"לא מצלם בשבת\" (не снимаю в шаббат), если вам подходит.",
          "Убедиться, что Google Календарь подключён (Настройки › Профиль) и что забронированные события в календаре отмечены выбранным цветом.",
          "Проверить ссылку самому (кнопка \"לנסות\") до публикации.",
        ],
      },
      {
        title: "Почему частые вопросы так важны",
        items: [
          "Ассистент отвечает на общие вопросы только по тому, что здесь написано. Если ответа нет, он говорит \"на это ответит [ваше имя]\", и клиент остаётся с вопросом, а иногда уходит.",
          "Каждый вопрос, получивший ответ сразу, приближает клиента к тому, чтобы оставить данные. В этом разница между чатом, который приводит клиентов, и чатом, который их теряет.",
          "Что написать: когда клиент получит фото и видео, что входит в съёмку, сколько часов, где посмотреть работы, как забронировать дату, что при переносе или отмене.",
          "Как писать: одно-два предложения, чёткие факты (\"до 7 рабочих дней\" лучше, чем \"довольно быстро\"). Без цен и сумм.",
          "Ассистент говорит клиенту ровно то, что написано, поэтому проверьте, что каждый ответ верный и актуальный.",
        ],
      },
      {
        title: "Рекламная кампания в Facebook и Instagram",
        intro: "Цель: нажатие на рекламу сразу открывает чат с ассистентом, без WhatsApp и Messenger.",
        ordered: true,
        items: [
          "В Ads Manager: Создать › цель \"Трафик\" (Traffic).",
          "В группе объявлений: место конверсии \"Сайт\", оптимизация \"Просмотры целевой страницы\" (не \"Клики по ссылке\").",
          "Аудитория и бюджет: ваш регион работы и возраст аудитории. Небольшой дневной бюджет, и 5–7 дней ничего не менять.",
          "В объявлении, в поле \"Сайт\": ссылка \"מודעה\" (реклама) из раздела \"קישורים לפי מקור\" (ссылки по источнику) ниже, с окончанием ?src=ad. Тогда лиды будут помечены как пришедшие из рекламы.",
          "Призыв к действию: \"Получить предложение\" или \"Подробнее\". Не \"Отправить сообщение\": оно открывает Messenger, а не ассистента.",
          "В предпросмотре должно быть название сайта, а не слово MESSENGER. Если написано MESSENGER, цель выбрана неверно.",
          "Текст: вопрос, обращённый к клиенту (\"Скоро бар-мицва?\"), и затем \"Проверьте сейчас, свободна ли дата, ответ за секунды\". Заголовок: \"Ваша дата свободна? Мгновенная проверка\".",
          "Обложка видео: кадр с лицами и трогательным моментом, а не пейзаж или стена.",
          "После публикации: нажмите на рекламу сами и убедитесь, что открывается чат.",
          "После 10–20 лидов, с подключённым пикселем: перейдите на кампанию \"Лиды\" › место конверсии \"Сайт\" › событие Lead. Meta научится приводить тех, кто оставляет данные, а не просто нажимает.",
        ],
      },
      {
        title: "WhatsApp Business и источники",
        items: [
          "Скопируйте \"הודעת פתיחה לוואטסאפ העסקי\" (приветствие для WhatsApp) и вставьте в WhatsApp Business: Настройки › Инструменты для бизнеса › Приветственное сообщение. Каждый новый клиент сразу получит ссылку на ассистента.",
          "У каждого канала своя ссылка (реклама, Instagram, Facebook, QR). На странице лидов видно, откуда пришло каждое обращение, и сводка за 30 дней.",
          "Био в Instagram: ссылка \"אינסטגרם\". Сторис: стикер со ссылкой, сохранённый в постоянный Highlight.",
        ],
      },
      {
        title: "Пиксель Meta (необязательно, рекомендуется для рекламы)",
        ordered: true,
        items: [
          "Events Manager › \"+\" (подключить данные) › \"Веб\" (Web).",
          "Дайте название и пропустите предложения по установке. Код уже установлен в системе.",
          "Выберите источник типа Web, а не приложение, и скопируйте его Dataset ID.",
          "Вставьте его в разделе \"חיבור למטא\" (подключение Meta) ниже и сохраните. С этого момента каждый лид от ассистента передаётся в Meta.",
        ],
      },
    ],
  },
};

const STORAGE_KEY = "intake-guide-lang";

export default function IntakeGuide() {
  const [lang, setLang] = useState<Lang>("he");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {}
    if (saved === "en" || saved === "ru") {
      const t = setTimeout(() => setLang(saved as Lang), 0);
      return () => clearTimeout(t);
    }
  }, []);

  const choose = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {}
  };

  const g = GUIDE[lang];
  const dir = lang === "he" ? "rtl" : "ltr";

  return (
    <details className="rounded-2xl bg-card border border-line mb-5 group">
      <summary className="p-4 cursor-pointer list-none flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="text-sm font-semibold block">{GUIDE.he.heading}</span>
          <span className="text-xs text-ink-soft block">Guide / Руководство</span>
        </span>
        <span className="text-ink-soft text-lg shrink-0 transition-transform group-open:rotate-180" aria-hidden>
          ⌄
        </span>
      </summary>
      <div className="px-4 pb-4 border-t border-line pt-3">
        <div className="flex gap-1.5 mb-3" role="tablist" aria-label="שפה / Language / Язык">
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={lang === l.id}
              onClick={() => choose(l.id)}
              className={`text-xs font-semibold rounded-full px-3 py-1.5 border ${lang === l.id ? "bg-ink text-white border-ink" : "border-line"}`}
              style={lang === l.id ? undefined : { background: "var(--color-input-bg)" }}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div dir={dir} lang={lang} className="text-start">
          <p className="text-sm font-semibold">{g.heading}</p>
          <p className="text-xs text-ink-soft mb-3">{g.blurb}</p>
          <div className="grid gap-2">
            {g.sections.map((s) => (
              <details key={s.title} className="rounded-xl border border-line" style={{ background: "var(--color-input-bg)" }}>
                <summary className="px-3 py-2.5 text-sm font-semibold cursor-pointer">{s.title}</summary>
                <div className="px-3 pb-3 text-[13px] leading-relaxed">
                  {s.intro && <p className="mb-2 text-ink-soft">{s.intro}</p>}
                  {s.ordered ? (
                    <ol className="list-decimal ps-5 space-y-1.5">
                      {s.items.map((it) => (
                        <li key={it}>{it}</li>
                      ))}
                    </ol>
                  ) : (
                    <ul className="list-disc ps-5 space-y-1.5">
                      {s.items.map((it) => (
                        <li key={it}>{it}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
