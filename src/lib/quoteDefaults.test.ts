import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { quoteLinkMessage, quoteShareCaption } from "@/lib/quoteDefaults";
import { messagesFor } from "@/i18n/dict";
import { PRESET_EVENT_TYPES } from "@/components/EventTypeField";

// The quote's caption and link message in the client's language. quoteDefaults reads only the areas
// it needs (it runs in the browser too), so these pin that it still translates what it did with
// the merged dictionary.
describe("quoteShareCaption", () => {
  it("keeps the Hebrew caption as written", () => {
    expect(quoteShareCaption("הילה שפירו", "בר מצווה", "22.10.2026")).toBe("הילה שפירו הצעת מחיר לבר מצווה בתאריך 22.10.2026");
  });

  it("translates the caption and a preset event type in English and Russian", () => {
    expect(quoteShareCaption("Hila", "בר מצווה", "22.10.2026", "en", "2026-10-22")).toBe("Price quote for Hila – Bar Mitzvah, 22 October 2026");
    expect(quoteShareCaption("", "חתונה", "", "ru")).toBe("Ценовое предложение – Свадьба");
    expect(quoteShareCaption("", "", "", "en")).toBe("Price quote");
  });

  it("leaves an event type the photographer typed as typed", () => {
    expect(quoteShareCaption("Dana", "יום הולדת 40", "", "en")).toBe("Price quote for Dana – יום הולדת 40");
  });

  it("translates every preset event type exactly as the merged dictionary does", () => {
    for (const lang of ["en", "ru"] as const) {
      const all = messagesFor(lang);
      for (const type of PRESET_EVENT_TYPES) {
        expect(all[type], `${lang}: ${type}`).toBeTruthy();
        expect(quoteShareCaption("", type, "", lang)).toContain(all[type]);
      }
    }
  });
});

describe("quoteLinkMessage", () => {
  it("translates the link lines in Russian", () => {
    const msg = quoteLinkMessage("Q", "https://x/s/q", "Студия", true, "ru");
    expect(msg).toContain("Ваше ценовое предложение: https://x/s/q");
    expect(msg).toContain("подтвердить предложение");
    expect(msg.split("\n").at(-1)).toBe("Студия");
  });
});

// The browser bundle must not pull in the merged dictionary through this file.
describe("quoteDefaults imports", () => {
  it("doesn't import the merged dictionary", () => {
    const src = readFileSync(new URL("./quoteDefaults.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/from "@\/i18n\/dict"/);
  });
});
