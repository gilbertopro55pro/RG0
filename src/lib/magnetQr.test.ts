import { describe, expect, it } from "vitest";
import {
  QR_MIN_CONTRAST,
  QR_QUIET_ZONE_MODULES,
  magnetGuestCode,
  magnetGuestRange,
  magnetGuestUrl,
  magnetPortfolioSlug,
  magnetQrUrl,
  newQrElement,
  normalizeQrUrl,
  qrColorProblem,
  qrContrastRatio,
  qrMatrix,
  qrMinSizePct,
  qrModuleMm,
  qrPath,
  qrPctForCm,
  qrRecommendedSizePct,
  qrSizeCm,
  qrSquareModules,
} from "@/lib/magnetQr";
import { parseShortCode, shortClientUrl } from "@/lib/shortLinks";
import { DEFAULT_MAGNET_FRAME_SETTINGS, MAGNET_FRAME_SIZES, MAGNET_SAFE_MARGIN_CM, getMatInsetPct, magnetSize } from "@/lib/magnetFrameShared";
import { SITE_URL } from "@/lib/siteUrl";
import type { MagnetFrameQrElement } from "@/lib/types";

const EVENT = "3f2a9c1e-7b4d-4e8f-9a01-23456789abcd";
const ctx = (over: Partial<{ eventId: string | null; portfolioSlug: string | null }> = {}) => ({ eventId: EVENT, portfolioSlug: "gilberto", ...over });

describe("the guests' link", () => {
  it("is /m/ + 11 base-62 characters, one per event", () => {
    expect(magnetGuestUrl(EVENT)).toMatch(new RegExp(`^${SITE_URL}/m/[0-9a-zA-Z]{11}$`));
    expect(magnetGuestUrl(EVENT, "https://x.test")).toBe(`https://x.test/m/${magnetGuestCode(EVENT)}`);
    expect(magnetGuestCode("3f2a9c1e-7b4d-4e8f-0000-000000000000")).toBe(magnetGuestCode(EVENT));
    expect(magnetGuestCode("3f2a9c1e-7b4d-4e8e-9a01-23456789abcd")).not.toBe(magnetGuestCode(EVENT));
  });

  it("finds the event back by the range of ids its code stands for", () => {
    const range = magnetGuestRange(magnetGuestCode(EVENT)!)!;
    expect(range).toEqual({ from: "3f2a9c1e-7b4d-4e8f-0000-000000000000", to: "3f2a9c1e-7b4d-4e8f-ffff-ffffffffffff" });
    expect(EVENT >= range.from && EVENT <= range.to).toBe(true);
  });

  it("rejects codes it never made", () => {
    expect(magnetGuestRange("short")).toBeNull();
    expect(magnetGuestRange("zzzzzzzzzz!")).toBeNull();
    // 62^11 > 2^64: the largest 11 characters are past any 16 hex digits.
    expect(magnetGuestRange("ZZZZZZZZZZZ")).toBeNull();
    expect(magnetGuestCode("not-a-uuid")).toBeNull();
  });

  it("uses the same code as the short client links (behavior kept after the helpers were shared)", () => {
    const client = shortClientUrl("https://x.test", "gallery", EVENT);
    expect(client).toBe(`https://x.test/s/g${magnetGuestCode(EVENT)}`);
    expect(parseShortCode(`g${magnetGuestCode(EVENT)}`)).toEqual({ kind: "gallery", ...magnetGuestRange(magnetGuestCode(EVENT)!) });
  });
});

