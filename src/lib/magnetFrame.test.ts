import sharp from "sharp";
import jsQR from "jsqr";
import { readPsd } from "ag-psd";
import { describe, expect, it, vi } from "vitest";
import { composeMagnetFrameElements, magnetTextEffects, qrPixels, renderMagnetFrameBase, renderMagnetFramePng } from "@/lib/magnetFrame";
import { renderMagnetFramePsd } from "@/lib/magnetFramePsd";
import { loadMagnetDesign } from "@/lib/magnetFrameLoad";
import { QR_QUIET_ZONE_MODULES, magnetGuestUrl, newQrElement, qrMatrix, qrMinSizePct, qrSquareModules } from "@/lib/magnetQr";
import {
  DEFAULT_MAGNET_FRAME_SETTINGS,
  MAGNET_FRAME_SIZES,
  getMatInsetPct,
  magnetDesignDimensions,
  magnetExportDimensions,
  magnetExportScale,
} from "@/lib/magnetFrameShared";
import type { MagnetFrameElement, MagnetFrameQrElement, MagnetFrameSettings, MagnetFrameSizeKey } from "@/lib/types";

vi.mock("@/lib/storage", () => ({ downloadObjectBuffer: vi.fn(async () => null) }));

type TextEl = Extract<MagnetFrameElement, { type: "text" }>;

function textEl(over: Partial<TextEl> = {}): TextEl {
  return {
    id: "t",
    type: "text",
    text: "Love",
    xPct: 50,
    yPct: 50,
    fontKey: "montserrat",
    fontSizePx: 120,
    color: "#000000",
    bold: false,
    italic: false,
    underline: false,
    shadowEnabled: false,
    shadowBlurPx: 0,
    shadowDistancePx: 0,
    ...over,
  };
}

async function rgba(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, alpha: (x: number, y: number) => data[(Math.round(y) * info.width + Math.round(x)) * 4 + 3] };
}

// Horizontal extent of the visible pixels.
async function inkX(png: Buffer): Promise<{ min: number; max: number }> {
  const { data, width, height } = await rgba(png);
  let min = Infinity;
  let max = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 128) {
        min = Math.min(min, x);
        max = Math.max(max, x);
      }
    }
  }
  return { min, max };
}

