"use client";

import { useEffect, useRef, useState } from "react";
import { ALBUM_FONTS, ALBUM_FONT_CLASS_NAMES, albumFontFamilyCss } from "@/lib/albumFonts";
import { ALBUM_ORNAMENTS, findOrnament, ornamentDataUrl } from "@/lib/albumOrnaments";
import { MAGNET_FRAME_TEXTURES, findMagnetFrameTexture, textureDataUrl } from "@/lib/magnetFrameTextures";
import { MAGNET_FRAME_FLORALS, findMagnetFrameFloral } from "@/lib/magnetFrameFlorals";
import { MAGNET_FRAME_DIMENSIONS, DEFAULT_MAGNET_FRAME_SETTINGS, getMatInsetPct, getCutoutRadiusPx } from "@/lib/magnetFrameShared";
import type { MagnetFrameElement, MagnetFrameDesignRow, MagnetFrameSettings, MagnetFrameCustomTextureRow, MagnetFrameCustomElementRow } from "@/lib/types";
import { IconArrowUp, IconArrowDown, IconArrowLeft, IconArrowRight } from "@/components/icons/NavIcons";

const COLOR_SWATCHES = [
  { label: "שחור", value: "#111111" },
  { label: "לבן", value: "#ffffff" },
  { label: "זהב", value: "#c9a84c" },
  { label: "בורדו", value: "#7a1f2b" },
  { label: "כחול כהה", value: "#1c2a4a" },
  { label: "ורוד עתיק", value: "#c98a8a" },
];

const ELEMENT_TABS: { key: "symbols" | "floral" | "geometric" | "vintage" | "watercolor" | "custom"; label: string }[] = [
  { key: "symbols", label: "סמלים" },
  { key: "floral", label: "פרחוני" },
  { key: "watercolor", label: "פרחי מים" },
  { key: "geometric", label: "גיאומטרי" },
  { key: "vintage", label: "וינטג׳" },
  { key: "custom", label: "האלמנטים שלי" },
];

type TabKey = "elements" | "texture" | "settings";

function clamp(n: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, n));
}

function newTextElement(): MagnetFrameElement {
  return {
    id: crypto.randomUUID(),
    type: "text",
    text: "רותם & דניאל",
    xPct: 50,
    yPct: 85,
    fontKey: "heebo",
    fontSizePx: 72,
    color: "#2e3142",
    bold: true,
    italic: false,
    underline: false,
    shadowEnabled: false,
    shadowBlurPx: 6,
    shadowDistancePx: 3,
  };
}

// The outer card edge stays crisp — no shadow of its own — matching renderMagnetFrameBase, which
// never bleeds anything past the card's own square boundary. The mat's own fill color is a plain
// white/frameColor mix (an inline backgroundColor), not a separate overlay div — one flat color is
// all a card needs either way.
function matCardStyle(settings: MagnetFrameSettings): React.CSSProperties {
  const ratio = Math.max(0, Math.min(1, settings.frameColorOpacity / 100));
  if (ratio <= 0) return { background: "#ffffff" };
  const hex = settings.frameColor.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const r = parseInt(full.slice(0, 2), 16) || 255;
  const g = parseInt(full.slice(2, 4), 16) || 255;
  const b = parseInt(full.slice(4, 6), 16) || 255;
  const mix = (channel: number) => Math.round(255 + (channel - 255) * ratio);
  return { background: `rgb(${mix(r)},${mix(g)},${mix(b)})` };
}

// The INNER shadow lives on the cutout div as an `inset` box-shadow only, matching
// renderMagnetFrameBase's blurred boundary stroke masked to keep only the half that falls INSIDE
// the cutout — the photo side. The mat itself must stay perfectly crisp/unshadowed (confirmed: the
// effect belongs entirely on the photo side of the seam, like the mat's raised edge casting a
// shadow down onto the photo beneath it, never onto its own surface), so there is deliberately no
// plain (outward) box-shadow here anymore. `scale` keeps the on-screen blur/spread proportional to
// the tiny preview canvas vs. the export's full 1600px-wide render.
function cutoutShadowStyle(settings: MagnetFrameSettings, scale: number): React.CSSProperties {
  if (!settings.shadowEnabled) return {};
  const alpha = Math.max(0, Math.min(1, settings.shadowOpacity / 100));
  const blurDisp = settings.shadowBlurPx * scale;
  const spreadDisp = settings.shadowDistancePx * scale;
  return {
    boxShadow: `inset 0 0 ${blurDisp}px ${spreadDisp}px rgba(0,0,0,${alpha})`,
    transition: "box-shadow 0.2s ease",
  };
}

function transparentCheckerStyle(): React.CSSProperties {
  return {
    backgroundImage:
      "linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(-45deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(-45deg, transparent 75%, #ddd 75%)",
    backgroundSize: "14px 14px",
    backgroundPosition: "0 0, 0 7px, 7px -7px, -7px 0px",
  };
}

// A free (native) color picker alongside the fixed swatches — the swatches stay for one-click
// common choices, this covers everything else.
function FreeColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <label className="h-6 w-6 rounded-full border-2 border-line shrink-0 cursor-pointer relative overflow-hidden" style={{ background: "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)" }} title="צבע חופשי">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
    </label>
  );
}

