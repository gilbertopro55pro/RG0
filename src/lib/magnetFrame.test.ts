import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { composeMagnetFrameElements, magnetTextEffects, renderMagnetFrameBase, renderMagnetFramePng } from "@/lib/magnetFrame";
import { loadMagnetDesign } from "@/lib/magnetFrameLoad";
import {
  DEFAULT_MAGNET_FRAME_SETTINGS,
  MAGNET_FRAME_SIZES,
  getMatInsetPct,
  magnetDesignDimensions,
  magnetExportDimensions,
  magnetExportScale,
} from "@/lib/magnetFrameShared";
import type { MagnetFrameElement, MagnetFrameSettings, MagnetFrameSizeKey } from "@/lib/types";

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

describe("loadMagnetDesign", () => {
  function fakeSupabase(row: Record<string, unknown>) {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row }) };
    return { from: () => chain } as never;
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
});
