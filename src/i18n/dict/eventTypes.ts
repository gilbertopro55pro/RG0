import type { AreaDict } from "@/i18n/types";

// Area "eventTypes" (see src/i18n/dict/index.ts): the preset event types (PRESET_EVENT_TYPES in
// components/EventTypeField.tsx). Its own small area because lib/quoteDefaults.ts translates them
// in the browser too (the quote caption), and importing the merged dictionary there shipped every
// area's text to the event and leads pages. Hebrew source text → translation.
const dict: AreaDict = {
  en: {
    "חתונה": "Wedding",
    "חינה": "Henna",
    "בת מצווה": "Bat Mitzvah",
    "בר מצווה": "Bar Mitzvah",
    "עלייה לתורה": "Aliyah to the Torah",
    "הכנסת ספר תורה": "Torah scroll dedication",
    "ברית": "Brit",
    "בריתה": "Brita",
    "מגנטים": "Magnets",
    "בוק בר מצווה": "Bar mitzvah photo book",
    "בוק בת מצווה": "Bat mitzvah photo book",
  },
  ru: {
    "חתונה": "Свадьба",
    "חינה": "Хина",
    "בת מצווה": "Бат-мицва",
    "בר מצווה": "Бар-мицва",
    "עלייה לתורה": "Алия к Торе",
    "הכנסת ספר תורה": "Внесение свитка Торы",
    "ברית": "Брит-мила",
    "בריתה": "Брита",
    "מגנטים": "Магниты",
    "בוק בר מצווה": "Фотокнига бар-мицвы",
    "בוק בת מצווה": "Фотокнига бат-мицвы",
  },
};

export default dict;