describe("what a QR opens", () => {
  const qr = (target: MagnetFrameQrElement["target"], url?: string) => ({ target, url });

  it("gallery: the event's guest link, nothing without a linked event", () => {
    expect(magnetQrUrl(qr("gallery"), ctx())).toBe(magnetGuestUrl(EVENT));
    expect(magnetQrUrl(qr("gallery"), ctx({ eventId: null }))).toBeNull();
  });

  it("portfolio: the public portfolio, nothing without one", () => {
    expect(magnetQrUrl(qr("portfolio"), ctx())).toBe(`${SITE_URL}/p/gilberto`);
    expect(magnetQrUrl(qr("portfolio"), ctx({ portfolioSlug: null }))).toBeNull();
  });

  it("a portfolio counts only when it's on", () => {
    expect(magnetPortfolioSlug({ portfolio_slug: "a", portfolio_enabled: true })).toBe("a");
    expect(magnetPortfolioSlug({ portfolio_slug: "a", portfolio_enabled: false })).toBeNull();
    expect(magnetPortfolioSlug({ portfolio_slug: null, portfolio_enabled: true })).toBeNull();
    expect(magnetPortfolioSlug(null)).toBeNull();
  });

  it("url: the typed link, https added to a bare domain", () => {
    expect(magnetQrUrl(qr("url", "  https://example.com/a?b=1 "), ctx())).toBe("https://example.com/a?b=1");
    expect(magnetQrUrl(qr("url", "instagram.com/studio"), ctx())).toBe("https://instagram.com/studio");
    expect(magnetQrUrl(qr("url", "HTTP://Example.com"), ctx())).toBe("HTTP://Example.com");
    expect(normalizeQrUrl("wa.me/972501234567")).toBe("https://wa.me/972501234567");
    expect(normalizeQrUrl("example.com:8080/x")).toBe("https://example.com:8080/x");
  });

  it("url: nothing for an empty or unsafe link", () => {
    for (const bad of [undefined, "", "   ", "javascript:alert(1)", "mailto:a@b.co", "ftp://example.com", "tel:0501234567", "localhost", "not a link", "https://", "https://user:pw@example.com", "data:text/html,x", "example"]) {
      expect(normalizeQrUrl(bad), String(bad)).toBeNull();
    }
    expect(magnetQrUrl(qr("url"), ctx())).toBeNull();
  });
});

describe("the code", () => {
  it("is deterministic and the guest link fits a small version (29 modules)", () => {
    const url = magnetGuestUrl(EVENT)!;
    const a = qrMatrix(url);
    const b = qrMatrix(`${url}`);
    expect(a.size).toBe(29);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(qrSquareModules(a)).toBe(29 + 2 * QR_QUIET_ZONE_MODULES);
  });

  it("the path draws exactly the dark modules, inside the quiet zone", () => {
    const m = qrMatrix("https://example.com/");
    const d = qrPath(m);
    let area = 0;
    for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      area += Number(w);
      expect(Number(x)).toBeGreaterThanOrEqual(QR_QUIET_ZONE_MODULES);
      expect(Number(y)).toBeGreaterThanOrEqual(QR_QUIET_ZONE_MODULES);
      expect(Number(x) + Number(w)).toBeLessThanOrEqual(QR_QUIET_ZONE_MODULES + m.size);
    }
    expect(area).toBe(m.data.reduce((s, v) => s + v, 0));
  });

  it("a long link makes the modules smaller on paper", () => {
    const short = qrModuleMm(magnetGuestUrl(EVENT)!, 2.5);
    const long = qrModuleMm(`https://example.com/${"a".repeat(150)}`, 2.5);
    expect(short).toBeCloseTo(25 / 33, 5);
    expect(long).toBeLessThan(0.5);
  });
});

describe("size on paper", () => {
  it("2 cm minimum and 2.5 cm recommended, per print size (of the shorter side)", () => {
    expect(qrMinSizePct("20x15")).toBeCloseTo((2 / 15) * 100, 6);
    expect(qrMinSizePct("10x7")).toBeCloseTo((2 / 7) * 100, 6);
    expect(qrMinSizePct("9x9")).toBeCloseTo((2 / 9) * 100, 6);
    expect(qrMinSizePct(undefined)).toBe(qrMinSizePct("20x15"));
    expect(qrRecommendedSizePct("15x10")).toBeCloseTo(25, 6);
    for (const s of MAGNET_FRAME_SIZES) {
      expect(qrSizeCm(qrPctForCm(2.7, s.key), s.key)).toBeCloseTo(2.7, 9);
      expect(qrMinSizePct(s.key)).toBeLessThan(90);
    }
  });
});

