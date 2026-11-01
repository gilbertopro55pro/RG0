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
  // The fixed client-message shape (owner, 2026-11-01): greeting, body, "קישור:" line, blank line, signature.
  it("has the fixed shape: greeting, caption and what to do, the link line, a blank line, the signature", () => {
    const msg = quoteLinkMessage("הילה שפירו הצעת מחיר לבר מצווה", "https://myframeflow.com/s/qX", "גילברטו", false, "he", false, { clientName: "הילה שפירו" });
    expect(msg.split("\n")).toEqual([
      "שלום הילה,",
      "הילה שפירו הצעת מחיר לבר מצווה",
      "בקישור אפשר לצפות בהצעת המחיר ולאשר אותה.",
      "קישור: https://myframeflow.com/s/qX",
      "",
      "גילברטו",
    ]);
  });

  it("adds the contract line before the link when the quote ends with signing", () => {
    const lines = quoteLinkMessage("Q", "https://x/s/q", "S", true, "he").split("\n");
    expect(lines[0]).toBe("שלום,");
    expect(lines[3]).toBe("לאחר האישור ממלאים כמה פרטים קצרים על האירוע וחותמים על החוזה, הכל באותו קישור.");
    expect(lines[4]).toBe("קישור: https://x/s/q");
  });

  it("keeps a couple's whole name in the greeting", () => {
    expect(quoteLinkMessage("Q", "https://x/s/q", null, false, "he", false, { clientName: "רותם ודניאל" }).split("\n")[0]).toBe("שלום רותם ודניאל,");
  });

  it("signs with the photographer's name when there's no signature, never both", () => {
    expect(quoteLinkMessage("Q", "https://x/s/q", "", false, "he", false, { senderName: "סטודיו אור" }).split("\n").at(-1)).toBe("סטודיו אור");
    const both = quoteLinkMessage("Q", "https://x/s/q", "חתימה", false, "he", false, { senderName: "סטודיו אור" });
    expect(both.split("\n").at(-1)).toBe("חתימה");
    expect(both).not.toContain("סטודיו אור");
  });

  it("ends at the link line without a signature or a name", () => {
    expect(quoteLinkMessage("Q", "https://x/s/q", null).split("\n").at(-1)).toBe("קישור: https://x/s/q");
  });

  it("translates the lines in Russian", () => {
    const msg = quoteLinkMessage("Q", "https://x/s/q", "Студия", true, "ru", false, { clientName: "Анна Петрова" });
    const lines = msg.split("\n");
    expect(lines[0]).toBe("Здравствуйте, Анна!");
    expect(msg).toContain("По ссылке можно посмотреть и подтвердить предложение.");
    expect(msg).toContain("подписать договор");
    expect(msg).toContain("Ссылка: https://x/s/q");
    expect(lines.at(-2)).toBe("");
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
