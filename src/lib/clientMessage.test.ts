import { describe, expect, it } from "vitest";
import { buildClientMessageText, buildStageNoticeText, clientTemplateKey, isLangTemplateKey } from "@/lib/clientMessage";
import { STAGE_NOTIFY_CLIENT, STAGE_NOTIFY_CLIENT_I18N } from "@/lib/stages";

const URL_ = "https://myframeflow.com/s/p1za9SwBtHTS";

type Params = Parameters<typeof buildClientMessageText>[0];
const params = (over: Partial<Params> = {}): Params => ({
  stageKey: "event_closing",
  stageLabel: "סגירת האירוע",
  savedTemplate: undefined,
  clientName: "דנה",
  eventDateIso: "2026-12-03",
  eventLocation: "אולמי הגן",
  packageLabelText: "חבילה מלאה",
  eventStartTime: "19:00:00",
  eventEndTime: "23:30:00",
  arrivalTime: "18:30:00",
  depositAmount: 2000,
  balanceAmount: 12500,
  linkUrl: URL_,
  whatsappSignature: null,
  senderName: null,
  ...over,
});

const count = (s: string, sub: string) => s.split(sub).length - 1;

describe("buildClientMessageText: the booking confirmation (event_closing)", () => {
  it("fills the built-in template: the name, and the portal link after 'קישור:'", () => {
    const text = buildClientMessageText(params());
    expect(text.startsWith("שלום דנה,\nהאירוע שלכם רשמית סגור אצלנו ביומן")).toBe(true);
    expect(text).toContain(`\nקישור: ${URL_}`);
    expect(count(text, "קישור:")).toBe(1);
    expect(count(text, "דנה")).toBe(1);
  });

  it("opens with the client's name when the saved template has no {{שם}}", () => {
    expect(buildClientMessageText(params({ savedTemplate: "האירוע סגור!\nקישור: " }))).toBe(`דנה,\nהאירוע סגור!\nקישור: ${URL_} `);
  });

  it("adds the link line when the saved template has none", () => {
    expect(buildClientMessageText(params({ savedTemplate: "היי {{שם}}, האירוע סגור!" }))).toBe(`היי דנה, האירוע סגור!\nקישור: ${URL_}`);
  });

  it("adds both when the saved template has neither, without blank lines before the link", () => {
    expect(buildClientMessageText(params({ savedTemplate: "האירוע סגור!\n\n  " }))).toBe(`דנה,\nהאירוע סגור!\nקישור: ${URL_}`);
  });

  it("adds nothing to a template that has both", () => {
    expect(buildClientMessageText(params({ savedTemplate: "{{שם}}, נתראה!\nקישור:" }))).toBe(`דנה, נתראה!\nקישור: ${URL_}`);
  });

  it("doesn't add the name or the link for any other stage", () => {
    expect(buildClientMessageText(params({ stageKey: "gallery_upload", stageLabel: "העלאת גלריה", savedTemplate: "הגלריה מוכנה" }))).toBe("הגלריה מוכנה");
    expect(buildClientMessageText(params({ stageKey: "custom-1", stageLabel: "פגישה", savedTemplate: "עדכון" }))).toBe("עדכון");
  });
});

describe("buildClientMessageText: the signature", () => {
  const tpl = { stageKey: "gallery_upload", savedTemplate: "הגלריה מוכנה" };

  it("signs with the WhatsApp signature, trimmed, as its own paragraph", () => {
    expect(buildClientMessageText(params({ ...tpl, whatsappSignature: "  סטודיו אור\n050-0000000  ", senderName: "אור כהן" }))).toBe(
      "הגלריה מוכנה\n\nסטודיו אור\n050-0000000",
    );
  });

  it("signs with the user's name when there's no signature, never both", () => {
    expect(buildClientMessageText(params({ ...tpl, whatsappSignature: null, senderName: " אור כהן " }))).toBe("הגלריה מוכנה\n\nאור כהן");
    expect(buildClientMessageText(params({ ...tpl, whatsappSignature: "   ", senderName: "אור כהן" }))).toBe("הגלריה מוכנה\n\nאור כהן");
  });

  it("adds nothing when there's neither", () => {
    expect(buildClientMessageText(params({ ...tpl, whatsappSignature: "", senderName: "  " }))).toBe("הגלריה מוכנה");
    expect(buildClientMessageText(params({ ...tpl, whatsappSignature: null, senderName: undefined }))).toBe("הגלריה מוכנה");
  });

  it("signs after the link line added to the booking confirmation", () => {
    expect(buildClientMessageText(params({ savedTemplate: "האירוע סגור!", whatsappSignature: "סטודיו אור" }))).toBe(
      `דנה,\nהאירוע סגור!\nקישור: ${URL_}\n\nסטודיו אור`,
    );
  });
});