// A precise no-drag alternative for nudging the selected element — placed beside its delete button.
// Forced `dir="ltr"` on the row keeps these buttons in a fixed left-to-right order (up, down,
// left, right) regardless of page direction — the app shell is RTL (see layout.tsx), and RTL
// mirrors a plain flex row's child order too. The icons themselves are plain SVG geometry now
// (previously raw "←"/"→" characters, which — unlike an SVG path — sit in Unicode's bidi-mirrored
// set and would get visually flipped by the browser inside an RTL container, exactly backwards
// from what pressing them actually does to the element's position), so they always point at their
// real canvas direction without needing any mirroring behavior to reason about.
function NudgeButtons({ onNudge }: { onNudge: (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => void }) {
  const btn = "h-7 w-7 rounded-full border border-line bg-card text-ink-soft flex items-center justify-center hover:bg-chip active:scale-95 transition";
  return (
    <div className="flex items-center gap-1.5" dir="ltr">
      <button type="button" onClick={() => onNudge(0, -1)} className={btn} title="הזזה למעלה">
        <IconArrowUp className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => onNudge(0, 1)} className={btn} title="הזזה למטה">
        <IconArrowDown className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => onNudge(-1, 0)} className={btn} title="הזזה שמאלה">
        <IconArrowLeft className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => onNudge(1, 0)} className={btn} title="הזזה ימינה">
        <IconArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// The photographer edits ONE canvas (the 20x15cm "width" frame) — saving derives the 15x20cm
