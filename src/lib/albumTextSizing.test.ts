import { describe, expect, it } from "vitest";
import { ALBUM_TEXT_LINE_HEIGHT, albumLineBaselines, albumLineDir, albumTextLines, grownTextBox, textHeightPctForFontSize, textHeightPctForLines } from "@/lib/albumTextSizing";

// Album text lines (2026-10-23): a new line only at the photographer's own break, the same in the
// editor and in every export.

const album = { width_cm: 60, height_cm: 30 };

describe("albumTextLines", () => {
  it("splits at every break, keeping empty lines, whatever the line ending", () => {
    expect(albumTextLines("דנה")).toEqual(["דנה"]);
    expect(albumTextLines("דנה\nויוסי")).toEqual(["דנה", "ויוסי"]);
    expect(albumTextLines("a\r\nb\rc\n\nd")).toEqual(["a", "b", "c", "", "d"]);
  });

  it("a line with Hebrew reads right to left, like the exports lay it out", () => {
    expect(albumLineDir("דנה ויוסי")).toBe("rtl");
    expect(albumLineDir("Dana & Yossi 2026")).toBe("ltr");
    expect(albumLineDir("Bar Mitzvah של אורי")).toBe("rtl");
    expect(albumLineDir("")).toBe("ltr");
  });
});

describe("albumLineBaselines", () => {
  it("one line: (ascent - descent) / 2 below the middle, the formula every export used", () => {
    expect(albumLineBaselines(1, 60, 50, 14)).toEqual([18]);
  });

  it("lines a line height apart, centered as a block", () => {
    const [a, b, c] = albumLineBaselines(3, 60, 50, 14);
    expect(b).toBe(18);
    expect(b - a).toBeCloseTo(ALBUM_TEXT_LINE_HEIGHT * 60, 9);
    expect(c - b).toBeCloseTo(ALBUM_TEXT_LINE_HEIGHT * 60, 9);
  });
});

describe("text box height for lines", () => {
  it("one line is the usual height, each more line adds a line height", () => {
    const one = textHeightPctForFontSize(40, album);
    expect(textHeightPctForLines(40, album, 1)).toBe(one);
    // 40pt on 60×30: one em is 5% of the height, one line 1.4 em = 7%; two lines 7% + 1.2 em = 13%.
    expect(textHeightPctForLines(40, album, 2)).toBeCloseTo(13, 9);
    expect(textHeightPctForLines(200, album, 5)).toBe(90);
  });

  it("grows a short box about its middle, and never shrinks one", () => {
    const el = { yPct: 40, heightPct: 7, fontSize: 40 };
    expect(grownTextBox(el, "דנה", album)).toBeNull();
    const grown = grownTextBox(el, "דנה\nויוסי", album)!;
    expect(grown.heightPct).toBeCloseTo(13, 9);
    expect(grown.yPct + grown.heightPct / 2).toBeCloseTo(43.5, 9);
    expect(grownTextBox({ ...el, heightPct: 30 }, "דנה\nויוסי", album)).toBeNull();
    // A box saved without a height (15%) is measured as 15%.
    expect(grownTextBox({ yPct: 40, fontSize: 40 }, "a\nb", album)).toBeNull();
  });
});
