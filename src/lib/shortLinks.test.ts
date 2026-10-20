import { describe, expect, it } from "vitest";
import { SHORT_LINK_PATH, parseShortCode, shortClientUrl, type ShortLinkKind } from "@/lib/shortLinks";

const ORIGIN = "https://myframeflow.com";
const TOKEN = "3f2a9c1e-7b4d-4e8f-9a01-23456789abcd";
const KINDS: [ShortLinkKind, string][] = [
  ["portal", "p"],
  ["gallery", "g"],
  ["quote", "q"],
  ["contract", "c"],
];

const codeOf = (url: string) => new URL(url).pathname.replace(/^\/s\//, "");

// An independent base-62 reading of a code, to check the encoding by hand.
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const decode = (s: string) => [...s].reduce((n, ch) => n * BigInt(62) + BigInt(ALPHABET.indexOf(ch)), BigInt(0));

describe("shortClientUrl", () => {
  it("is /s/ + a letter for the kind + 11 base-62 characters", () => {
    for (const [kind, letter] of KINDS) {
      const url = shortClientUrl(ORIGIN, kind, TOKEN);
      expect(url).toMatch(new RegExp(`^${ORIGIN}/s/${letter}[0-9a-zA-Z]{11}$`));
    }
  });

  it("encodes the token's first 16 hex digits", () => {
    const code = codeOf(shortClientUrl(ORIGIN, "portal", TOKEN));
    expect(decode(code.slice(1)).toString(16).padStart(16, "0")).toBe("3f2a9c1e7b4d4e8f");
  });

  it("encodes small values the way base 62 should", () => {
    const tok = (head: string) => `${head.slice(0, 8)}-${head.slice(8, 12)}-${head.slice(12, 16)}-aaaa-bbbbbbbbbbbb`;
    expect(shortClientUrl(ORIGIN, "portal", tok("0000000000000000"))).toBe(`${ORIGIN}/s/p00000000000`);
    expect(shortClientUrl(ORIGIN, "gallery", tok("0000000000000001"))).toBe(`${ORIGIN}/s/g00000000001`);
    expect(shortClientUrl(ORIGIN, "quote", tok("000000000000003d"))).toBe(`${ORIGIN}/s/q0000000000Z`);
    expect(shortClientUrl(ORIGIN, "contract", tok("000000000000003e"))).toBe(`${ORIGIN}/s/c00000000010`);
  });

  it("fits the largest possible value in 11 characters", () => {
    const code = codeOf(shortClientUrl(ORIGIN, "portal", "ffffffff-ffff-ffff-ffff-ffffffffffff"));
    expect(code).toHaveLength(12);
    expect(decode(code.slice(1))).toBe((BigInt(1) << BigInt(64)) - BigInt(1));
  });

  it("depends only on the first 16 hex digits, and is the same every time", () => {
    const other = "3f2a9c1e-7b4d-4e8f-0000-000000000000";
    expect(shortClientUrl(ORIGIN, "portal", TOKEN)).toBe(shortClientUrl(ORIGIN, "portal", other));
    expect(shortClientUrl(ORIGIN, "portal", TOKEN)).toBe(shortClientUrl(ORIGIN, "portal", TOKEN));
    expect(shortClientUrl(ORIGIN, "portal", TOKEN)).not.toBe(shortClientUrl(ORIGIN, "portal", "3f2a9c1e-7b4d-4e80-9a01-23456789abcd"));
  });

  it("differs between kinds only in the first letter", () => {
    const codes = KINDS.map(([kind]) => codeOf(shortClientUrl(ORIGIN, kind, TOKEN)));
    expect(new Set(codes.map((c) => c.slice(1))).size).toBe(1);
    expect(codes.map((c) => c[0])).toEqual(["p", "g", "q", "c"]);
  });

  it("accepts upper case and a token without hyphens", () => {
    const expected = shortClientUrl(ORIGIN, "portal", TOKEN);
    expect(shortClientUrl(ORIGIN, "portal", TOKEN.toUpperCase())).toBe(expected);
    expect(shortClientUrl(ORIGIN, "portal", TOKEN.replace(/-/g, ""))).toBe(expected);
  });

  it("keeps the query string as is", () => {
    const url = shortClientUrl(ORIGIN, "gallery", TOKEN, "?folders=a,b&quality=web");
    expect(url).toMatch(/^https:\/\/myframeflow\.com\/s\/g[0-9a-zA-Z]{11}\?folders=a,b&quality=web$/);
  });

  it("keeps the long link for a token that isn't a UUID", () => {
    expect(shortClientUrl(ORIGIN, "portal", "abc123")).toBe(`${ORIGIN}/portal/abc123`);
    expect(shortClientUrl(ORIGIN, "gallery", "not-a-uuid", "?folders=x")).toBe(`${ORIGIN}/gallery/not-a-uuid?folders=x`);
    expect(shortClientUrl(ORIGIN, "quote", "3f2a9c1e-7b4d-4e8f-9a01-23456789abcg")).toBe(`${ORIGIN}/quotes/3f2a9c1e-7b4d-4e8f-9a01-23456789abcg`);
    expect(shortClientUrl(ORIGIN, "contract", "")).toBe(`${ORIGIN}/contracts/`);
  });

  it("uses the right long path per kind", () => {
    expect(SHORT_LINK_PATH).toEqual({ portal: "/portal/", gallery: "/gallery/", quote: "/quotes/", contract: "/contracts/" });
  });
});

describe("parseShortCode", () => {
  it("round-trips: the code gives back the kind and a token range that holds the token", () => {
    for (const [kind] of KINDS) {
      const parsed = parseShortCode(codeOf(shortClientUrl(ORIGIN, kind, TOKEN)));
      expect(parsed).toEqual({
        kind,
        from: "3f2a9c1e-7b4d-4e8f-0000-000000000000",
        to: "3f2a9c1e-7b4d-4e8f-ffff-ffffffffffff",
      });
      expect(parsed!.from <= TOKEN && TOKEN <= parsed!.to).toBe(true);
    }
  });

  it("round-trips random tokens", () => {
    // A fixed list (no randomness in the test), covering leading zeros and every hex digit.
    const tokens = [
      "00000000-0000-4000-8000-000000000000",
      "0000000f-00ff-4fff-bfff-ffffffffffff",
      "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "ffffffff-ffff-4fff-8fff-ffffffffffff",
      "12345678-9abc-4def-9012-3456789abcde",
    ];
    for (const token of tokens) {
      const parsed = parseShortCode(codeOf(shortClientUrl(ORIGIN, "quote", token)))!;
      expect(parsed.kind).toBe("quote");
      expect(parsed.from.slice(0, 19)).toBe(token.slice(0, 19));
      expect(parsed.from <= token && token <= parsed.to).toBe(true);
    }
  });

  it("rejects a code of the wrong length", () => {
    expect(parseShortCode("")).toBeNull();
    expect(parseShortCode("p0000000000")).toBeNull();
    expect(parseShortCode("p000000000000")).toBeNull();
  });

  it("rejects an unknown kind letter", () => {
    expect(parseShortCode("x00000000001")).toBeNull();
    expect(parseShortCode("P00000000001")).toBeNull();
  });

  it("rejects characters outside base 62", () => {
    expect(parseShortCode("p0000000000-")).toBeNull();
    expect(parseShortCode("p00000 00001")).toBeNull();
    expect(parseShortCode("p0000000000א")).toBeNull();
  });

  it("rejects a value too large to come from 16 hex digits", () => {
    expect(parseShortCode("pZZZZZZZZZZZ")).toBeNull();
    // 2^64 exactly is one past the largest.
    let n = BigInt(1) << BigInt(64);
    let s = "";
    for (let i = 0; i < 11; i++) {
      s = ALPHABET[Number(n % BigInt(62))] + s;
      n /= BigInt(62);
    }
    expect(parseShortCode(`p${s}`)).toBeNull();
  });
});