// "length" companion automatically (see the POST handler in api/magnet-frames/route.ts), since
// xPct/yPct/sizePct already carry over as-is between the two aspect ratios.
export default function MagnetFrameEditor() {
  const [loaded, setLoaded] = useState(false);
  const [designId, setDesignId] = useState<string | null>(null);
  const [elements, setElements] = useState<MagnetFrameElement[]>([]);
  const [frameSettings, setFrameSettings] = useState<MagnetFrameSettings>(DEFAULT_MAGNET_FRAME_SETTINGS);
  const [activeTab, setActiveTab] = useState<TabKey | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [snapGuide, setSnapGuide] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const [elementTab, setElementTab] = useState<"symbols" | "floral" | "geometric" | "vintage" | "watercolor" | "custom">("symbols");
  const [decorationColor, setDecorationColor] = useState("#2e3142");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);
  const [exportBusy, setExportBusy] = useState<"landscape" | "portrait" | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidthPx, setCanvasWidthPx] = useState(0);
  const [textureTab, setTextureTab] = useState<"builtin" | "custom">("builtin");
  const [customTextures, setCustomTextures] = useState<(MagnetFrameCustomTextureRow & { url: string | null })[]>([]);
  const [customTexturesLoaded, setCustomTexturesLoaded] = useState(false);
  const [uploadingTexture, setUploadingTexture] = useState(false);
  const [customElements, setCustomElements] = useState<(MagnetFrameCustomElementRow & { url: string | null })[]>([]);
  const [customElementsLoaded, setCustomElementsLoaded] = useState(false);
  const [uploadingElement, setUploadingElement] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/magnet-frames");
        if (res.ok) {
          const data: { design: MagnetFrameDesignRow | null } = await res.json();
          if (data.design) {
            setDesignId(data.design.id);
            // Older saved designs predate the bold/italic/underline fields — default a missing
            // `bold` to true (matching the fixed always-bold look every text element rendered with
            // before the toggle existed) so an untouched old design still looks the same; italic/
            // underline default to off either way since neither existed before at all.
            setElements(
              (data.design.landscape_elements ?? []).map((el) =>
                el.type === "text" ? { ...el, bold: el.bold ?? true, italic: el.italic ?? false, underline: el.underline ?? false } : el
              )
            );
            setFrameSettings({ ...DEFAULT_MAGNET_FRAME_SETTINGS, ...data.design.frame_settings });
            setSavedOnce(true);
          }
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Depends on `loaded`, not just []: the canvas div (and canvasRef) doesn't exist in the DOM
  // until the "!loaded return null" gate above lifts, which happens on a LATER render than this
  // component's first commit — a plain mount-only effect would fire once while canvasRef.current
  // is still null, bail out immediately, and (with an empty dep array) never get a second chance.
  useEffect(() => {
    if (!canvasRef.current) return;
    const el = canvasRef.current;
    const update = () => setCanvasWidthPx(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  const dims = MAGNET_FRAME_DIMENSIONS.landscape;
  const scale = canvasWidthPx > 0 ? canvasWidthPx / dims.widthPx : 0;
  const canvasHeightPx = canvasWidthPx * (dims.heightPx / dims.widthPx);
  const shorterDisplaySide = Math.min(canvasWidthPx || 1, canvasHeightPx || 1);
  const matInset = getMatInsetPct("landscape", frameSettings.borderRatioPct, frameSettings.bottomBorderRatioPct);
  const cutoutRadiusPx = getCutoutRadiusPx("landscape", frameSettings, canvasWidthPx);

  // The custom upload (when picked) always wins over a built-in id — same "one active, selecting
  // one clears the other" rule the settings themselves follow. The cutout div's own overflow, plus
  // the checker placeholder painted on top of it in the DOM, keeps this texture layer contained to
  // the mat without any extra clipping here — see the comment above matCardStyle.
  const activeCustomTexture = frameSettings.customTextureAssetId ? customTextures.find((t) => t.id === frameSettings.customTextureAssetId) : null;
  const activeBuiltinTexture = !frameSettings.customTextureAssetId ? findMagnetFrameTexture(frameSettings.textureId ?? undefined) : undefined;
  // CSS's unquoted url(...) closes at the FIRST unescaped ")" — and encodeURIComponent (used by
  // textureDataUrl) deliberately leaves "(" and ")" unescaped (they're in its unreserved set), so
  // every texture's own rgba(...)/rotate(...) values would truncate an unquoted url() right there,
  // silently dropping the whole background-image. Quoting it sidesteps that entirely: the encoded
  // string never contains a literal '"' (encodeURIComponent does escape those), so url("...") has
  // nothing left inside it that could prematurely end the string.
  const textureStyle: React.CSSProperties | null =
    activeCustomTexture?.url
      ? { backgroundImage: `url("${activeCustomTexture.url}")`, backgroundSize: "150px 150px", backgroundRepeat: "repeat", opacity: frameSettings.textureOpacity / 100 }
      : activeBuiltinTexture
        ? {
            backgroundImage: `url("${textureDataUrl(activeBuiltinTexture)}")`,
            backgroundSize: `${activeBuiltinTexture.tileSizePx}px ${activeBuiltinTexture.tileSizePx}px`,
            backgroundRepeat: "repeat",
            opacity: frameSettings.textureOpacity / 100,
          }
        : null;

  const selected = elements.find((e) => e.id === selectedId) ?? null;

  const updateElement = (id: string, patch: Partial<MagnetFrameElement>) => {
    setElements((prev) => prev.map((el) => (el.id === id ? ({ ...el, ...patch } as MagnetFrameElement) : el)));
  };

  // A precise, no-drag alternative to dragging — each press nudges the element by exactly 14px of
  // the actual 1600x1200 export canvas (converted to the xPct/yPct percentage space every element
  // is positioned in), regardless of how zoomed in/out the on-screen preview currently is.
  const NUDGE_STEP_X_PCT = (14 / dims.widthPx) * 100;
  const NUDGE_STEP_Y_PCT = (14 / dims.heightPx) * 100;
  const nudgeElement = (id: string, dx: -1 | 0 | 1, dy: -1 | 0 | 1) => {
    setElements((prev) =>
      prev.map((el) =>
        el.id === id
          ? { ...el, xPct: clamp(el.xPct + dx * NUDGE_STEP_X_PCT), yPct: clamp(el.yPct + dy * NUDGE_STEP_Y_PCT) }
          : el
      )
    );
  };

  const addText = () => {
    const el = newTextElement();
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  };

  const addDecoration = (ornamentId: string) => {
    const el: MagnetFrameElement = { id: crypto.randomUUID(), type: "decoration", ornamentId, xPct: 24, yPct: 24, sizePct: 16, color: decorationColor };
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  };

  const addCustomElement = (customElementAssetId: string) => {
    const el: MagnetFrameElement = { id: crypto.randomUUID(), type: "decoration", customElementAssetId, xPct: 24, yPct: 24, sizePct: 16, color: decorationColor };
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  };

  const addFloral = (floralId: string) => {
    const el: MagnetFrameElement = { id: crypto.randomUUID(), type: "decoration", floralId, xPct: 24, yPct: 24, sizePct: 28, color: decorationColor };
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  };

  const removeElement = (id: string) => {
    setElements((prev) => prev.filter((el) => el.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const loadCustomTextures = async () => {
    if (customTexturesLoaded) return;
    setCustomTexturesLoaded(true);
    try {
      const res = await fetch("/api/magnet-frames/textures");
      if (!res.ok) return;
      const data: { textures: (MagnetFrameCustomTextureRow & { url: string | null })[] } = await res.json();
      setCustomTextures(data.textures);
    } catch {
      // A failed load shouldn't block the built-in texture tab.
    }
  };

  const uploadTextureFile = async (file: File) => {
    setUploadingTexture(true);
    setError(null);
    try {
      const res = await fetch("/api/magnet-frames/textures", {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream", "x-filename": encodeURIComponent(file.name) },
        body: await file.arrayBuffer(),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "שגיאה בהעלאת הטקסטורה");
        return;
      }
      setCustomTextures((prev) => [data.texture, ...prev]);
      setFrameSettings((prev) => ({ ...prev, customTextureAssetId: data.texture.id, textureId: null }));
    } finally {
      setUploadingTexture(false);
    }
  };

  const selectBuiltinTexture = (id: string) => setFrameSettings((prev) => ({ ...prev, textureId: id, customTextureAssetId: null }));
  const selectCustomTexture = (id: string) => setFrameSettings((prev) => ({ ...prev, customTextureAssetId: id, textureId: null }));
  const clearTexture = () => setFrameSettings((prev) => ({ ...prev, textureId: null, customTextureAssetId: null }));

  const loadCustomElements = async () => {
    if (customElementsLoaded) return;
    setCustomElementsLoaded(true);
    try {
      const res = await fetch("/api/magnet-frames/elements");
      if (!res.ok) return;
      const data: { elements: (MagnetFrameCustomElementRow & { url: string | null })[] } = await res.json();
      setCustomElements(data.elements);
    } catch {
      // A failed load shouldn't block the built-in element tabs.
    }
  };

  const uploadElementFile = async (file: File) => {
    setUploadingElement(true);
    setError(null);
    try {
      const res = await fetch("/api/magnet-frames/elements", {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream", "x-filename": encodeURIComponent(file.name) },
        body: await file.arrayBuffer(),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "שגיאה בהעלאת האלמנט");
        return;
      }
      setCustomElements((prev) => [data.element, ...prev]);
    } finally {
      setUploadingElement(false);
    }
  };

  const selectElementTab = (key: (typeof ELEMENT_TABS)[number]["key"]) => {
    setElementTab(key);
    if (key === "custom") loadCustomElements();
  };

  // Snapping to the exact center (not just showing a guide near it) is what lets the photographer
  // feel the frame's middle rather than eyeball it — a few-percent catch radius around 50 that
  // pulls the element to precisely 50 once inside it, same idea as most design tools' object snap.
  const SNAP_THRESHOLD_PCT = 2;
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const rawX = clamp(((e.clientX - rect.left) / rect.width) * 100);
    const rawY = clamp(((e.clientY - rect.top) / rect.height) * 100);
    const snapX = Math.abs(rawX - 50) <= SNAP_THRESHOLD_PCT;
    const snapY = Math.abs(rawY - 50) <= SNAP_THRESHOLD_PCT;
    setSnapGuide({ x: snapX, y: snapY });
    updateElement(draggingId, { xPct: snapX ? 50 : rawX, yPct: snapY ? 50 : rawY });
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/magnet-frames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: designId, elements, frameSettings }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "שגיאה בשמירה");
        return;
      }
      setDesignId(data.design.id);
      setSavedOnce(true);
    } finally {
      setSaving(false);
    }
  };

  const download = async (orientation: "landscape" | "portrait") => {
    if (!designId || exportBusy) return;
    setExportBusy(orientation);
    setError(null);
    try {
      const res = await fetch(`/api/magnet-frames/${designId}/export?orientation=${orientation}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `מגנט-${orientation === "landscape" ? "לרוחב" : "לאורך"}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("שגיאה בהורדת הקובץ");
    } finally {
      setExportBusy(null);
    }
  };

  const toggleTab = (tab: TabKey) => setActiveTab((prev) => (prev === tab ? null : tab));

  if (!loaded) return null;

  return (
    <div className={`rounded-2xl p-4 bg-card border border-line shadow-card space-y-4 ${ALBUM_FONT_CLASS_NAMES}`}>
      <div>
        <div className="text-sm font-semibold tracking-wide mb-1">עיצוב מסגרת מגנט 🧲</div>
        <p className="text-xs leading-relaxed text-ink-soft">
          בסיס לבן פשוט במידה 20×15 ס״מ, עם שטח שקוף באמצע שבו תוכנס תמונת האירוע בהמשך. הוסיפו טקסט וגררו אלמנטים חופשי על המסגרת — בשמירה תיווצר אוטומטית גם מסגרת תואמת לאורך (15×20) עם אותו הטקסט והאלמנטים.
        </p>
      </div>

      {/* Canvas sits ABOVE the tabs/panels on purpose — whatever tab is open, its own bounded
          scroll area (below) never pushes the actual design out of view. */}
      <div
        ref={canvasRef}
        className="relative w-full overflow-hidden touch-none select-none"
        style={{ aspectRatio: `${dims.widthPx} / ${dims.heightPx}`, ...matCardStyle(frameSettings) }}
        onPointerMove={handlePointerMove}
        onPointerUp={() => {
          setDraggingId(null);
          setSnapGuide({ x: false, y: false });
        }}
        onPointerLeave={() => {
          setDraggingId(null);
          setSnapGuide({ x: false, y: false });
        }}
        onClick={() => setSelectedId(null)}
      >
        {textureStyle && <div className="absolute inset-0" style={textureStyle} />}
        {draggingId && snapGuide.x && (
          <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: "50%", width: 1, background: "var(--color-amber-deep)", boxShadow: "0 0 4px var(--color-amber-deep)", zIndex: 20 }} />
        )}
        {draggingId && snapGuide.y && (
          <div className="absolute left-0 right-0 pointer-events-none" style={{ top: "50%", height: 1, background: "var(--color-amber-deep)", boxShadow: "0 0 4px var(--color-amber-deep)", zIndex: 20 }} />
        )}
        <div
          className="absolute overflow-hidden"
          style={{
            left: `${matInset.xPct}%`,
            top: `${matInset.topPct}%`,
            right: `${matInset.xPct}%`,
            bottom: `${matInset.bottomPct}%`,
            borderRadius: cutoutRadiusPx,
            transition: "border-radius 0.2s ease",
            ...cutoutShadowStyle(frameSettings, scale),
            ...transparentCheckerStyle(),
          }}
        />
        {elements.map((el) => {
          if (el.type === "text") {
            const fontSizeDisp = el.fontSizePx * scale;
            const shadow = el.shadowEnabled ? `${el.shadowDistancePx * scale}px ${el.shadowDistancePx * scale}px ${el.shadowBlurPx * scale}px rgba(0,0,0,0.55)` : undefined;
            // Every LAYER of text (each its own independent element, with its own font/color/
            // shadow) gets a smooth animated transition when a property changes or it settles into
            // a new dropped position — except while it's actively being dragged, where a transition
            // would lag the pointer instead of tracking it 1:1.
            const smooth = draggingId !== el.id;
            return (
              <div
                key={el.id}
                className="absolute whitespace-nowrap cursor-grab"
                style={{
                  left: `${el.xPct}%`,
                  top: `${el.yPct}%`,
                  transform: "translate(-50%, -50%)",
                  fontSize: fontSizeDisp,
                  color: el.color,
                  fontFamily: albumFontFamilyCss(el.fontKey),
                  fontWeight: el.bold ? 700 : 400,
                  fontStyle: el.italic ? "italic" : "normal",
                  textDecoration: el.underline ? "underline" : "none",
                  textShadow: shadow,
                  outline: selectedId === el.id ? "2px dashed var(--color-amber-deep)" : "none",
                  outlineOffset: 4,
                  padding: 2,
                  transition: smooth ? "left 0.18s ease, top 0.18s ease, font-size 0.18s ease, color 0.18s ease, text-shadow 0.18s ease" : "none",
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  setDraggingId(el.id);
                  setSelectedId(el.id);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {el.text || "טקסט ריק"}
              </div>
            );
          }
          const ornament = el.ornamentId ? findOrnament(el.ornamentId) : undefined;
          const customUrl = el.customElementAssetId ? customElements.find((c) => c.id === el.customElementAssetId)?.url ?? undefined : undefined;
          const floral = el.floralId ? findMagnetFrameFloral(el.floralId) : undefined;
          if (!ornament && !customUrl && !floral) return null;
          const sizePx = (el.sizePct / 100) * shorterDisplaySide;
          const smoothDeco = draggingId !== el.id;
          return (
            <div
              key={el.id}
              className="absolute"
              style={{
                left: `${el.xPct}%`,
                top: `${el.yPct}%`,
                width: sizePx,
                height: sizePx,
                transform: "translate(-50%, -50%)",
                outline: selectedId === el.id ? "2px dashed var(--color-amber-deep)" : "none",
                outlineOffset: 3,
                transition: smoothDeco ? "left 0.18s ease, top 0.18s ease, width 0.18s ease, height 0.18s ease" : "none",
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                setDraggingId(el.id);
                setSelectedId(el.id);
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ornament ? ornamentDataUrl(ornament, el.color) : floral ? floral.url : customUrl} className="w-full h-full" style={{ objectFit: "contain", cursor: "grab" }} draggable={false} alt="" />
            </div>
          );
        })}
      </div>

      {selected && selected.type === "text" && (
        <div className="rounded-xl p-3 bg-chip space-y-2.5" onClick={(e) => e.stopPropagation()}>
          <textarea
            value={selected.text}
            onChange={(e) => updateElement(selected.id, { text: e.target.value })}
            rows={2}
            className="w-full rounded-lg px-3 py-2 text-sm bg-card border border-line text-ink resize-none"
            placeholder="לדוגמה: רותם & דניאל · 12.6.2026"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={selected.fontKey}
              onChange={(e) => updateElement(selected.id, { fontKey: e.target.value })}
              className="rounded-lg px-2.5 py-2 text-xs bg-card border border-line text-ink"
            >
              <optgroup label="עברית">
                {ALBUM_FONTS.filter((f) => f.category === "hebrew").map((f) => (
                  <option key={f.key} value={f.key} style={{ fontFamily: albumFontFamilyCss(f.key) }}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="אנגלית">
                {ALBUM_FONTS.filter((f) => f.category === "latin").map((f) => (
                  <option key={f.key} value={f.key} style={{ fontFamily: albumFontFamilyCss(f.key) }}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <div className="flex items-center gap-2 rounded-lg px-2.5 py-1 bg-card border border-line">
              <span className="text-[10px] text-ink-soft whitespace-nowrap">גודל</span>
              <input
                type="range"
                min={20}
                max={200}
                value={selected.fontSizePx}
                onChange={(e) => updateElement(selected.id, { fontSizePx: Number(e.target.value) })}
                className="w-full"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => updateElement(selected.id, { color: c.value })}
                className="h-6 w-6 rounded-full border-2"
                style={{ background: c.value, borderColor: selected.color === c.value ? "var(--color-sage)" : "var(--color-line)" }}
              />
            ))}
            <FreeColorPicker value={selected.color} onChange={(hex) => updateElement(selected.id, { color: hex })} />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => updateElement(selected.id, { bold: !selected.bold })}
              title="מודגש"
              className="h-8 w-8 rounded-lg border font-bold text-sm"
              style={{
                borderColor: selected.bold ? "var(--color-sage)" : "var(--color-line)",
                background: selected.bold ? "var(--color-sage-bg)" : "var(--color-card)",
                color: "var(--color-ink)",
              }}
            >
              B
            </button>
            <button
              type="button"
              onClick={() => updateElement(selected.id, { italic: !selected.italic })}
              title="נטוי"
              className="h-8 w-8 rounded-lg border italic text-sm"
              style={{
                borderColor: selected.italic ? "var(--color-sage)" : "var(--color-line)",
                background: selected.italic ? "var(--color-sage-bg)" : "var(--color-card)",
                color: "var(--color-ink)",
              }}
            >
              I
            </button>
            <button
              type="button"
              onClick={() => updateElement(selected.id, { underline: !selected.underline })}
              title="קו תחתון"
              className="h-8 w-8 rounded-lg border underline text-sm"
              style={{
                borderColor: selected.underline ? "var(--color-sage)" : "var(--color-line)",
                background: selected.underline ? "var(--color-sage-bg)" : "var(--color-card)",
                color: "var(--color-ink)",
              }}
            >
              U
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
            <input type="checkbox" checked={selected.shadowEnabled} onChange={(e) => updateElement(selected.id, { shadowEnabled: e.target.checked })} />
            צל לטקסט
          </label>
          {selected.shadowEnabled && (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 rounded-lg px-2.5 py-1 bg-card border border-line">
                <span className="text-[10px] text-ink-soft whitespace-nowrap">טשטוש</span>
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={selected.shadowBlurPx}
                  onChange={(e) => updateElement(selected.id, { shadowBlurPx: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div className="flex items-center gap-2 rounded-lg px-2.5 py-1 bg-card border border-line">
                <span className="text-[10px] text-ink-soft whitespace-nowrap">מרחק</span>
                <input
                  type="range"
                  min={0}
                  max={15}
                  value={selected.shadowDistancePx}
                  onChange={(e) => updateElement(selected.id, { shadowDistancePx: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => removeElement(selected.id)} className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-rose-bg text-rose shrink-0">
              🗑 מחיקת הטקסט
            </button>
            <NudgeButtons onNudge={(dx, dy) => nudgeElement(selected.id, dx, dy)} />
          </div>
        </div>
      )}

      {selected && selected.type === "decoration" && (
        <div className="rounded-xl p-3 bg-chip space-y-2.5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 rounded-lg px-2.5 py-1 bg-card border border-line">
            <span className="text-[10px] text-ink-soft whitespace-nowrap">גודל</span>
            <input
              type="range"
              min={5}
              max={45}
              value={selected.sizePct}
              onChange={(e) => updateElement(selected.id, { sizePct: Number(e.target.value) })}
              className="w-full"
            />
          </div>
          {!selected.customElementAssetId && !selected.floralId && (
            <div className="flex items-center gap-1.5">
              {["#2e3142", "#c9a84c", "#ffffff", "#7a1f2b", "#52c98f"].map((c) => (
                <button
                  key={c}
                  onClick={() => updateElement(selected.id, { color: c })}
                  className="h-6 w-6 rounded-full border-2"
                  style={{ background: c, borderColor: selected.color === c ? "var(--color-sage)" : "var(--color-line)" }}
                />
              ))}
              <FreeColorPicker value={selected.color} onChange={(hex) => updateElement(selected.id, { color: hex })} />
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => removeElement(selected.id)} className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-rose-bg text-rose shrink-0">
              🗑 מחיקת האלמנט
            </button>
            <NudgeButtons onNudge={(dx, dy) => nudgeElement(selected.id, dx, dy)} />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5">
        <button onClick={addText} className="shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold bg-ink text-white">
          + הוספת טקסט
        </button>
        <button
          onClick={() => toggleTab("elements")}
          className="shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold"
          style={{ background: activeTab === "elements" ? "var(--color-amber-deep)" : "var(--color-chip)", color: activeTab === "elements" ? "#fff" : "var(--color-ink)" }}
        >
          🎀 אלמנטים
        </button>
        <button
          onClick={() => toggleTab("texture")}
          className="shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold"
          style={{ background: activeTab === "texture" ? "var(--color-amber-deep)" : "var(--color-chip)", color: activeTab === "texture" ? "#fff" : "var(--color-ink)" }}
        >
          🖼️ טקסטורה
        </button>
        <button
          onClick={() => toggleTab("settings")}
          className="shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold"
          style={{ background: activeTab === "settings" ? "var(--color-amber-deep)" : "var(--color-chip)", color: activeTab === "settings" ? "#fff" : "var(--color-ink)" }}
        >
          ⚙️ הגדרות מסגרת
        </button>
      </div>

      {activeTab && (
        <div className="rounded-xl border border-line bg-paper p-3 max-h-[45vh] overflow-y-auto">
          {activeTab === "settings" && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 rounded-lg px-2.5 py-1 bg-card border border-line">
                <span className="text-[10px] text-ink-soft whitespace-nowrap w-20 shrink-0">עובי מסגרת</span>
                <input
                  type="range"
                  min={4}
                  max={25}
                  value={frameSettings.borderRatioPct}
                  onChange={(e) => setFrameSettings((prev) => ({ ...prev, borderRatioPct: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>
              <div className="flex items-center gap-2 rounded-lg px-2.5 py-1 bg-card border border-line">
                <span className="text-[10px] text-ink-soft whitespace-nowrap w-20 shrink-0">עובי צלע תחתונה</span>
                <input
                  type="range"
                  min={4}
                  max={35}
                  value={frameSettings.bottomBorderRatioPct}
                  onChange={(e) => setFrameSettings((prev) => ({ ...prev, bottomBorderRatioPct: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>
              <div className="flex items-center gap-2 rounded-lg px-2.5 py-1 bg-card border border-line">
                <span className="text-[10px] text-ink-soft whitespace-nowrap w-20 shrink-0">עיגול פינות</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={frameSettings.cornerRadiusPct}
                  onChange={(e) => setFrameSettings((prev) => ({ ...prev, cornerRadiusPct: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>

              <div className="pt-1.5 border-t border-line space-y-1.5">
                <span className="text-xs font-semibold">צבע המסגרת</span>
                <div className="flex items-center gap-1.5">
                  {COLOR_SWATCHES.map((c) => (
                    <button
                      key={c.value}
                      title={c.label}
                      onClick={() => setFrameSettings((prev) => ({ ...prev, frameColor: c.value }))}
                      className="h-6 w-6 rounded-full border-2"
                      style={{ background: c.value, borderColor: frameSettings.frameColor === c.value ? "var(--color-sage)" : "var(--color-line)" }}
                    />
                  ))}
                  <FreeColorPicker value={frameSettings.frameColor} onChange={(hex) => setFrameSettings((prev) => ({ ...prev, frameColor: hex }))} />
                </div>
                <div className="flex items-center gap-2 rounded-lg px-2.5 py-1 bg-card border border-line">
                  <span className="text-[10px] text-ink-soft whitespace-nowrap w-20 shrink-0">שקיפות הצבע</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={frameSettings.frameColorOpacity}
                    onChange={(e) => setFrameSettings((prev) => ({ ...prev, frameColorOpacity: Number(e.target.value) }))}
                    className="w-full"
                  />
                </div>
              </div>

              <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer pt-1.5 border-t border-line">
                <input
                  type="checkbox"
                  checked={frameSettings.shadowEnabled}
                  onChange={(e) => setFrameSettings((prev) => ({ ...prev, shadowEnabled: e.target.checked }))}
                />
                הצללה בחלק הפנימי של המסגרת
              </label>
              {frameSettings.shadowEnabled && (
                <>
                  <div className="flex items-center gap-2 rounded-lg px-2.5 py-1 bg-card border border-line">
                    <span className="text-[10px] text-ink-soft whitespace-nowrap w-20 shrink-0">עוצמה</span>
                    <input
                      type="range"
                      min={0}
                      max={80}
                      value={frameSettings.shadowOpacity}
                      onChange={(e) => setFrameSettings((prev) => ({ ...prev, shadowOpacity: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                  <div className="flex items-center gap-2 rounded-lg px-2.5 py-1 bg-card border border-line">
                    <span className="text-[10px] text-ink-soft whitespace-nowrap w-20 shrink-0">טשטוש</span>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={frameSettings.shadowBlurPx}
                      onChange={(e) => setFrameSettings((prev) => ({ ...prev, shadowBlurPx: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                  <div className="flex items-center gap-2 rounded-lg px-2.5 py-1 bg-card border border-line">
                    <span className="text-[10px] text-ink-soft whitespace-nowrap w-20 shrink-0">מרחק</span>
                    <input
                      type="range"
                      min={0}
                      max={30}
                      value={frameSettings.shadowDistancePx}
                      onChange={(e) => setFrameSettings((prev) => ({ ...prev, shadowDistancePx: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "texture" && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <button
                    onClick={() => setTextureTab("builtin")}
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{ background: textureTab === "builtin" ? "var(--color-amber-deep)" : "var(--color-chip)", color: textureTab === "builtin" ? "#fff" : "var(--color-ink-soft)" }}
                  >
                    40 טקסטורות
                  </button>
                  <button
                    onClick={() => {
                      setTextureTab("custom");
                      loadCustomTextures();
                    }}
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{ background: textureTab === "custom" ? "var(--color-amber-deep)" : "var(--color-chip)", color: textureTab === "custom" ? "#fff" : "var(--color-ink-soft)" }}
                  >
                    הטקסטורות שלי
                  </button>
                </div>
                {(frameSettings.textureId || frameSettings.customTextureAssetId) && (
                  <button onClick={clearTexture} className="text-[11px] text-ink-soft underline shrink-0">
                    ללא טקסטורה
                  </button>
                )}
              </div>
              {(frameSettings.textureId || frameSettings.customTextureAssetId) && (
                <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-card border border-line">
                  <span className="text-xs text-ink-soft whitespace-nowrap">שקיפות</span>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    value={frameSettings.textureOpacity}
                    onChange={(e) => setFrameSettings((prev) => ({ ...prev, textureOpacity: Number(e.target.value) }))}
                    className="w-full"
                  />
                </div>
              )}
              {textureTab === "builtin" ? (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {MAGNET_FRAME_TEXTURES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => selectBuiltinTexture(t.id)}
                      title={t.label}
                      className="rounded-lg border-2 aspect-square overflow-hidden bg-white"
                      style={{ borderColor: frameSettings.textureId === t.id ? "var(--color-amber-deep)" : "var(--color-line)" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={textureDataUrl(t)} alt={t.label} className="w-full h-full" style={{ objectFit: "cover" }} draggable={false} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="flex items-center justify-center rounded-lg border border-dashed border-line p-3 text-center bg-card cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingTexture}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) uploadTextureFile(file);
                      }}
                    />
                    <span className="text-xs font-semibold text-ink-soft">{uploadingTexture ? "מעלה..." : "+ העלאת טקסטורה משלי"}</span>
                  </label>
                  {customTextures.length > 0 && (
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {customTextures.map(
                        (t) =>
                          t.url && (
                            <button
                              key={t.id}
                              onClick={() => selectCustomTexture(t.id)}
                              title={t.original_filename}
                              className="rounded-lg border-2 aspect-square overflow-hidden bg-white"
                              style={{ borderColor: frameSettings.customTextureAssetId === t.id ? "var(--color-amber-deep)" : "var(--color-line)" }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={t.url} alt={t.original_filename} className="w-full h-full" style={{ objectFit: "cover" }} draggable={false} />
                            </button>
                          )
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "elements" && (
            <div>
              <div className="flex flex-wrap gap-1 mb-2">
                {ELEMENT_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => selectElementTab(tab.key)}
                    className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                    style={{
                      background: elementTab === tab.key ? "var(--color-amber-deep)" : "var(--color-chip)",
                      color: elementTab === tab.key ? "#fff" : "var(--color-ink-soft)",
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {elementTab !== "watercolor" && elementTab !== "custom" && (
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[10px] text-ink-soft">צבע</span>
                  {["#2e3142", "#c9a84c", "#ffffff", "#7a1f2b", "#52c98f"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setDecorationColor(c)}
                      className="h-5 w-5 rounded-full border"
                      style={{ background: c, borderColor: decorationColor === c ? "var(--color-amber-deep)" : "var(--color-line)" }}
                    />
                  ))}
                  <FreeColorPicker value={decorationColor} onChange={setDecorationColor} />
                </div>
              )}
              {elementTab === "custom" ? (
                <div className="space-y-2">
                  <label className="flex items-center justify-center rounded-lg border border-dashed border-line p-3 text-center bg-card cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingElement}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) uploadElementFile(file);
                      }}
                    />
                    <span className="text-xs font-semibold text-ink-soft">{uploadingElement ? "מעלה..." : "+ העלאת אלמנט משלי"}</span>
                  </label>
                  <p className="text-[10px] text-ink-soft">האלמנטים שמעלים כאן נשמרים ונשארים זמינים גם בעיצובים הבאים.</p>
                  {customElements.length > 0 && (
                    <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 max-h-[40vh] overflow-y-auto">
                      {customElements.map(
                        (ce) =>
                          ce.url && (
                            <button
                              key={ce.id}
                              onClick={() => addCustomElement(ce.id)}
                              title={ce.original_filename}
                              className="rounded-lg border border-line p-1 bg-chip aspect-square flex items-center justify-center"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={ce.url} className="w-full h-full" style={{ objectFit: "contain" }} alt="" />
                            </button>
                          )
                      )}
                    </div>
                  )}
                </div>
              ) : elementTab === "watercolor" ? (
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 max-h-[40vh] overflow-y-auto">
                  {MAGNET_FRAME_FLORALS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => addFloral(f.id)}
                      title={f.label}
                      className="rounded-lg border border-line p-1 bg-chip aspect-square flex items-center justify-center"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} className="w-full h-full" style={{ objectFit: "contain" }} alt="" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 max-h-[40vh] overflow-y-auto">
                  {ALBUM_ORNAMENTS.filter((o) => o.category === elementTab).map((o) => (
                    <button
                      key={o.id}
                      onClick={() => addDecoration(o.id)}
                      title={o.label}
                      className="rounded-lg border border-line p-1 bg-chip aspect-square flex items-center justify-center"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ornamentDataUrl(o, decorationColor)} className="w-full h-full" style={{ objectFit: "contain" }} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-2.5 flex-wrap">
        <button onClick={save} disabled={saving} className="rounded-lg px-4 py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60">
          {saving ? "שומר..." : "💾 שמירה"}
        </button>
        {designId && (
          <>
            <button onClick={() => download("landscape")} disabled={!!exportBusy} className="rounded-lg px-3.5 py-2 text-xs font-semibold bg-chip text-ink disabled:opacity-60">
              {exportBusy === "landscape" ? "מוריד..." : "⬇ מסגרת לרוחב (20×15)"}
            </button>
            <button onClick={() => download("portrait")} disabled={!!exportBusy} className="rounded-lg px-3.5 py-2 text-xs font-semibold bg-chip text-ink disabled:opacity-60">
              {exportBusy === "portrait" ? "מוריד..." : "⬇ מסגרת לאורך (15×20)"}
            </button>
          </>
        )}
      </div>
      {savedOnce && !designId && <p className="text-[11px] text-ink-soft">השמירה נכשלה — נסו שוב.</p>}
    </div>
  );
}