describe("colors", () => {
  it("dark on light is fine, light on dark is inverted, gold on white is too faint", () => {
    expect(qrColorProblem("#111111", "#ffffff")).toBeNull();
    expect(qrColorProblem("#1c2a4a", "#f5efe6")).toBeNull();
    expect(qrColorProblem("#ffffff", "#111111")).toBe("inverted");
    expect(qrColorProblem("#c9a84c", "#ffffff")).toBe("low");
    expect(qrContrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(qrContrastRatio("#7a1f2b", "#ffffff")).toBeGreaterThan(QR_MIN_CONTRAST);
  });
});

describe("a new QR", () => {
  it("is dark on white, about 3 cm (2.5 cm on the small magnets), and keeps the target", () => {
    const big = newQrElement("gallery", { sizeKey: "20x15", orientation: "landscape" });
    expect(big).toMatchObject({ type: "qr", target: "gallery", color: "#111111", bgColor: "#ffffff" });
    expect(big.url).toBeUndefined();
    expect(qrSizeCm(big.sizePct, "20x15")).toBeCloseTo(3, 6);
    expect(qrSizeCm(newQrElement("gallery", { sizeKey: "10x7", orientation: "landscape" }).sizePct, "10x7")).toBeCloseTo(2.5, 6);
    expect(newQrElement("url", { sizeKey: "9x9", orientation: "landscape", url: "a.co" }).url).toBe("a.co");
  });

  it("sits in a bottom corner, inside the frame's safe margin, at every size and orientation", () => {
    for (const s of MAGNET_FRAME_SIZES) {
      for (const orientation of ["landscape", "portrait"] as const) {
        for (const corner of ["left", "right"] as const) {
          const el = newQrElement("portfolio", { sizeKey: s.key, orientation, corner });
          const size = magnetSize(s.key);
          const wCm = orientation === "landscape" ? size.widthCm : size.heightCm;
          const hCm = orientation === "landscape" ? size.heightCm : size.widthCm;
          const cm = qrSizeCm(el.sizePct, s.key);
          const cx = (el.xPct / 100) * wCm;
          const cy = (el.yPct / 100) * hCm;
          expect(cx - cm / 2).toBeGreaterThanOrEqual(MAGNET_SAFE_MARGIN_CM - 1e-9);
          expect(cx + cm / 2).toBeLessThanOrEqual(wCm - MAGNET_SAFE_MARGIN_CM + 1e-9);
          expect(cy + cm / 2).toBeLessThanOrEqual(hCm - MAGNET_SAFE_MARGIN_CM + 1e-9);
          expect(cy).toBeGreaterThan(hCm / 2);
          expect(corner === "left" ? el.xPct < 50 : el.xPct > 50).toBe(true);
        }
      }
    }
  });

  it("shrinks to fit a mat that holds at least 2.5 cm, instead of reaching over the photo", () => {
    // 20x15 with a 22% bottom mat: 3.3 cm, 2.7 cm between the margins.
    const mat = { borderRatioPct: 9, bottomBorderRatioPct: 22 };
    const el = newQrElement("gallery", { sizeKey: "20x15", orientation: "landscape", mat });
    expect(qrSizeCm(el.sizePct, "20x15")).toBeCloseTo(2.7, 6);
    const inset = getMatInsetPct("landscape", "20x15", mat.borderRatioPct, mat.bottomBorderRatioPct);
    expect(el.yPct).toBeCloseTo(100 - inset.bottomPct / 2, 6);
    // A 2 cm mat (too thin for 2.5 cm) keeps the full size.
    expect(qrSizeCm(newQrElement("gallery", { sizeKey: "20x15", orientation: "landscape", mat: { borderRatioPct: 9, bottomBorderRatioPct: 15 } }).sizePct, "20x15")).toBeCloseTo(3, 6);
  });

  it("is centered on the bottom mat when the mat is deep enough to hold it", () => {
    const mat = { borderRatioPct: 12, bottomBorderRatioPct: 40 };
    const el = newQrElement("gallery", { sizeKey: "20x15", orientation: "landscape", mat });
    const inset = getMatInsetPct("landscape", "20x15", mat.borderRatioPct, mat.bottomBorderRatioPct);
    expect(el.yPct).toBeCloseTo(100 - inset.bottomPct / 2, 6);
    // The default mat (12%) is too thin: the code's bottom edge sits half a centimeter above the edge.
    const thin = newQrElement("gallery", { sizeKey: "20x15", orientation: "landscape", mat: DEFAULT_MAGNET_FRAME_SETTINGS });
    expect(15 - ((thin.yPct / 100) * 15 + 1.5)).toBeCloseTo(0.5, 6);
  });
});
