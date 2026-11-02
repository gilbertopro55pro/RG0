import { describe, expect, it } from "vitest";
import { CATALOG_QUOTES, LETTER_WIDTH, QUOTE_FONTS, cleanCustomQuote, fallbackQuotes, quoteFonts, quoteSpreads, quotesFromPicks, tabQuoteTags } from "./catalogQuotes";
import { ALBUM_FONT_DEFS } from "@/lib/albumFontFiles";

describe("the catalog's lines", () => {
  it("are very short English lines, each id once", () => {
    expect(new Set(CATALOG_QUOTES.map((q) => q.id)).size).toBe(CATALOG_QUOTES.length);
    expect(new Set(CATALOG_QUOTES.map((q) => q.text)).size).toBe(CATALOG_QUOTES.length);
    for (const q of CATALOG_QUOTES) {
      expect(q.text.length, q.text).toBeLessThanOrEqual(40);
      expect(q.text, q.text).toMatch(/^[A-Za-z][A-Za-z ,.'!&-]*$/);
      expect(q.tags.length).toBeGreaterThan(0);
    }
    expect(CATALOG_QUOTES.length).toBeGreaterThanOrEqual(90);
  });

  it("go on a tab's first page and one page in three, never two in a row", () => {
    const tabs = ["a", "a", "a", "a", "a", "b", "b", "b", "c", "c", "c", "c", "c", "c"];
    const keys = quoteSpreads(tabs);
    expect(keys).toContain(0);
    expect(keys).toContain(5);
    expect(keys).toContain(8);
    for (let i = 1; i < keys.length; i++) expect(keys[i] - keys[i - 1]).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < keys.length; i++) expect(keys[i] - keys[i - 1]).toBeLessThanOrEqual(3);
    // Without tabs: one in three.
    expect(quoteSpreads(Array(9).fill(null))).toEqual([0, 3, 6]);
  });

  it("read the place from the tab's name", () => {
    expect(tabQuoteTags("3.חוף ים")).toEqual(["beach"]);
    expect(tabQuoteTags("2.גרפיטי")).toEqual(["city"]);
    expect(tabQuoteTags("1.עין צורים")).toEqual(["nature"]);
    expect(tabQuoteTags("Beach")).toEqual(["beach"]);
    expect(tabQuoteTags("סטודיו")).toEqual([]);
    expect(tabQuoteTags(null)).toEqual([]);
  });

  it("fall back to a line of the tab's place, each line once", () => {
    const out = fallbackQuotes([
      { key: 0, tab: "חוף ים" },
      { key: 3, tab: "חוף ים" },
      { key: 6, tab: "גרפיטי" },
      { key: 9, tab: null },
    ]);
    const beach = CATALOG_QUOTES.filter((q) => q.tags.includes("beach")).map((q) => q.text);
    const city = CATALOG_QUOTES.filter((q) => q.tags.includes("city")).map((q) => q.text);
    expect(beach).toContain(out.get(0));
    expect(beach).toContain(out.get(3));
    expect(out.get(0)).not.toBe(out.get(3));
    expect(city).toContain(out.get(6));
    expect(out.get(9)).toBeTruthy();
  });

  it("take Claude's picks, and the fallback for what it skipped or got wrong", () => {
    const spreads = [
      { key: 0, tab: "חוף ים" },
      { key: 3, tab: null },
      { key: 6, tab: null },
      { key: 9, tab: "גרפיטי" },
    ];
    const out = quotesFromPicks(
      [
        { page: 0, quoteId: "b1", custom: "" },
        { page: 3, quoteId: "b1", custom: "" }, // used already: the fallback
        { page: 6, quoteId: "nope", custom: "Wings of freedom" }, // its own line
        { page: 42, quoteId: "d1", custom: "" }, // no such page
        { page: 9, quoteId: "", custom: "שלום עולם" }, // not English: the fallback
      ],
      spreads
    );
    expect(out.get(0)).toBe("Salt in the air, sand in my hair");
    expect(out.get(3)).toBeTruthy();
    expect(out.get(3)).not.toBe("Salt in the air, sand in my hair");
    expect(out.get(6)).toBe("Wings of freedom");
    expect(CATALOG_QUOTES.filter((q) => q.tags.includes("city")).map((q) => q.text)).toContain(out.get(9));
    expect(out.size).toBe(4);
    // Nothing from Claude: every page still gets a line.
    expect(quotesFromPicks(null, spreads).size).toBe(4);
  });

  it("keep a line of Claude's own only when it is short English words", () => {
    expect(cleanCustomQuote('"Ready for takeoff"')).toBe("Ready for takeoff");
    expect(cleanCustomQuote("A very long line that goes on and on and on forever")).toBeNull();
    expect(cleanCustomQuote("12 and amazing")).toBeNull();
    expect(cleanCustomQuote("")).toBeNull();
    expect(cleanCustomQuote(7)).toBeNull();
  });

  it("each take a different face, handwriting and lettering in turn, one that suits their subject", () => {
    const lines = ["Nature is my happy place", "Draw your world", "Salt in the air, sand in my hair", "Stay wild", "Dream big", "My own words here", "Let the music play"];
    const fonts = quoteFonts(lines);
    expect(fonts).toHaveLength(lines.length);
    expect(new Set(fonts).size).toBe(lines.length);
    expect(fonts[0]).toBe("parisienne");
    expect(fonts[1]).toBe("permanent-marker");
    expect(fonts[2]).toBe("pacifico");
    expect(["kalam", "bebas-neue", "lobster"]).toContain(fonts[3]);
    const script = ["great-vibes", "pacifico", "parisienne", "dancing-script", "yellowtail", "satisfy", "cookie"];
    fonts.forEach((f, i) => expect(script.includes(f), `${i} ${f}`).toBe(i % 2 === 0));
    // A longer album than there are faces: every face of a kind before any comes back, never two in a row.
    const many = quoteFonts(Array(30).fill("Dream big"));
    expect(new Set(many.slice(0, 10)).size).toBe(10);
    for (let i = 1; i < many.length; i++) expect(many[i]).not.toBe(many[i - 1]);
  });

  it("only use faces every export can draw, each with its letter width", () => {
    const exportable = new Set(ALBUM_FONT_DEFS.filter((d) => d.category === "latin").map((d) => d.key));
    for (const f of QUOTE_FONTS) {
      expect(exportable.has(f), f).toBe(true);
      expect(LETTER_WIDTH[f], f).toBeGreaterThan(0.3);
    }
  });
});