describe("magnet frame sizes", () => {
  it("exports every size at 300 DPI in real centimeters", () => {
    const expected: Record<MagnetFrameSizeKey, [number, number]> = {
      "20x15": [2362, 1772],
      "15x10": [1772, 1181],
      "10x7.5": [1181, 886],
      "10x7": [1181, 827],
      "9x9": [1063, 1063],
    };
    for (const size of MAGNET_FRAME_SIZES) {
      const [w, h] = expected[size.key];
      expect(magnetExportDimensions("landscape", size.key)).toEqual({ widthPx: w, heightPx: h });
      expect(magnetExportDimensions("portrait", size.key)).toEqual({ widthPx: h, heightPx: w });
    }
  });

  it("a design saved before sizes is 20x15", () => {
    expect(magnetExportDimensions("landscape", undefined)).toEqual({ widthPx: 2362, heightPx: 1772 });
    expect(magnetExportScale(undefined)).toBe(magnetExportScale("20x15"));
  });

  it("keeps the 20x15 scale the export always used", () => {
    expect(magnetExportScale("20x15")).toBeCloseTo(300 / (80 * 2.54), 12);
  });

  it("scales design px to the export canvas of every size", () => {
    for (const size of MAGNET_FRAME_SIZES) {
      for (const o of ["landscape", "portrait"] as const) {
        const design = magnetDesignDimensions(o, size.key);
        const exp = magnetExportDimensions(o, size.key);
        const s = magnetExportScale(size.key);
        expect(Math.abs(design.widthPx * s - exp.widthPx)).toBeLessThanOrEqual(1);
        expect(Math.abs(design.heightPx * s - exp.heightPx)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("magnet text effects", () => {
  it("maps the shadow color, its 55% alpha and the editor's blur (a CSS radius, sigma = blur / 2)", () => {
    const fx = magnetTextEffects(textEl({ shadowEnabled: true, shadowColor: "#e63946", shadowDistancePx: 6, shadowBlurPx: 4 }), 2);
    expect(fx.shadows).toEqual([{ dx: 6, dy: 6, blur: 4, rgb: [230, 57, 70], alpha: 0.55 }]);
    expect(fx.unitPx).toBe(2);
  });

  it("a shadow without a color is black, and no shadow when it's off", () => {
    expect(magnetTextEffects(textEl({ shadowEnabled: true, shadowDistancePx: 3, shadowBlurPx: 2 }), 1).shadows[0].rgb).toEqual([0, 0, 0]);
    expect(magnetTextEffects(textEl({ shadowColor: "#ff0000" }), 1).shadows).toEqual([]);
  });

  it("an outline only when it has a width, black by default", () => {
    expect(magnetTextEffects(textEl({ strokeWidth: 3 }), 1)).toMatchObject({ strokeWidth: 3, strokeColor: "#000000" });
    expect(magnetTextEffects(textEl({ strokeWidth: 0, strokeColor: "#ff0000" }), 1).strokeWidth).toBeUndefined();
  });
});

describe("magnet frame render", () => {
  const settings = (sizeKey: MagnetFrameSizeKey): MagnetFrameSettings => ({ ...DEFAULT_MAGNET_FRAME_SETTINGS, sizeKey, textureId: null });

  it("renders a 10x7 frame at its size, with a transparent window and an opaque mat", async () => {
    const s = settings("10x7");
    const png = await renderMagnetFramePng("landscape", { elements: [textEl({ yPct: 95, fontSizePx: 60 })], settings: s, customTextureImage: null, customElementBuffers: new Map() });
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height, meta.density]).toEqual([1181, 827, 300]);
    const img = await rgba(png);
    const inset = getMatInsetPct("landscape", "10x7", s.borderRatioPct, s.bottomBorderRatioPct);
    expect(img.alpha(img.width / 2, img.height / 2)).toBe(0);
    expect(img.alpha(((inset.xPct / 100) * img.width) / 2, img.height / 2)).toBe(255);
    expect(img.alpha(2, 2)).toBe(255);
  }, 20000);

  it("a square size has one frame: portrait renders the same as landscape", async () => {
    const s = settings("9x9");
    const [l, p] = await Promise.all([renderMagnetFrameBase("landscape", s), renderMagnetFrameBase("portrait", s)]);
    expect(p.equals(l)).toBe(true);
  }, 20000);

  it("letter spacing widens the text by the gaps between its letters, centered like CSS", async () => {
    const size = "10x7";
    const s = magnetExportScale(size);
    const plain = await inkX(await composeMagnetFrameElements([textEl()], "landscape", size));
    const spaced = await inkX(await composeMagnetFrameElements([textEl({ letterSpacing: 20 })], "landscape", size));
    // "Love": 3 gaps between the letters. The spacing after the last letter is empty, so the ink
    // moves left by half of it.
    expect(spaced.max - spaced.min - (plain.max - plain.min)).toBeCloseTo(3 * 20 * s, -0.5);
    expect((spaced.min + spaced.max) / 2 - (plain.min + plain.max) / 2).toBeCloseTo(-10 * s, -0.5);
  }, 20000);

  it("the outline grows the text by its width on each side", async () => {
    const size = "10x7";
    const s = magnetExportScale(size);
    const plain = await inkX(await composeMagnetFrameElements([textEl()], "landscape", size));
    const outlined = await inkX(await composeMagnetFrameElements([textEl({ strokeWidth: 5, strokeColor: "#ff0000" })], "landscape", size));
    expect(plain.min - outlined.min).toBeCloseTo(5 * s, -0.5);
    expect(outlined.max - plain.max).toBeCloseTo(5 * s, -0.5);
  }, 20000);

  it("the same design is the same share of the frame at every size", async () => {
    const el = textEl({ letterSpacing: 10, strokeWidth: 3 });
    const big = await inkX(await composeMagnetFrameElements([el], "landscape", "20x15"));
    const small = await inkX(await composeMagnetFrameElements([el], "landscape", "10x7.5"));
    const ratio = magnetExportDimensions("landscape", "20x15").widthPx / magnetExportDimensions("landscape", "10x7.5").widthPx;
    expect(Math.abs(big.min / ratio - small.min)).toBeLessThanOrEqual(2);
    expect(Math.abs(big.max / ratio - small.max)).toBeLessThanOrEqual(2);
  }, 20000);
});

describe("magnet frame QR code", () => {
  const EVENT = "3f2a9c1e-7b4d-4e8f-9a01-23456789abcd";
  const qrContext = { eventId: EVENT, portfolioSlug: "gilberto" };
  const settings = (sizeKey: MagnetFrameSizeKey): MagnetFrameSettings => ({ ...DEFAULT_MAGNET_FRAME_SETTINGS, sizeKey, textureId: null });

  // The frame as printed: over a photo (here flat white, or black for the worst case behind the
  // code's corner), read back like a phone would.
  async function decode(png: Buffer, background = "#ffffff"): Promise<string | null> {
    const { data, info } = await sharp(png).flatten({ background }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height)?.data ?? null;
  }

  const minQr = (sizeKey: MagnetFrameSizeKey, over: Partial<MagnetFrameQrElement> = {}): MagnetFrameQrElement => ({
    ...newQrElement("gallery", { sizeKey, orientation: "landscape", id: "qr" }),
    sizePct: qrMinSizePct(sizeKey),
    ...over,
  });

  it.each(["10x7", "20x15"] as const)("a %s frame with a QR at the minimum size (2 cm) scans to the event's guest link", async (sizeKey) => {
    const png = await renderMagnetFramePng("landscape", { elements: [minQr(sizeKey)], settings: settings(sizeKey), customTextureImage: null, customElementBuffers: new Map(), qrContext });
    expect(await decode(png)).toBe(magnetGuestUrl(EVENT));
    expect(await decode(png, "#000000")).toBe(magnetGuestUrl(EVENT));
  }, 30000);

  it("on a dark mat, turned, in the portrait frame, it still scans", async () => {
    const s = { ...settings("10x7.5"), frameColor: "#1c2a4a", frameColorOpacity: 100 };
    const el = { ...minQr("10x7.5", { rotation: 12, target: "url", url: "instagram.com/gilberto.studio" }), ...{ xPct: 50, yPct: 80 } };
    const png = await renderMagnetFramePng("portrait", { elements: [el], settings: s, customTextureImage: null, customElementBuffers: new Map(), qrContext });
    expect(await decode(png)).toBe("https://instagram.com/gilberto.studio");
  }, 30000);

  it("draws sharp modules: only the two colors, each module whole pixels at 300 DPI", () => {
    const url = magnetGuestUrl(EVENT)!;
    const sizePx = 236; // 2 cm at 300 DPI
    const { data } = qrPixels(url, sizePx, "#1c2a4a", "#f5efe6");
    const colors = new Set<string>();
    for (let i = 0; i < data.length; i += 4) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`);
    expect([...colors].sort()).toEqual(["245,239,230,255", "28,42,74,255"]);
    // The top-left finder pattern starts right after the quiet zone, and every module is 7 or 8 px.
    const n = qrSquareModules(qrMatrix(url));
    const start = Math.ceil((QR_QUIET_ZONE_MODULES * sizePx) / n - 0.5);
    const at = (x: number, y: number) => data[(y * sizePx + x) * 4];
    expect(at(start, start)).toBe(28);
    expect(at(start - 1, start)).toBe(245);
    let run = 0;
    for (let x = start; at(x, start) === 28; x++) run++;
    // The finder's top row is 7 dark modules.
    expect(run).toBeGreaterThanOrEqual(7 * 7);
    expect(run).toBeLessThanOrEqual(7 * 8);
  });

  it("is left out of the file while it has nothing to open", async () => {
    const [noEvent, empty] = await Promise.all([
      composeMagnetFrameElements([minQr("10x7")], "landscape", "10x7", new Map(), { eventId: null, portfolioSlug: null }),
      composeMagnetFrameElements([minQr("10x7", { target: "url", url: "" })], "landscape", "10x7", new Map(), qrContext),
    ]);
    for (const png of [noEvent, empty]) {
      const { data } = await rgba(png);
      expect(data.some((v, i) => i % 4 === 3 && v > 0)).toBe(false);
    }
  }, 20000);

  it("is centered where the editor puts it, at its size", async () => {
    const el = minQr("15x10", { xPct: 30, yPct: 70, sizePct: 25 });
    const png = await composeMagnetFrameElements([el], "landscape", "15x10", new Map(), qrContext);
    const { width, height, alpha } = await rgba(png);
    const side = Math.round(0.25 * Math.min(width, height));
    const cx = 0.3 * width;
    const cy = 0.7 * height;
    expect(alpha(cx - side / 2 + 1, cy)).toBe(255);
    expect(alpha(cx + side / 2 - 1, cy)).toBe(255);
    expect(alpha(cx - side / 2 - 2, cy)).toBe(0);
    expect(alpha(cx, cy + side / 2 + 2)).toBe(0);
  }, 20000);

  it("the PSD has the code as its own pixel layer named QR", async () => {
    const psd = await renderMagnetFramePsd("landscape", {
      elements: [textEl({ yPct: 95, fontSizePx: 60 }), minQr("10x7")],
      settings: settings("10x7"),
      customTextureImage: null,
      customElementBuffers: new Map(),
      qrContext,
    });
    const doc = readPsd(psd, { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
    const qrLayers = (doc.children ?? []).filter((l) => l.name === "QR");
    expect(qrLayers).toHaveLength(1);
    const side = qrLayers[0].right! - qrLayers[0].left!;
    expect(Math.abs(side - Math.round((2 / 2.54) * 300))).toBeLessThanOrEqual(2);
    expect(qrLayers[0].text).toBeUndefined();
  }, 30000);

  it("the PSD leaves out a QR with nothing to open", async () => {
    const psd = await renderMagnetFramePsd("landscape", {
      elements: [minQr("10x7")],
      settings: settings("10x7"),
      customTextureImage: null,
      customElementBuffers: new Map(),
      qrContext: { eventId: null, portfolioSlug: null },
    });
    const doc = readPsd(psd, { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
    expect((doc.children ?? []).some((l) => l.name === "QR")).toBe(false);
  }, 30000);
});

describe("loadMagnetDesign", () => {
  function fakeSupabase(row: Record<string, unknown>, photographer: Record<string, unknown> | null = null) {
    const chain = (data: unknown) => {
      const c = { select: () => c, eq: () => c, maybeSingle: async () => ({ data }) };
      return c;
    };
    return { from: (table: string) => chain(table === "photographers" ? photographer : row) } as never;
  }
  const row = (frame_settings: Partial<MagnetFrameSettings>) => ({
    id: "d",
    photographer_id: "u",
    landscape_elements: [textEl({ id: "land" })],
    portrait_elements: [textEl({ id: "port" })],
    frame_settings: { ...DEFAULT_MAGNET_FRAME_SETTINGS, ...frame_settings },
  });

  it("a square size returns its one landscape frame for either orientation", async () => {
    const design = await loadMagnetDesign(fakeSupabase(row({ sizeKey: "9x9" })), "u", "d", "portrait");
    expect(design?.orientation).toBe("landscape");
    expect(design?.elements.map((e) => e.id)).toEqual(["land"]);
  });

  it("other sizes return the orientation asked for, and a design without a size is 20x15", async () => {
    const legacy = row({});
    delete (legacy.frame_settings as Partial<MagnetFrameSettings>).sizeKey;
    const design = await loadMagnetDesign(fakeSupabase(legacy), "u", "d", "portrait");
    expect(design?.orientation).toBe("portrait");
    expect(design?.elements.map((e) => e.id)).toEqual(["port"]);
    expect(design?.settings.sizeKey).toBe("20x15");
  });

  it("gives a QR its context: the frame's event, and the portfolio only when it's on", async () => {
    const qr = newQrElement("portfolio", { sizeKey: "20x15", orientation: "landscape", id: "q" });
    const design = { ...row({}), event_id: "e1", landscape_elements: [qr] };
    const on = await loadMagnetDesign(fakeSupabase(design, { portfolio_slug: "studio", portfolio_enabled: true }), "u", "d", "landscape");
    expect(on?.qrContext).toEqual({ eventId: "e1", portfolioSlug: "studio" });
    const off = await loadMagnetDesign(fakeSupabase(design, { portfolio_slug: "studio", portfolio_enabled: false }), "u", "d", "landscape");
    expect(off?.qrContext).toEqual({ eventId: "e1", portfolioSlug: null });
    const noQr = await loadMagnetDesign(fakeSupabase({ ...row({}), event_id: null }, { portfolio_slug: "studio", portfolio_enabled: true }), "u", "d", "landscape");
    expect(noQr?.qrContext).toEqual({ eventId: null, portfolioSlug: null });
  });
});
