import { describe, expect, it } from "vitest";
import { SHARE_CODE_RE, portfolioShareMessage, shareCodeFor, tabCode, tabsForShareCode } from "@/lib/portfolioShareCode";

// The short link to some of the portfolio's tabs (owner 2026-10-20: "קצרים ונעימים לעין").

const TABS = ["חתונות - קליפים", "בר מצווה", "בוק", "חינה", "__none__"];

describe("tabCode", () => {
  it("gives every tab 3 letters or digits, the same every time", () => {
    for (const t of TABS) {
      expect(tabCode(t)).toMatch(/^[0-9A-Za-z]{3}$/);
      expect(tabCode(t)).toBe(tabCode(t));
    }
  });

  it("tells these tabs apart", () => {
    expect(new Set(TABS.map(tabCode)).size).toBe(TABS.length);
  });

  it("depends on the exact name", () => {
    expect(tabCode("בוק")).not.toBe(tabCode("בוק "));
  });
});

describe("shareCodeFor / tabsForShareCode", () => {
  it("makes a short link for two Hebrew tabs (it was about 150 characters)", () => {
    const code = shareCodeFor(["חתונות - קליפים", "בוק"], TABS)!;
    expect(code).toHaveLength(6);
    expect(SHARE_CODE_RE.test(code)).toBe(true);
    expect(`myframeflow.com/p/gilberto/${code}`.length).toBeLessThan(40);
  });

  it("opens exactly the chosen tabs", () => {
    const chosen = ["חתונות - קליפים", "חינה", "__none__"];
    expect(tabsForShareCode(shareCodeFor(chosen, TABS)!, TABS).sort()).toEqual([...chosen].sort());
  });

  it("gives the same link whatever order the tabs were chosen in", () => {
    expect(shareCodeFor(["בוק", "חינה"], TABS)).toBe(shareCodeFor(["חינה", "בוק"], TABS));
  });

  it("drops a tab renamed since the link was made, and keeps the rest", () => {
    const code = shareCodeFor(["בוק", "חינה"], TABS)!;
    expect(tabsForShareCode(code, ["בוק", "חינה 2026", "בר מצווה"])).toEqual(["בוק"]);
  });

  it("gives up (the long link stays) when a tab left out has the same 3 letters as a chosen one", () => {
    // Find two names whose codes collide.
    const seen = new Map<string, string>();
    let pair: [string, string] | null = null;
    for (let i = 0; !pair; i++) {
      const name = `tab ${i}`;
      const c = tabCode(name);
      const other = seen.get(c);
      if (other) pair = [other, name];
      else seen.set(c, name);
    }
    expect(shareCodeFor([pair[0]], [pair[0], pair[1]])).toBeNull();
    expect(shareCodeFor(pair, [pair[0], pair[1]])).toHaveLength(3);
  });

  it("makes nothing for no tabs, and reads nothing from a broken code", () => {
    expect(shareCodeFor([], TABS)).toBeNull();
    expect(tabsForShareCode("ab", TABS)).toEqual([]);
    expect(tabsForShareCode("ab!", TABS)).toEqual([]);
    expect(tabsForShareCode("", TABS)).toEqual([]);
  });
});

describe("portfolioShareMessage", () => {
  const url = "https://myframeflow.com/p/gilberto/Oeb";

  it("signs with the saved signature", () => {
    expect(portfolioShareMessage(url, "רועי גלברט\n050-0000000", "רועי גלברט - צילום אירועים 📸")).toBe(
      `היי, אשמח שתעיפו מבט בתיק העבודות שלי 📸\n${url}\n\nרועי גלברט\n050-0000000`
    );
  });

  it("signs with the name alone without a signature, and never adds \"- צילום אירועים\" (the owner's bug)", () => {
    const msg = portfolioShareMessage(url, "  ", "רועי גלברט - צילום אירועים 📸");
    expect(msg.endsWith("\n\nרועי גלברט - צילום אירועים 📸")).toBe(true);
    expect(msg.match(/צילום אירועים/g)).toHaveLength(1);
  });

  it("leaves the signature line out when there's neither", () => {
    expect(portfolioShareMessage(url, null, null)).toBe(`היי, אשמח שתעיפו מבט בתיק העבודות שלי 📸\n${url}`);
  });
});
