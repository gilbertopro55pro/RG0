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
  // Its own shape (owner, 2026-11-07): "{name} שלום,", "מצורפת הצעת מחיר…", a blank line, the quote
  // link and what to do, a blank line, the portfolio line and the signature.
  it("has the owner's shape, with the portfolio line right above the signature", () => {
    const msg = quoteLinkMessage("הצעת מחיר לבר מצווה בתאריך 22.10.2026", "https://myframeflow.com/s/qX", "רועי גלברט - צילום אירועים 📸", false, "he", false, {
      clientName: "הילה שפירו",
      portfolioUrl: "https://myframeflow.com/p/gilberto",
    });
    expect(msg.split("\n")).toEqual([
      "הילה שלום,",
      "מצורפת הצעת מחיר לבר מצווה בתאריך 22.10.2026",
      "",
      "קישור להצעת המחיר: https://myframeflow.com/s/qX",
      "יש ללחוץ על הקישור לצפייה ואישור הצעת המחיר.",
      "",
      "תיק העבודות שלי: https://myframeflow.com/p/gilberto",
      "רועי גלברט - צילום אירועים 📸",
    ]);
  });

  it("adds the contract line under the link, and greets without a name", () => {
    const lines = quoteLinkMessage("Q", "https://x/s/q", "S", true, "he").split("\n");
    expect(lines[0]).toBe("שלום,");
    expect(lines[4]).toBe("יש ללחוץ על הקישור לצפייה ואישור הצעת המחיר.");
    expect(lines[5]).toBe("לאחר האישור ממלאים כמה פרטים קצרים על האירוע וחותמים על החוזה, הכל באותו קישור.");
  });

  it("keeps a couple's whole name in the greeting", () => {
    expect(quoteLinkMessage("Q", "https://x/s/q", null, false, "he", false, { clientName: "רותם ודניאל" }).split("\n")[0]).toBe("רותם ודניאל שלום,");
  });

  it("signs with the photographer's name when there's no signature, never both; no portfolio line without a portfolio", () => {
    expect(quoteLinkMessage("Q", "https://x/s/q", "", false, "he", false, { senderName: "סטודיו אור" }).split("\n").at(-1)).toBe("סטודיו אור");
    const both = quoteLinkMessage("Q", "https://x/s/q", "חתימה", false, "he", false, { senderName: "סטודיו אור" });
    expect(both.split("\n").at(-1)).toBe("חתימה");
    expect(both).not.toContain("סטודיו אור");
    expect(both).not.toContain("תיק העבודות");
    expect(both.split("\n").at(-2)).toBe("");
  });

  it("ends at the instruction line without a signature, a name or a portfolio", () => {
    expect(quoteLinkMessage("Q", "https://x/s/q", null).split("\n").at(-1)).toBe("יש ללחוץ על הקישור לצפייה ואישור הצעת המחיר.");
  });

  it("translates the lines in Russian", () => {
    const msg = quoteLinkMessage("Q", "https://x/s/q", "Студия", true, "ru", false, { clientName: "Анна Петрова", portfolioUrl: "https://x/p/s" });
    const lines = msg.split("\n");
    expect(lines[0]).toBe("Здравствуйте, Анна!");
    expect(msg).toContain("Ссылка на предложение: https://x/s/q");
    expect(msg).toContain("Нажмите на ссылку, чтобы посмотреть и подтвердить предложение.");
    expect(msg).toContain("подписать договор");
    expect(lines.at(-2)).toBe("Моё портфолио: https://x/p/s");
    expect(lines.at(-1)).toBe("Студия");
  });
});

// The browser bundle must not pull in the merged dictionary through this file.
describe("quoteDefaults imports", () => {
  it("doesn't import the merged dictionary", () => {
    const src = readFileSync(new URL("./quoteDefaults.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/from "@\/i18n\/dict"/);
  });
});