describe("buildClientMessageText: tokens", () => {
  const all = "{{שם}}|{{שלב}}|{{תאריך}}|{{מיקום}}|{{חבילה}}|{{שעות}}|{{צילומי_משפחה}}|{{שעת_הגעה}}|{{מקדמה}}|{{יתרה}}";
  const stage = { stageKey: "album_design", stageLabel: "עיצוב אלבום" };

  it("fills every token from the event", () => {
    expect(buildClientMessageText(params({ ...stage, savedTemplate: all }))).toBe(
      "דנה|עיצוב אלבום|3.12.2026|אולמי הגן|חבילה מלאה|19:00–23:30|18:30|18:30|₪2,000|₪12,500",
    );
  });

  it("leaves a token empty when the event has no value for it", () => {
    expect(
      buildClientMessageText(
        params({ ...stage, savedTemplate: all, eventLocation: null, eventStartTime: null, eventEndTime: null, arrivalTime: null, depositAmount: null, balanceAmount: null }),
      ),
    ).toBe("דנה|עיצוב אלבום|3.12.2026||חבילה מלאה|||||");
  });

  it("shows only the hour that's known, and a zero amount as ₪0", () => {
    expect(buildClientMessageText(params({ ...stage, savedTemplate: "{{שעות}}", eventEndTime: null }))).toBe("19:00");
    expect(buildClientMessageText(params({ ...stage, savedTemplate: "{{שעות}}", eventStartTime: null }))).toBe("23:30");
    expect(buildClientMessageText(params({ ...stage, savedTemplate: "{{מקדמה}}", depositAmount: 0 }))).toBe("₪0");
  });

  it("replaces every occurrence, and the link after every marker", () => {
    expect(buildClientMessageText(params({ ...stage, savedTemplate: "{{שם}} {{שם}}\nקישור:\nשוב קישור:" }))).toBe(
      `דנה דנה\nקישור: ${URL_}\nשוב קישור: ${URL_}`,
    );
  });

  it("keeps the photographer's own wording of the stage in Hebrew", () => {
    expect(buildClientMessageText(params({ stageKey: "album_design", stageLabel: "עיצוב האלבום שלכם", savedTemplate: "{{שלב}}" }))).toBe("עיצוב האלבום שלכם");
  });
});

