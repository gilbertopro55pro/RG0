import { describe, expect, it } from "vitest";
import type { PDFFont, PDFPage, RGB } from "pdf-lib";
import { drawAlignedBidiText, drawCenteredBidiText, visualRunsOf } from "@/lib/pdfText";

describe("visualRunsOf", () => {
  it("keeps a line without Hebrew as one left-to-right run, brackets untouched", () => {
    expect(visualRunsOf("Hello (World)")).toEqual([{ text: "Hello (World)", rtl: false }]);
    expect(visualRunsOf("")).toEqual([]);
  });

  it("mirrors brackets around Hebrew (the 'מגנטים )2 אנשי צוות(' bug)", () => {
    // Runs are listed left to right; a right-to-left run keeps its characters in logical order
    // (fontkit reverses Hebrew itself), with "(" and ")" swapped so they draw the right way round.
    expect(visualRunsOf("מגנטים (2 אנשי צוות)")).toEqual([
      { text: " אנשי צוות(", rtl: true },
      { text: "2", rtl: false },
      { text: "מגנטים )", rtl: true },
    ]);
  });

  it("keeps a bracket pair around a number or a Latin word in Hebrew text", () => {
    expect(visualRunsOf("מע״מ (18%)")).toEqual([
      { text: "(", rtl: true },
      { text: "18%", rtl: false },
      { text: "מע״מ )", rtl: true },
    ]);
    expect(visualRunsOf("חבילה (Gold)")).toEqual([
      { text: "(", rtl: true },
      { text: "Gold", rtl: false },
      { text: "חבילה )", rtl: true },
    ]);
  });

  it("mirrors square and nested brackets too", () => {
    expect(visualRunsOf("אלבום [30x60] (גדול (מאוד))")).toEqual([
      { text: "[ )גדול )מאוד((", rtl: true },
      { text: "30x60", rtl: false },
      { text: "אלבום ]", rtl: true },
    ]);
  });

  it("mirrors an unmatched bracket inside Hebrew", () => {
    expect(visualRunsOf("מחיר (ללא")).toEqual([{ text: "מחיר )ללא", rtl: true }]);
  });

  it("never mirrors brackets in a left-to-right run", () => {
    expect(visualRunsOf("שם: Studio (Gold) Ltd")).toEqual([
      { text: "Studio (Gold) Ltd", rtl: false },
      { text: "שם: ", rtl: true },
    ]);
  });

  it("keeps phone numbers, dates, times, amounts and spaced ranges in one left-to-right run", () => {
    expect(visualRunsOf("טלפון: 050-1234567")).toEqual([
      { text: "050-1234567", rtl: false },
      { text: "טלפון: ", rtl: true },
    ]);
    expect(visualRunsOf("תאריך: 12.8.2027")).toEqual([
      { text: "12.8.2027", rtl: false },
      { text: "תאריך: ", rtl: true },
    ]);
    expect(visualRunsOf("שעות: 10:00 - 13:00")).toEqual([
      { text: "10:00 - 13:00", rtl: false },
      { text: "שעות: ", rtl: true },
    ]);
    expect(visualRunsOf("סה״כ: ₪1,200")).toEqual([
      { text: "₪1,200", rtl: false },
      { text: "סה״כ: ", rtl: true },
    ]);
  });

  it("puts a Latin word at the start of a Hebrew line on the right", () => {
    expect(visualRunsOf("Studio אור")).toEqual([
      { text: " אור", rtl: true },
      { text: "Studio", rtl: false },
    ]);
  });

  it("keeps every character of the line", () => {
    const line = "מגנטים (2 אנשי צוות) – ₪1,200 (כולל מע״מ 18%)";
    const drawn = visualRunsOf(line).map((r) => r.text).join("");
    const sorted = (s: string) => [...s.replace(/[()]/g, "")].sort().join("");
    expect(sorted(drawn)).toBe(sorted(line));
    expect(drawn.split("(").length).toBe(line.split("(").length);
  });
});