describe("buildClientMessageText: English and Russian clients", () => {
  it("uses the English built-in template and the English link marker", () => {
    const text = buildClientMessageText(params({ clientName: "Dana", lang: "en" }));
    expect(text.startsWith("Hi Dana,\nYour event is officially booked")).toBe(true);
    expect(text).toContain(`\nLink: ${URL_}`);
    expect(text).not.toContain("קישור");
  });

  it("adds the name and the English link line to a saved English booking confirmation", () => {
    expect(buildClientMessageText(params({ clientName: "Dana", lang: "en", savedTemplate: "You're booked!", senderName: "Or" }))).toBe(
      `Dana,\nYou're booked!\nLink: ${URL_}\n\nOr`,
    );
  });

  it("doesn't treat the Hebrew marker as the link line for an English client", () => {
    const text = buildClientMessageText(params({ clientName: "Dana", lang: "en", savedTemplate: "Hi {{שם}}\nקישור:" }));
    expect(text).toBe(`Hi Dana\nקישור:\nLink: ${URL_}`);
  });

  it("translates the standard stage and package names, and keeps custom ones as typed", () => {
    const tpl = "{{שלב}} / {{חבילה}}";
    expect(buildClientMessageText(params({ stageKey: "album_design", stageLabel: "עיצוב אלבום", savedTemplate: tpl, lang: "en" }))).toBe("Album design / Full package");
    expect(buildClientMessageText(params({ stageKey: "album_design", stageLabel: "עיצוב אלבום", savedTemplate: tpl, lang: "ru", packageLabelText: "חבילה מותאמת אישית" }))).toBe(
      "Дизайн альбома / Индивидуальный пакет",
    );
    expect(
      buildClientMessageText(params({ stageKey: "custom-1", stageLabel: "Meeting", savedTemplate: tpl, lang: "en", packageLabelText: "Gold package" })),
    ).toBe("Meeting / Gold package");
  });

  it("formats the date and amounts for the client's locale", () => {
    const tpl = "{{תאריך}} {{יתרה}}";
    expect(buildClientMessageText(params({ stageKey: "x", savedTemplate: tpl, lang: "en" }))).toBe("03/12/2026 ₪12,500");
    expect(buildClientMessageText(params({ stageKey: "x", savedTemplate: tpl, lang: "ru" }))).toBe(`03.12.2026 ₪${(12500).toLocaleString("ru-RU")}`);
  });

  it("uses the Russian link marker", () => {
    expect(buildClientMessageText(params({ clientName: "Анна", lang: "ru", savedTemplate: "Готово" }))).toBe(`Анна,\nГотово\nСсылка: ${URL_}`);
  });
});

describe("clientTemplateKey / isLangTemplateKey", () => {
  it("keeps the plain key for Hebrew and adds @en / @ru for the others", () => {
    expect(clientTemplateKey("event_closing", "he")).toBe("event_closing");
    expect(clientTemplateKey("event_closing", "en")).toBe("event_closing@en");
    expect(clientTemplateKey("custom-123", "ru")).toBe("custom-123@ru");
  });

  it("recognizes only a language row", () => {
    expect(isLangTemplateKey("event_closing@en")).toBe(true);
    expect(isLangTemplateKey("event_closing@ru")).toBe(true);
    expect(isLangTemplateKey("event_closing")).toBe(false);
    expect(isLangTemplateKey("event_closing@he")).toBe(false);
    expect(isLangTemplateKey("event_closing@en-x")).toBe(false);
  });
});

describe("buildStageNoticeText", () => {
  it("is the server's Hebrew text as before for a Hebrew client", () => {
    expect(buildStageNoticeText({ stageKey: "album_approval", serverText: "עיצוב האלבום מוכן לאישור", clientName: "דנה", url: URL_ })).toBe(
      `שלום דנה,\nעיצוב האלבום מוכן לאישור ✓\n${URL_}`,
    );
  });

  it("uses the stage's own wording for an English or Russian client", () => {
    expect(buildStageNoticeText({ stageKey: "album_approval", serverText: "עברית", clientName: "Dana", url: URL_, lang: "en" })).toBe(
      `Hi Dana,\nYour album design is ready for approval ✓\n${URL_}`,
    );
    expect(buildStageNoticeText({ stageKey: "gallery_upload", serverText: "עברית", clientName: "Анна", url: URL_, lang: "ru" })).toBe(
      `Здравствуйте, Анна!\nВаша галерея готова. Можно выбирать фотографии ✓\n${URL_}`,
    );
  });

  it("has an English and a Russian wording for every stage notice", () => {
    for (const key of Object.keys(STAGE_NOTIFY_CLIENT) as (keyof typeof STAGE_NOTIFY_CLIENT)[]) {
      expect(STAGE_NOTIFY_CLIENT_I18N.en[key]).toBeTruthy();
      expect(STAGE_NOTIFY_CLIENT_I18N.ru[key]).toBeTruthy();
    }
  });
});