// Stand-ins for the two embedded fonts: the Hebrew subset covers the Hebrew block plus space and
// hyphen only (see pdfText.ts); the Latin font covers printable ASCII and ₪. Neither has emoji.
function fakeFont(name: string, covers: (cp: number) => boolean): PDFFont {
  const set: number[] = [];
  for (let cp = 0; cp < 0x2100; cp++) if (covers(cp)) set.push(cp);
  return { name, getCharacterSet: () => set, widthOfTextAtSize: (text: string, size: number) => [...text].length * size } as unknown as PDFFont;
}
const hebrewFont = fakeFont("hebrew", (cp) => (cp >= 0x0590 && cp <= 0x05ff) || cp === 0x20 || cp === 0x2d);
const latinFont = fakeFont("latin", (cp) => (cp >= 0x20 && cp <= 0x7e) || cp === 0x20aa);
const color = { type: "RGB", red: 0, green: 0, blue: 0 } as unknown as RGB;

function fakePage() {
  const calls: { text: string; font: string; x: number }[] = [];
  const page = {
    drawText: (text: string, o: { x: number; font: { name: string } }) => calls.push({ text, font: o.font.name, x: o.x }),
  } as unknown as PDFPage;
  return { page, calls };
}

describe("drawAlignedBidiText", () => {
  const draw = (text: string, align: "left" | "center" | "right" = "left") => {
    const { page, calls } = fakePage();
    drawAlignedBidiText(page, text, { boxX: 100, boxWidth: 200, y: 50, size: 10, align, hebrewFont, latinFont, color });
    return calls;
  };

  it("leaves out characters neither font can draw (emoji in a studio name)", () => {
    const calls = draw("סטודיו אור 📷");
    expect(calls.map((c) => [c.text, c.font])).toEqual([["סטודיו אור", "hebrew"]]);
  });

  it("closes the gap an emoji leaves between words", () => {
    expect(draw("Studio 📷 Or").map((c) => [c.text, c.font])).toEqual([["Studio Or", "latin"]]);
  });

  it("draws punctuation the Hebrew font lacks with the Latin font, in the right place", () => {
    // "ח.פ: 123" drawn left to right: 123, space, colon, פ, dot, ח.
    expect(draw("ח.פ: 123").map((c) => [c.text, c.font])).toEqual([
      ["123", "latin"],
      [" ", "hebrew"],
      [":", "latin"],
      ["פ", "hebrew"],
      [".", "latin"],
      ["ח", "hebrew"],
    ]);
  });

  it("draws mirrored brackets with the Latin font", () => {
    expect(draw("מגנטים (2 אנשי צוות)").map((c) => [c.text, c.font])).toEqual([
      ["(", "latin"],
      [" אנשי צוות", "hebrew"],
      ["2", "latin"],
      [")", "latin"],
      ["מגנטים ", "hebrew"],
    ]);
  });

  it("aligns the whole line to the box", () => {
    // "שעות: 10:00" is 11 characters → 110 wide at size 10 in the stand-in fonts.
    const right = draw("שעות: 10:00", "right");
    expect(right[0].x).toBe(100 + 200 - 110);
    expect(draw("שעות: 10:00", "left")[0].x).toBe(100);
    expect(draw("שעות: 10:00", "center")[0].x).toBe(100 + (200 - 110) / 2);
  });

  it("advances by each run's width", () => {
    const calls = draw("טלפון: 050-1234567");
    expect(calls.map((c) => [c.text, c.x])).toEqual([
      ["050-1234567", 100],
      [" ", 210],
      [":", 220],
      ["טלפון", 230],
    ]);
  });
});

describe("drawCenteredBidiText", () => {
  it("centers the line around centerX", () => {
    const { page, calls } = fakePage();
    drawCenteredBidiText(page, "חבילת Gold", { centerX: 300, y: 50, size: 10, hebrewFont, latinFont, color });
    expect(calls.map((c) => [c.text, c.font, c.x])).toEqual([
      ["Gold", "latin", 250],
      ["חבילת ", "hebrew", 290],
    ]);
  });
});
