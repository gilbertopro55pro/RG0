"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ALBUM_FONTS, ALBUM_FONT_CLASS_NAMES, albumFontFamilyCss } from "@/lib/albumFonts";
import { ALBUM_ORNAMENTS, ornamentDataUrl } from "@/lib/albumOrnaments";
import { MAGNET_FRAME_TEXTURES, textureDataUrl } from "@/lib/magnetFrameTextures";
import { MAGNET_FRAME_FLORALS } from "@/lib/magnetFrameFlorals";
import { MAGNET_DIGIT_STYLES, magnetDigitId, magnetDigitUrl } from "@/lib/magnetFrameDigits";
import {
  DEFAULT_MAGNET_FRAME_SETTINGS,
  MAGNET_DECORATION_SIZE_RANGE,
  MAGNET_FRAME_SIZES,
  MAGNET_TEXT_SIZE_RANGE,
  getMatInsetPct,
  isSquareMagnetSize,
  magnetDesignDimensions,
  magnetSafeMarginPct,
  magnetSizeLabel,
} from "@/lib/magnetFrameShared";
import {
  canMoveLayer,
  duplicateElement,
  frameSnapLines,
  freeTextSpot,
  historyCommit,
  historyRedo,
  historyStart,
  historyUndo,
  moveLayer,
  pointerAngleDeg,
  resizeFromDrag,
  snapRotation,
  snapValue,
  type History,
  type LayerMove,
} from "@/lib/magnetFrameEditing";
import type {
  FrameOrientation,
  MagnetFrameElement,
  MagnetFrameTextElement,
  MagnetFrameDesignRow,
  MagnetFrameSettings,
  MagnetFrameCustomTextureRow,
  MagnetFrameCustomElementRow,
} from "@/lib/types";
import MagnetFramePreview, { magnetTextStyle, type MagnetFramePreviewHandle } from "@/components/magnetFrame/MagnetFramePreview";
import QrPanel from "@/components/magnetFrame/QrPanel";
import InvitationPalette from "@/components/magnetFrame/InvitationPalette";
import ClientApprovalBar from "@/components/magnetFrame/ClientApprovalBar";
import { qrMinSizePct } from "@/lib/magnetQr";
import { IconArrowUp, IconArrowDown, IconArrowLeft, IconArrowRight } from "@/components/icons/NavIcons";
import { IconRotateDevice } from "@/components/icons/AlbumIcons";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";
import { takeResumeState, useBusy, useResumeState } from "@/lib/updateResume";

const COLOR_SWATCHES = [
  { label: "שחור", value: "#111111" },
  { label: "לבן", value: "#ffffff" },
  { label: "זהב", value: "#c9a84c" },
  { label: "בורדו", value: "#7a1f2b" },
  { label: "כחול כהה", value: "#1c2a4a" },
  { label: "ורוד עתיק", value: "#c98a8a" },
];

type ElementTabKey = "symbols" | "digits" | "floral" | "geometric" | "vintage" | "watercolor" | "custom";

const ELEMENT_TABS: { key: ElementTabKey; label: string }[] = [
  { key: "symbols", label: "סמלים" },
  { key: "digits", label: "ספרות" },
  { key: "floral", label: "פרחוני" },
  { key: "watercolor", label: "פרחי מים" },
  { key: "geometric", label: "גיאומטרי" },
  { key: "vintage", label: "וינטג׳" },
  { key: "custom", label: "האלמנטים שלי" },
];

// The panels on the editor's side, one open at a time (the owner's "solo" request, 2026-10-05).
type PanelKey = "text" | "elements" | "digits" | "qr" | "texture" | "settings";

// A size like "20×15" inside Hebrew text is laid out right-to-left and reads "15×20" (the owner saw
// the landscape button as "(15X20)"). Isolating it left-to-right keeps width × height in order.
function Dim({ children }: { children: string }) {
  return (
    <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
      {children}
    </span>
  );
}

function DownloadGlyph() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

// Renders a translated string whose {name} placeholders are sizes, each isolated in a <Dim>.
function withDims(text: string, dims: Record<string, string>) {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return m && dims[m[1]] ? <Dim key={i}>{dims[m[1]]}</Dim> : part;
  });
}

// The "ספרות" tab: 0–10 in four styles. Each one is added as a text element in the style's font, so
// it resizes, recolors, moves and takes a shadow like any text, and the export already renders it.
// Latin-subset fonts only: the Hebrew-subset ones (Rubik Bubbles, Fredoka) have no digit glyphs.
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
const DIGIT_STYLES: { key: string; label: string; fontKey: string; bold: boolean; italic: boolean }[] = [
  { key: "comic", label: "קומיקס", fontKey: "permanent-marker", bold: false, italic: false },
  { key: "royal", label: "מלכותי", fontKey: "cinzel-decorative", bold: true, italic: false },
  { key: "elegant", label: "אלגנטי", fontKey: "playfair-display", bold: false, italic: true },
  { key: "clean", label: "נקי", fontKey: "montserrat", bold: true, italic: false },
];

function clamp(n: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, n));
}

// yPct: a spot on the mat (see newTextAt), so a new text starts ON the mat instead of half over the
// photo window.
function newTextElement(yPct: number): MagnetFrameTextElement {
  return {
    id: crypto.randomUUID(),
    type: "text",
    text: "רותם & דניאל",
    xPct: 50,
    yPct,
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

// A free (native) color picker alongside the fixed swatches — the swatches stay for one-click
// common choices, this covers everything else.
function FreeColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const t = useT();
  return (
    <label className="h-6 w-6 rounded-full border-2 border-line shrink-0 cursor-pointer relative overflow-hidden" style={{ background: "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)" }} title={t("צבע חופשי")}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
    </label>
  );
}

// The invitation's colors (frame_settings.palette), offered after the fixed swatches in every color
// row of the editor.
const InvitationColors = createContext<string[]>([]);

function ColorRow({ value, onChange, swatches = COLOR_SWATCHES }: { value: string | undefined; onChange: (hex: string) => void; swatches?: { label: string; value: string }[] }) {
  const t = useT();
  const extra = useContext(InvitationColors).filter((c) => !swatches.some((s) => s.value.toLowerCase() === c.toLowerCase()));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {swatches.map((c) => (
        <button
          key={c.value}
          type="button"
          title={t(c.label)}
          onClick={() => onChange(c.value)}
          className="h-6 w-6 rounded-full border-2"
          style={{ background: c.value, borderColor: value === c.value ? "var(--color-sage)" : "var(--color-line)" }}
        />
      ))}
      {extra.length > 0 && <span className="h-4 w-px bg-line mx-0.5" aria-hidden />}
      {extra.map((c) => (
        <button
          key={c}
          type="button"
          title={t("מההזמנה")}
          onClick={() => onChange(c)}
          className="h-6 w-6 rounded-full border-2"
          style={{ background: c, borderColor: value?.toLowerCase() === c.toLowerCase() ? "var(--color-sage)" : "var(--color-line)" }}
        />
      ))}
      <FreeColorPicker value={value ?? "#000000"} onChange={onChange} />
    </div>
  );
}

// A labeled slider with the value typed beside it.
function SliderRow({ label, value, min, max, step = 1, onChange, suffix }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-2.5 py-1 bg-card border border-line">
      <span className="text-[10px] text-ink-soft whitespace-nowrap w-16 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Math.round(value * 10) / 10}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
        className="w-14 shrink-0 rounded-md px-1.5 py-0.5 text-xs text-center border border-line bg-white text-ink"
        aria-label={label}
      />
      {suffix}
    </div>
  );
}

// A precise no-drag alternative for nudging the selected element. Forced `dir="ltr"` keeps the
// buttons in a fixed up/down/left/right order, and the icons are plain SVG so they always point at
// their real canvas direction.
function NudgeButtons({ onNudge }: { onNudge: (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => void }) {
  const t = useT();
  const btn = "h-7 w-7 rounded-full border border-line bg-card text-ink-soft flex items-center justify-center hover:bg-chip active:scale-95 transition";
  return (
    <div className="flex items-center gap-1.5" dir="ltr">
      <button type="button" onClick={() => onNudge(0, -1)} className={btn} title={t("הזזה למעלה")}>
        <IconArrowUp className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => onNudge(0, 1)} className={btn} title={t("הזזה למטה")}>
        <IconArrowDown className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => onNudge(-1, 0)} className={btn} title={t("הזזה שמאלה")}>
        <IconArrowLeft className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => onNudge(1, 0)} className={btn} title={t("הזזה ימינה")}>
        <IconArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Rotation in degrees (clockwise, -180..180), as a slider and a typed value, with a reset to 0.
function RotationControl({ value, onChange }: { value: number; onChange: (deg: number) => void }) {
  const t = useT();
  const clampDeg = (n: number) => Math.max(-180, Math.min(180, Math.round(n)));
  return (
    <div className="flex items-center gap-2 rounded-lg px-2.5 py-1 bg-card border border-line">
      <span className="text-[10px] text-ink-soft whitespace-nowrap">{t("סיבוב")}</span>
      <input type="range" min={-180} max={180} value={value} onChange={(e) => onChange(clampDeg(Number(e.target.value)))} className="w-full" />
      <input
        type="number"
        min={-180}
        max={180}
        value={value}
        onChange={(e) => onChange(clampDeg(Number(e.target.value) || 0))}
        className="w-14 shrink-0 rounded-md px-1.5 py-0.5 text-xs text-center border border-line bg-white text-ink"
        aria-label={t("סיבוב")}
      />
      <button type="button" onClick={() => onChange(0)} className="shrink-0 text-[10px] text-ink-soft underline" title={t("איפוס")}>
        {t("איפוס")}
      </button>
    </div>
  );
}

function ToolIcon({ d }: { d: string }) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICON = {
  undo: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  duplicate: "M8 8h11v11H8zM5 16V5h11",
  forward: "M12 19V5M5 12l7-7 7 7",
  backward: "M12 5v14M19 12l-7 7-7-7",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3",
  unlock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-1.9",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
};

// The selected element's actions: duplicate, layer order, lock, delete, nudge.
function SelectionActions({
  locked,
  canForward,
  canBackward,
  onDuplicate,
  onLayer,
  onToggleLock,
  onDelete,
  onNudge,
  deleteLabel,
}: {
  locked: boolean;
  canForward: boolean;
  canBackward: boolean;
  onDuplicate: () => void;
  onLayer: (move: LayerMove) => void;
  onToggleLock: () => void;
  onDelete: () => void;
  onNudge: (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => void;
  deleteLabel: string;
}) {
  const t = useT();
  const btn = "h-8 w-8 rounded-lg border border-line bg-card text-ink flex items-center justify-center disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onDuplicate} className={btn} title={t("שכפול (Ctrl+D)")} aria-label={t("שכפול")}>
          <ToolIcon d={ICON.duplicate} />
        </button>
        <button type="button" onClick={() => onLayer("forward")} disabled={!canForward} className={btn} title={t("קדימה (מעל אלמנטים אחרים)")} aria-label={t("קדימה")}>
          <ToolIcon d={ICON.forward} />
        </button>
        <button type="button" onClick={() => onLayer("backward")} disabled={!canBackward} className={btn} title={t("אחורה (מתחת לאלמנטים אחרים)")} aria-label={t("אחורה")}>
          <ToolIcon d={ICON.backward} />
        </button>
        <button
          type="button"
          onClick={onToggleLock}
          className={btn}
          title={locked ? t("ביטול הנעילה") : t("נעילה במקום")}
          aria-label={locked ? t("ביטול הנעילה") : t("נעילה במקום")}
          style={locked ? { background: "var(--color-amber-bg)", color: "var(--color-amber-deep)", borderColor: "var(--color-amber-deep)" } : undefined}
        >
          <ToolIcon d={locked ? ICON.lock : ICON.unlock} />
        </button>
        <button type="button" onClick={onDelete} disabled={locked} className={`${btn} text-rose`} title={deleteLabel} aria-label={deleteLabel}>
          <ToolIcon d={ICON.trash} />
        </button>
      </div>
      {!locked && <NudgeButtons onNudge={onNudge} />}
    </div>
  );
}

// What the editor keeps across an update's reload (see lib/updateResume.ts).
type MagnetResumeState = {
  designId: string | null;
  elements: MagnetFrameElement[];
  frameSettings: MagnetFrameSettings;
  portraitOverrides: Record<string, PortraitPlacement>;
  step: 1 | 2;
  openPanel: PanelKey | null;
  elementTab: ElementTabKey;
  digitColors: Record<string, string>;
};

// Where an element sits in the portrait frame when the photographer has moved it there in step 2.
type PortraitPlacement = { xPct: number; yPct: number; rotation?: number; sizePct?: number; fontSizePx?: number };

function placementOf(el: MagnetFrameElement): PortraitPlacement {
  return el.type === "text"
    ? { xPct: el.xPct, yPct: el.yPct, rotation: el.rotation, fontSizePx: el.fontSizePx }
    : { xPct: el.xPct, yPct: el.yPct, rotation: el.rotation, sizePct: el.sizePct };
}

// Maps a percentage along one axis from the landscape frame to the portrait one, region by region:
// the mat before the window, the window, the mat after it. Text centered on the bottom mat stays
// centered on the bottom mat, even though that mat is a smaller share of the portrait's height.
function mapAxis(v: number, a0: number, a1: number, b0: number, b1: number): number {
  if (v <= a0) return a0 > 0 ? (v / a0) * b0 : b0;
  if (v >= a1) return a1 < 100 ? b1 + ((v - a1) / (100 - a1)) * (100 - b1) : b1;
  return b0 + ((v - a0) / (a1 - a0)) * (b1 - b0);
}

// The state the undo history and the autosave follow.
type Snapshot = { elements: MagnetFrameElement[]; frameSettings: MagnetFrameSettings; portraitOverrides: Record<string, PortraitPlacement> };
const sameSnapshot = (a: Snapshot, b: Snapshot) => JSON.stringify(a) === JSON.stringify(b);

// A drag in progress on a frame: moving an element, resizing it from its corner handle, or turning
// it from its top handle. Positions are measured against the frame the drag started on.
type Interaction =
  | { kind: "move"; id: string; frame: FrameOrientation; offsetX: number; offsetY: number }
  | { kind: "resize"; id: string; frame: FrameOrientation; cx: number; cy: number; startDist: number; startSize: number }
  | { kind: "rotate"; id: string; frame: FrameOrientation; cx: number; cy: number; startAngle: number; startRotation: number };

type SaveState = "saved" | "dirty" | "saving" | "error";

// A sample photo in the photo window, to judge the design against a real picture. Never saved
// with the design or exported.
type SamplePhoto = { url: string; local: boolean } | null;
const SAMPLE_PHOTO_KEY = (designId: string) => `magnet-sample-photo:${designId}`;

// The editor for one saved frame (owner, 2026-10-22: several frames per account, /magnet-frames
// lists them). Two steps: 1 = the landscape frame; 2 = the portrait frame, already filled with
// everything from step 1, where only positions get adjusted. A square size has one frame. Every
// change saves by itself a moment later, and can be undone.
export default function MagnetFrameEditor({
  designId,
  events = [],
  portfolioSlug = null,
}: {
  designId: string;
  events?: { id: string; label: string }[];
  // For a QR that opens the photographer's portfolio.
  portfolioSlug?: string | null;
}) {
  const t = useT();
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [eventId, setEventId] = useState<string | null>(null);
  const [elements, setElements] = useState<MagnetFrameElement[]>([]);
  // Chosen color per illustrated-digit style that has color variants (the 3D digits).
  const [digitColors, setDigitColors] = useState<Record<string, string>>({});
  const [frameSettings, setFrameSettings] = useState<MagnetFrameSettings>(DEFAULT_MAGNET_FRAME_SETTINGS);
  const [openPanel, setOpenPanel] = useState<PanelKey | null>("text");
  const [step, setStep] = useState<1 | 2>(1);
  const [portraitOverrides, setPortraitOverrides] = useState<Record<string, PortraitPlacement>>({});
  // Each landscape text's width in design pixels, measured from the preview, so step 2 can shrink a
  // text that's too wide for the narrower portrait frame.
  const [textWidths, setTextWidths] = useState<Record<string, number>>({});
  const textNodes = useRef<Map<string, HTMLDivElement>>(new Map());
  // Each panel's last scroll position, so reopening a panel returns to where it was left.
  const panelScroll = useRef<Partial<Record<PanelKey, number>>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ frame: FrameOrientation; x: number | null; y: number | null } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const editingOriginal = useRef<string>("");
  const [elementTab, setElementTab] = useState<ElementTabKey>("symbols");
  const [decorationColor, setDecorationColor] = useState("#2e3142");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<`${FrameOrientation}-${"png" | "psd"}` | null>(null);
  const [showPrintGuides, setShowPrintGuides] = useState(false);
  const [samplePhoto, setSamplePhoto] = useState<SamplePhoto>(null);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const frameRefs = { landscape: useRef<MagnetFramePreviewHandle>(null), portrait: useRef<MagnetFramePreviewHandle>(null) };
  const [landscapeWidth, setLandscapeWidth] = useState(0);
  const [textureTab, setTextureTab] = useState<"builtin" | "custom">("builtin");
  const [customTextures, setCustomTextures] = useState<(MagnetFrameCustomTextureRow & { url: string | null })[]>([]);
  const [customTexturesLoaded, setCustomTexturesLoaded] = useState(false);
  const [uploadingTexture, setUploadingTexture] = useState(false);
  const [customElements, setCustomElements] = useState<(MagnetFrameCustomElementRow & { url: string | null })[]>([]);
  const [customElementsLoaded, setCustomElementsLoaded] = useState(false);
  const [uploadingElement, setUploadingElement] = useState(false);

  // The design as last saved on the server (JSON of the snapshot), and the drag in progress.
  const lastSavedKey = useRef<string | null>(null);
  const interaction = useRef<Interaction | null>(null);

  const sizeKey = frameSettings.sizeKey;
  const square = isSquareMagnetSize(sizeKey);
  const landscapeDims = magnetDesignDimensions("landscape", sizeKey);
  const portraitDims = magnetDesignDimensions("portrait", sizeKey);
  const matInset = getMatInsetPct("landscape", sizeKey, frameSettings.borderRatioPct, frameSettings.bottomBorderRatioPct);
  const portraitInset = getMatInsetPct("portrait", sizeKey, frameSettings.borderRatioPct, frameSettings.bottomBorderRatioPct);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/magnet-frames/${designId}`);
        if (!res.ok) {
          if (alive) setNotFound(true);
          return;
        }
        const data: { design: MagnetFrameDesignRow } = await res.json();
        if (!alive) return;
        const design = data.design;
        setName(design.name ?? "");
        setEventId(design.event_id);
        // Older saved designs predate the bold/italic/underline fields — a missing `bold` is true
        // (the fixed always-bold look before the toggle existed).
        const loadedElements = (design.landscape_elements ?? []).map((el) =>
          el.type === "text" ? { ...el, bold: el.bold ?? true, italic: el.italic ?? false, underline: el.underline ?? false } : el
        );
        const loadedSettings = { ...DEFAULT_MAGNET_FRAME_SETTINGS, ...design.frame_settings };
        setElements(loadedElements);
        setFrameSettings(loadedSettings);
        // Portrait positions that differ from the landscape ones were set by hand in step 2.
        // Designs saved before the two steps have an identical copy, so step 2 fits them anew.
        const landscapeById = new Map((design.landscape_elements ?? []).map((el) => [el.id, el]));
        const overrides: Record<string, PortraitPlacement> = {};
        for (const p of design.portrait_elements ?? []) {
          const l = landscapeById.get(p.id);
          if (!l) continue;
          const a = placementOf(l);
          const b = placementOf(p);
          if (a.xPct !== b.xPct || a.yPct !== b.yPct || (a.rotation ?? 0) !== (b.rotation ?? 0) || a.sizePct !== b.sizePct || a.fontSizePx !== b.fontSizePx) {
            overrides[p.id] = b;
          }
        }
        setPortraitOverrides(overrides);
        lastSavedKey.current = JSON.stringify({ elements: loadedElements, frameSettings: loadedSettings, portraitOverrides: overrides });
        // Unsaved work from before an update's reload wins over the saved design (lib/updateResume).
        const resumed = takeResumeState<MagnetResumeState>("magnet-editor");
        if (resumed && resumed.designId === designId) {
          setElements(resumed.elements);
          setFrameSettings(resumed.frameSettings);
          setPortraitOverrides(resumed.portraitOverrides ?? {});
          setStep(resumed.step ?? 1);
          if (resumed.openPanel) setOpenPanel(resumed.openPanel);
          if (resumed.elementTab) setElementTab(resumed.elementTab);
          if (resumed.digitColors) setDigitColors(resumed.digitColors);
        }
        try {
          const stored = localStorage.getItem(SAMPLE_PHOTO_KEY(designId));
          if (stored) setSamplePhoto({ url: stored, local: false });
        } catch {
          // Storage unavailable: no remembered sample photo.
        }
      } catch {
        if (alive) setNotFound(true);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [designId]);

  // Thumbnails and the design itself need the uploaded textures/elements: load them once when the
  // design uses any.
  const loadCustomTextures = useCallback(async () => {
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
  }, [customTexturesLoaded]);
  const loadCustomElements = useCallback(async () => {
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
  }, [customElementsLoaded]);
  const usesCustomTexture = !!frameSettings.customTextureAssetId;
  const usesCustomElement = elements.some((el) => el.type === "decoration" && el.customElementAssetId);
  useEffect(() => {
    if (!loaded) return;
    // A fetch kicked off by what the loaded design contains.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (usesCustomTexture) void loadCustomTextures();
    if (usesCustomElement) void loadCustomElements();
  }, [loaded, usesCustomTexture, usesCustomElement, loadCustomTextures, loadCustomElements]);

  const customTextureUrl = frameSettings.customTextureAssetId ? customTextures.find((tex) => tex.id === frameSettings.customTextureAssetId)?.url ?? null : null;
  const customElementUrls = useMemo(() => Object.fromEntries(customElements.map((c) => [c.id, c.url])), [customElements]);

  // Step 2's starting point: each element mapped region by region into the portrait frame (see
  // mapAxis), a text too wide for it scaled down, then whatever the photographer adjusted there.
  // A square size has no second frame: the portrait copy is the landscape one.
  const PORTRAIT_TEXT_MAX_W = portraitDims.widthPx * 0.9;
  const portraitElements: MagnetFrameElement[] = square
    ? elements
    : elements.map((el) => {
        const fitted = {
          ...el,
          xPct: mapAxis(el.xPct, matInset.xPct, 100 - matInset.xPct, portraitInset.xPct, 100 - portraitInset.xPct),
          yPct: mapAxis(el.yPct, matInset.topPct, 100 - matInset.bottomPct, portraitInset.topPct, 100 - portraitInset.bottomPct),
        } as MagnetFrameElement;
        if (fitted.type === "text") {
          const w = textWidths[el.id];
          if (w && w > PORTRAIT_TEXT_MAX_W) fitted.fontSizePx = Math.max(10, Math.round((fitted.fontSizePx * PORTRAIT_TEXT_MAX_W) / w));
        }
        const override = portraitOverrides[el.id];
        return (override ? { ...fitted, ...Object.fromEntries(Object.entries(override).filter(([, v]) => v !== undefined)) } : fitted) as MagnetFrameElement;
      });

  useLayoutEffect(() => {
    const scaleL = landscapeWidth / landscapeDims.widthPx;
    if (!scaleL) return;
    const next: Record<string, number> = {};
    textNodes.current.forEach((node, id) => {
      next[id] = Math.round((node.offsetWidth - 4) / scaleL);
    });
    const same = Object.keys(next).length === Object.keys(textWidths).length && Object.entries(next).every(([id, w]) => textWidths[id] === w);
    // A measurement of the rendered preview, so it can only happen after render; it settles after
    // one extra pass (the widths stop changing).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!same) setTextWidths(next);
  });

  // --- Latest state, for handlers that run outside React's render (autosave, keys, pointer) ---
  const latest = useRef({ elements, frameSettings, portraitOverrides, portraitElements, selectedId, step, editingTextId });
  const snapshot = useMemo<Snapshot>(() => ({ elements, frameSettings, portraitOverrides }), [elements, frameSettings, portraitOverrides]);
  const snapshotRef = useRef(snapshot);
  useLayoutEffect(() => {
    latest.current = { elements, frameSettings, portraitOverrides, portraitElements, selectedId, step, editingTextId };
    snapshotRef.current = snapshot;
  });

  // --- Undo / redo ---
  // One step per settled change: changes less than 450ms apart (a slider drag, typing) and
  // everything during one pointer drag join the same step.
  const historyRef = useRef<History<Snapshot> | null>(null);
  const applyingHistory = useRef(false);
  const lastChangeAt = useRef(0);
  const dragStepOpen = useRef(false);
  const [historyDepth, setHistoryDepth] = useState({ past: 0, future: 0 });
  const syncHistoryDepth = () => setHistoryDepth({ past: historyRef.current?.past.length ?? 0, future: historyRef.current?.future.length ?? 0 });
  useEffect(() => {
    if (!loaded) return;
    const h = historyRef.current;
    if (!h) {
      historyRef.current = historyStart(snapshot);
      return;
    }
    if (applyingHistory.current) {
      applyingHistory.current = false;
      return;
    }
    if (sameSnapshot(h.present, snapshot)) return;
    const now = Date.now();
    const dragging = interaction.current !== null;
    const join = h.past.length > 0 && h.future.length === 0 && (dragging ? dragStepOpen.current : now - lastChangeAt.current < 450);
    historyRef.current = join ? { ...h, present: snapshot } : historyCommit(h, snapshot, sameSnapshot);
    lastChangeAt.current = now;
    if (dragging) dragStepOpen.current = true;
    // The undo buttons follow the history kept in the ref.
    syncHistoryDepth();
  }, [snapshot, loaded]);
  const applySnapshot = (s: Snapshot) => {
    applyingHistory.current = true;
    lastChangeAt.current = 0;
    setElements(s.elements);
    setFrameSettings(s.frameSettings);
    setPortraitOverrides(s.portraitOverrides);
    setEditingTextId(null);
    if (latest.current.selectedId && !s.elements.some((el) => el.id === latest.current.selectedId)) setSelectedId(null);
    syncHistoryDepth();
  };
  const undo = () => {
    const h = historyRef.current;
    if (!h || h.past.length === 0) return;
    historyRef.current = historyUndo(h);
    applySnapshot(historyRef.current.present);
  };
  const redo = () => {
    const h = historyRef.current;
    if (!h || h.future.length === 0) return;
    historyRef.current = historyRedo(h);
    applySnapshot(historyRef.current.present);
  };
  const canUndo = historyDepth.past > 0;
  const canRedo = historyDepth.future > 0;

  // --- Autosave ---
  // A second after the last change the design saves by itself; "נשמר" says it's on the server.
  // Downloads wait for the save, so the file always matches the screen.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChain = useRef<Promise<boolean>>(Promise.resolve(true));
  const snapshotKey = JSON.stringify(snapshot);
  const doSave = async (): Promise<boolean> => {
    const key = JSON.stringify({ elements: latest.current.elements, frameSettings: latest.current.frameSettings, portraitOverrides: latest.current.portraitOverrides });
    if (key === lastSavedKey.current) return true;
    setSaveState("saving");
    try {
      const res = await fetch("/api/magnet-frames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: designId, elements: latest.current.elements, portraitElements: latest.current.portraitElements, frameSettings: latest.current.frameSettings }),
      });
      if (!res.ok) throw new Error();
      lastSavedKey.current = key;
      const now = JSON.stringify(snapshotRef.current);
      setSaveState(now === key ? "saved" : "dirty");
      return true;
    } catch {
      setSaveState("error");
      return false;
    }
  };
  const save = (): Promise<boolean> => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    saveChain.current = saveChain.current.then(doSave, doSave);
    return saveChain.current;
  };
  useEffect(() => {
    if (!loaded || notFound || lastSavedKey.current === null) return;
    if (snapshotKey === lastSavedKey.current) return;
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), 1000);
    // save reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotKey, loaded, notFound]);
  // Leaving the page with an unsaved change: the browser asks before closing the tab, and an
  // in-app navigation sends what's left on its way out.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (lastSavedKey.current !== null && JSON.stringify(snapshotRef.current) !== lastSavedKey.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (lastSavedKey.current !== null && JSON.stringify(snapshotRef.current) !== lastSavedKey.current) {
        fetch("/api/magnet-frames", {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: designId, elements: latest.current.elements, portraitElements: latest.current.portraitElements, frameSettings: latest.current.frameSettings }),
        }).catch(() => {});
      }
    };
  }, [designId]);

  // The name and the linked event save on their own (PATCH), the name a moment after typing stops.
  const nameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patchDesign = async (patch: { name?: string; eventId?: string | null }) => {
    try {
      const res = await fetch(`/api/magnet-frames/${designId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!res.ok) throw new Error();
    } catch {
      setError(t("שגיאה בשמירה"));
    }
  };
  const changeName = (value: string) => {
    setName(value);
    if (nameTimer.current) clearTimeout(nameTimer.current);
    nameTimer.current = setTimeout(() => void patchDesign({ name: value }), 700);
  };
  const changeEvent = (value: string | null) => {
    setEventId(value);
    void patchDesign({ eventId: value });
  };

  useResumeState("magnet-editor", (): MagnetResumeState | null =>
    loaded ? { designId, elements, frameSettings, portraitOverrides, step, openPanel, elementTab, digitColors } : null
  );
  useBusy("magnet-export", saveState === "saving" || exportBusy ? t("הורדת המסגרת") : null);

  // --- Editing ---
  const selected = elements.find((e) => e.id === selectedId) ?? null;

  const updateElement = (id: string, patch: Partial<MagnetFrameElement>) => {
    setElements((prev) => prev.map((el) => (el.id === id ? ({ ...el, ...patch } as MagnetFrameElement) : el)));
  };

  const setPortraitPlacement = (id: string, patch: Partial<PortraitPlacement>) => {
    const current = latest.current.portraitElements.find((e) => e.id === id);
    setPortraitOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] ?? (current ? placementOf(current) : { xPct: 50, yPct: 50 })), ...patch } }));
  };
  const resetPortraitPlacement = (id: string) =>
    setPortraitOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  // A precise, no-drag alternative to dragging — each press nudges the element by 14 design px
  // (×4 with Shift on the keyboard), whatever the preview's zoom.
  const nudge = (id: string, dx: number, dy: number) => {
    const portrait = latest.current.step === 2;
    const fd = portrait ? portraitDims : landscapeDims;
    const stepX = (14 / fd.widthPx) * 100;
    const stepY = (14 / fd.heightPx) * 100;
    if (portrait) {
      const el = latest.current.portraitElements.find((e) => e.id === id);
      if (el) setPortraitPlacement(id, { xPct: clamp(el.xPct + dx * stepX), yPct: clamp(el.yPct + dy * stepY) });
      return;
    }
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, xPct: clamp(el.xPct + dx * stepX), yPct: clamp(el.yPct + dy * stepY) } : el)));
  };

  // A QR can't shrink below what still scans when printed (qrMinSizePct); other elements keep the
  // decoration range.
  const minSizePctOf = (el: MagnetFrameElement) => (el.type === "qr" ? Math.max(MAGNET_DECORATION_SIZE_RANGE.min, qrMinSizePct(latest.current.frameSettings.sizeKey)) : MAGNET_DECORATION_SIZE_RANGE.min);

  const addElement = (el: MagnetFrameElement) => {
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  };

  // A clear spot on the mat, so a text added to a template doesn't land on its names.
  const newTextAt = () => {
    const spot = freeTextSpot(matInset, elements, landscapeDims.heightPx / landscapeDims.widthPx);
    return { ...newTextElement(spot.yPct), xPct: spot.xPct };
  };
  const addText = () => addElement(newTextAt());

  const addDigit = (digit: string, style: (typeof DIGIT_STYLES)[number]) =>
    addElement({ ...newTextAt(), text: digit, fontKey: style.fontKey, fontSizePx: 140, color: decorationColor, bold: style.bold, italic: style.italic });

  const addDecoration = (ornamentId: string) => addElement({ id: crypto.randomUUID(), type: "decoration", ornamentId, xPct: 24, yPct: 24, sizePct: 16, color: decorationColor });
  const addCustomElement = (customElementAssetId: string) =>
    addElement({ id: crypto.randomUUID(), type: "decoration", customElementAssetId, xPct: 24, yPct: 24, sizePct: 16, color: decorationColor });
  const addFloral = (floralId: string, sizePct = 28) => addElement({ id: crypto.randomUUID(), type: "decoration", floralId, xPct: 24, yPct: 24, sizePct, color: decorationColor });

  const removeElement = (id: string) => {
    setElements((prev) => prev.filter((el) => el.id !== id));
    setPortraitOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (latest.current.selectedId === id) setSelectedId(null);
    if (latest.current.editingTextId === id) setEditingTextId(null);
  };

  const duplicate = (id: string) => {
    const el = latest.current.elements.find((e) => e.id === id);
    if (!el) return;
    const copy = duplicateElement(el, crypto.randomUUID());
    setElements((prev) => {
      const i = prev.findIndex((e) => e.id === id);
      const next = [...prev];
      next.splice(i + 1, 0, copy);
      return next;
    });
    setSelectedId(copy.id);
  };
  const changeLayer = (id: string, move: LayerMove) => setElements((prev) => moveLayer(prev, id, move));
  const toggleLock = (id: string) => {
    const el = latest.current.elements.find((e) => e.id === id);
    if (el) updateElement(id, { locked: !el.locked });
  };

  const selectionActions = (el: MagnetFrameElement, deleteLabel: string) => (
    <SelectionActions
      locked={!!el.locked}
      canForward={canMoveLayer(elements, el.id, "forward")}
      canBackward={canMoveLayer(elements, el.id, "backward")}
      onDuplicate={() => duplicate(el.id)}
      onLayer={(move) => changeLayer(el.id, move)}
      onToggleLock={() => toggleLock(el.id)}
      onDelete={() => removeElement(el.id)}
      onNudge={(dx, dy) => nudge(el.id, dx, dy)}
      deleteLabel={deleteLabel}
    />
  );

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
        setError(data.error ?? t("שגיאה בהעלאת הטקסטורה"));
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
        setError(data.error ?? t("שגיאה בהעלאת האלמנט"));
        return;
      }
      setCustomElements((prev) => [data.element, ...prev]);
    } finally {
      setUploadingElement(false);
    }
  };

  const selectElementTab = (key: (typeof ELEMENT_TABS)[number]["key"]) => {
    setElementTab(key);
    if (key === "custom") void loadCustomElements();
  };

  // --- Dragging on the frames: move, resize from the corner handle, turn from the top handle ---
  const SNAP_THRESHOLD_PCT = 1.2;
  const frameRect = (frame: FrameOrientation) => frameRefs[frame].current?.element?.getBoundingClientRect() ?? null;
  const listFor = (frame: FrameOrientation) => (frame === "portrait" ? latest.current.portraitElements : latest.current.elements);
  const elementCenterPx = (frame: FrameOrientation, el: MagnetFrameElement) => {
    const rect = frameRect(frame);
    if (!rect) return null;
    return { x: rect.left + (el.xPct / 100) * rect.width, y: rect.top + (el.yPct / 100) * rect.height, rect };
  };

  const startMove = (frame: FrameOrientation, el: MagnetFrameElement, e: React.PointerEvent) => {
    e.stopPropagation();
    setSelectedId(el.id);
    if (latest.current.step === 1) {
      if (el.type === "text") selectPanel("text");
      else if (el.type === "qr") selectPanel("qr");
      else selectPanel(openPanel === "digits" && el.floralId?.startsWith("digit-") ? "digits" : "elements");
    }
    if (latest.current.editingTextId === el.id) return;
    // Captured even when locked: the click that ends the press then lands on the element and
    // keeps it selected, instead of on the frame (which lets go of the selection).
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (el.locked) return;
    const c = elementCenterPx(frame, el);
    if (!c) return;
    dragStepOpen.current = false;
    interaction.current = {
      kind: "move",
      id: el.id,
      frame,
      offsetX: ((e.clientX - c.x) / c.rect.width) * 100,
      offsetY: ((e.clientY - c.y) / c.rect.height) * 100,
    };
    setActiveId(el.id);
  };

  const startHandle = (kind: "resize" | "rotate", frame: FrameOrientation, el: MagnetFrameElement, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const c = elementCenterPx(frame, el);
    if (!c) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStepOpen.current = false;
    if (kind === "resize") {
      interaction.current = {
        kind,
        id: el.id,
        frame,
        cx: c.x,
        cy: c.y,
        startDist: Math.hypot(e.clientX - c.x, e.clientY - c.y),
        startSize: el.type === "text" ? el.fontSizePx : el.sizePct,
      };
    } else {
      interaction.current = { kind, id: el.id, frame, cx: c.x, cy: c.y, startAngle: pointerAngleDeg(c.x, c.y, e.clientX, e.clientY), startRotation: el.rotation ?? 0 };
    }
    setActiveId(el.id);
  };

  const onFramePointerMove = (e: React.PointerEvent) => {
    const it = interaction.current;
    if (!it) return;
    const portrait = it.frame === "portrait";
    const apply = (patch: Partial<PortraitPlacement> & Record<string, unknown>) =>
      portrait ? setPortraitPlacement(it.id, patch) : updateElement(it.id, patch as Partial<MagnetFrameElement>);
    if (it.kind === "move") {
      const rect = frameRect(it.frame);
      if (!rect) return;
      const rawX = clamp(((e.clientX - rect.left) / rect.width) * 100 - it.offsetX);
      const rawY = clamp(((e.clientY - rect.top) / rect.height) * 100 - it.offsetY);
      // Alt turns snapping off for a free placement.
      const lines = frameSnapLines(portrait ? portraitInset : matInset, listFor(it.frame).filter((o) => o.id !== it.id));
      const sx = e.altKey ? { value: rawX, line: null } : snapValue(rawX, lines.x, SNAP_THRESHOLD_PCT);
      const sy = e.altKey ? { value: rawY, line: null } : snapValue(rawY, lines.y, SNAP_THRESHOLD_PCT);
      setGuides({ frame: it.frame, x: sx.line, y: sy.line });
      apply({ xPct: sx.value, yPct: sy.value });
      return;
    }
    const el = listFor(it.frame).find((o) => o.id === it.id);
    if (!el) return;
    if (it.kind === "resize") {
      const dist = Math.hypot(e.clientX - it.cx, e.clientY - it.cy);
      if (el.type === "text") apply({ fontSizePx: Math.round(resizeFromDrag(it.startSize, it.startDist, dist, MAGNET_TEXT_SIZE_RANGE.min, MAGNET_TEXT_SIZE_RANGE.max)) });
      else apply({ sizePct: resizeFromDrag(it.startSize, it.startDist, dist, minSizePctOf(el), MAGNET_DECORATION_SIZE_RANGE.max) });
      return;
    }
    const angle = pointerAngleDeg(it.cx, it.cy, e.clientX, e.clientY);
    apply({ rotation: snapRotation(it.startRotation + angle - it.startAngle, e.shiftKey ? 15 : undefined) });
  };

  const endInteraction = () => {
    interaction.current = null;
    dragStepOpen.current = false;
    setActiveId(null);
    setGuides(null);
  };

  // --- Keyboard ---
  // Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z or Ctrl+Y redo, Delete removes, arrows nudge (Shift ×4),
  // Ctrl/⌘+D duplicates, Esc lets go of the selection. Not while typing in a field.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && key === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && key === "y") {
      e.preventDefault();
      redo();
      return;
    }
    const id = latest.current.selectedId;
    if (e.key === "Escape") {
      setSelectedId(null);
      return;
    }
    if (!id) return;
    const el = latest.current.elements.find((x) => x.id === id);
    if (!el) return;
    if (mod && key === "d") {
      e.preventDefault();
      if (latest.current.step === 1) duplicate(id);
      return;
    }
    if (el.locked) return;
    if ((e.key === "Delete" || e.key === "Backspace") && latest.current.step === 1) {
      e.preventDefault();
      removeElement(id);
      return;
    }
    const arrows: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const dir = arrows[e.key];
    if (dir) {
      e.preventDefault();
      const k = e.shiftKey ? 4 : 1;
      nudge(id, dir[0] * k, dir[1] * k);
    }
  };
  useLayoutEffect(() => {
    keyHandler.current = onKeyDown;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --- Downloads ---
  // Saves first: the export renders the design stored on the server.
  // format "psd": the layered Photoshop file (see magnetFramePsd.ts), same save-first flow.
  const download = async (orientation: FrameOrientation, format: "png" | "psd" = "png") => {
    if (exportBusy) return;
    setExportBusy(`${orientation}-${format}`);
    setError(null);
    try {
      const ok = await save();
      if (!ok) {
        setError(t("שגיאה בשמירה"));
        return;
      }
      if (format === "psd") {
        // The server stores the file and answers with a signed link that downloads it.
        const res = await fetch(`/api/magnet-frames/${designId}/psd?orientation=${orientation}`);
        if (!res.ok) throw new Error();
        const { url } = (await res.json()) as { url: string };
        const a = document.createElement("a");
        a.href = url;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      const res = await fetch(`/api/magnet-frames/${designId}/export?orientation=${orientation}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const size = magnetSizeLabel(sizeKey, orientation).replace("×", "x");
      a.download = square ? `מגנט-${size}.png` : `מגנט-${orientation === "landscape" ? "לרוחב" : "לאורך"}-${size}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("שגיאה בהורדת הקובץ"));
    } finally {
      setExportBusy(null);
    }
  };

  // One tab open at a time ("solo"). Switching keeps the previous one's sub-tab and choices (they're
  // editor state) and its scroll position (saved here, restored below).
  const panelScrollRef = useRef<HTMLDivElement>(null);
  const selectPanel = (key: PanelKey) => {
    if (key === openPanel) return;
    if (panelScrollRef.current && openPanel) panelScroll.current[openPanel] = panelScrollRef.current.scrollTop;
    setOpenPanel(key);
  };
  useLayoutEffect(() => {
    if (panelScrollRef.current && openPanel) panelScrollRef.current.scrollTop = panelScroll.current[openPanel] ?? 0;
  }, [openPanel]);

  const goToStep = (n: 1 | 2) => {
    setSelectedId(null);
    setEditingTextId(null);
    setStep(n);
  };
  // A square frame has no second step.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (square && step === 2) setStep(1);
  }, [square, step]);

  // "התאמת המסגרת לצבעי ההזמנה": the mat in the invitation's paper color, the texts in its text
  // color and the recolorable ornaments in its accent. One undo step.
  const applyInvitationColors = (colors: { mat: string; text: string; accent: string }) => {
    setFrameSettings((prev) => ({ ...prev, frameColor: colors.mat, frameColorOpacity: 100 }));
    setElements((prev) =>
      prev.map((el) =>
        el.type === "text"
          ? { ...el, color: colors.text }
          : el.type === "decoration" && el.ornamentId && !el.floralId && !el.customElementAssetId
            ? { ...el, color: colors.accent }
            : el
      )
    );
    setDecorationColor(colors.accent);
  };

  const changeSize = (key: MagnetFrameSettings["sizeKey"]) => {
    setFrameSettings((prev) => ({ ...prev, sizeKey: key }));
    // Hand-placed portrait positions belong to the old shape.
    setPortraitOverrides({});
  };

  // --- The sample photo in the window ---
  const chooseSamplePhoto = (photo: SamplePhoto) => {
    setSamplePhoto((prev) => {
      if (prev?.local) URL.revokeObjectURL(prev.url);
      return photo;
    });
    setPhotoPickerOpen(false);
    try {
      if (photo && !photo.local) localStorage.setItem(SAMPLE_PHOTO_KEY(designId), photo.url);
      else localStorage.removeItem(SAMPLE_PHOTO_KEY(designId));
    } catch {
      // Storage unavailable: the choice lasts until the page closes.
    }
  };

  // --- Rendering a frame ---
  const renderFrame = (orientation: FrameOrientation) => {
    const interactive = (step === 1) === (orientation === "landscape");
    const list = orientation === "portrait" ? portraitElements : elements;
    const safe = magnetSafeMarginPct(orientation, sizeKey);
    const handle = "absolute h-3.5 w-3.5 rounded-full border-2 bg-white shadow";
    return (
      <MagnetFramePreview
        ref={frameRefs[orientation]}
        orientation={orientation}
        settings={frameSettings}
        elements={list}
        customTextureUrl={customTextureUrl}
        customElementUrls={customElementUrls}
        photoUrl={samplePhoto?.url ?? null}
        qrContext={{ eventId, portfolioSlug }}
        emptyTextLabel={t("טקסט ריק")}
        className={`touch-none shadow-card ${interactive ? "" : "pointer-events-none"}`}
        onWidth={orientation === "landscape" ? setLandscapeWidth : undefined}
        textRef={
          orientation === "landscape"
            ? (id, node) => {
                if (node) textNodes.current.set(id, node);
                else textNodes.current.delete(id);
              }
            : undefined
        }
        animate={(el) => activeId !== el.id}
        elementProps={(el) =>
          interactive
            ? {
                selected: selectedId === el.id,
                cursor: el.locked ? "pointer" : "grab",
                onPointerDown: (e) => startMove(orientation, el, e),
                onDoubleClick:
                  el.type === "text" && step === 1 && !el.locked
                    ? (e) => {
                        e.stopPropagation();
                        editingOriginal.current = el.text;
                        setEditingTextId(el.id);
                      }
                    : undefined,
              }
            : {}
        }
        elementExtras={(el) =>
          interactive && selectedId === el.id && !el.locked && editingTextId !== el.id ? (
            <>
              <span
                aria-hidden
                className="absolute left-1/2 w-px pointer-events-none"
                style={{ top: -22, height: 18, background: "var(--color-amber-deep)", transform: "translateX(-50%)" }}
              />
              <span
                role="button"
                aria-label={t("סיבוב")}
                title={t("סיבוב (Shift: בקפיצות של 15°)")}
                className={`${handle} left-1/2 cursor-grab`}
                style={{ top: -30, transform: "translateX(-50%)", borderColor: "var(--color-amber-deep)" }}
                onPointerDown={(e) => startHandle("rotate", orientation, el, e)}
              />
              <span
                role="button"
                aria-label={t("שינוי גודל")}
                title={t("שינוי גודל")}
                className={`${handle} cursor-nwse-resize`}
                style={{ right: -9, bottom: -9, borderColor: "var(--color-amber-deep)" }}
                onPointerDown={(e) => startHandle("resize", orientation, el, e)}
              />
            </>
          ) : null
        }
        onPointerMove={onFramePointerMove}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        onClick={() => {
          setSelectedId(null);
          setEditingTextId(null);
        }}
      >
        {(scale) => (
          <>
            {guides && guides.frame === orientation && guides.x !== null && (
              <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${guides.x}%`, width: 1, background: "var(--color-amber-deep)", boxShadow: "0 0 4px var(--color-amber-deep)", zIndex: 20 }} />
            )}
            {guides && guides.frame === orientation && guides.y !== null && (
              <div className="absolute left-0 right-0 pointer-events-none" style={{ top: `${guides.y}%`, height: 1, background: "var(--color-amber-deep)", boxShadow: "0 0 4px var(--color-amber-deep)", zIndex: 20 }} />
            )}
            {showPrintGuides && (
              <div
                className="absolute pointer-events-none"
                style={{ left: `${safe.xPct}%`, right: `${safe.xPct}%`, top: `${safe.yPct}%`, bottom: `${safe.yPct}%`, border: "1px dashed rgba(122,31,43,0.75)", zIndex: 19 }}
              />
            )}
            {interactive &&
              editingTextId &&
              (() => {
                const el = list.find((x) => x.id === editingTextId);
                if (!el || el.type !== "text") return null;
                const style = magnetTextStyle(el, scale);
                return (
                  <input
                    autoFocus
                    dir="auto"
                    value={el.text}
                    onChange={(e) => updateElement(el.id, { text: e.target.value })}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setEditingTextId(null);
                      if (e.key === "Escape") {
                        updateElement(el.id, { text: editingOriginal.current });
                        setEditingTextId(null);
                      }
                    }}
                    onBlur={() => setEditingTextId(null)}
                    className="absolute rounded-md border-2 text-center bg-white/90 outline-none"
                    style={{
                      left: `${el.xPct}%`,
                      top: `${el.yPct}%`,
                      transform: "translate(-50%, -50%)",
                      width: "78%",
                      fontSize: style.fontSize,
                      fontFamily: style.fontFamily,
                      fontWeight: style.fontWeight,
                      fontStyle: style.fontStyle,
                      color: el.color === "#ffffff" ? "#111111" : el.color,
                      borderColor: "var(--color-amber-deep)",
                      zIndex: 30,
                    }}
                  />
                );
              })()}
          </>
        )}
      </MagnetFramePreview>
    );
  };

  const elementLabel = (el: MagnetFrameElement, i: number) =>
    el.type === "text"
      ? el.text.trim() || t("טקסט ריק")
      : el.type === "qr"
        ? t("קוד QR")
        : el.floralId?.startsWith("digit-")
          ? `${t("ספרה")} ${i + 1}`
          : `${t("אלמנט")} ${i + 1}`;

  // Step 2: only placement — pick an item (on the frame or from the list) and nudge, resize, turn it,
  // or send it back to its automatic place.
  const renderPortraitPanel = () => {
    const sel = portraitElements.find((e) => e.id === selectedId) ?? null;
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink">{t("המסגרת לאורך כבר מוכנה עם כל מה שהוספתם במסגרת לרוחב. נשאר רק לכוון מיקומים: גוררים במסגרת, או בוחרים פריט ומכוונים כאן.")}</p>
        <div className="flex flex-wrap gap-1.5">
          {portraitElements.map((el, i) => (
            <button
              key={el.id}
              onClick={() => setSelectedId(el.id)}
              className="max-w-[200px] truncate rounded-full px-3 py-1 text-xs border"
              style={{
                borderColor: selectedId === el.id ? "var(--color-amber-deep)" : "var(--color-line)",
                background: selectedId === el.id ? "var(--color-amber-bg)" : "var(--color-card)",
                color: "var(--color-ink)",
              }}
            >
              {elementLabel(el, i)}
              {portraitOverrides[el.id] ? " ·" : ""}
            </button>
          ))}
        </div>
        {sel ? (
          <div className="rounded-xl p-3 bg-chip space-y-2.5">
            {sel.type === "text" ? (
              <SliderRow label={t("גודל")} value={sel.fontSizePx} min={MAGNET_TEXT_SIZE_RANGE.min} max={MAGNET_TEXT_SIZE_RANGE.max} onChange={(v) => setPortraitPlacement(sel.id, { fontSizePx: v })} />
            ) : (
              <SliderRow label={t("גודל")} value={sel.sizePct} min={minSizePctOf(sel)} max={MAGNET_DECORATION_SIZE_RANGE.max} onChange={(v) => setPortraitPlacement(sel.id, { sizePct: v })} />
            )}
            <RotationControl value={sel.rotation ?? 0} onChange={(deg) => setPortraitPlacement(sel.id, { rotation: deg })} />
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => resetPortraitPlacement(sel.id)}
                disabled={!portraitOverrides[sel.id]}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-card border border-line text-ink disabled:opacity-50"
              >
                {t("החזרה למיקום האוטומטי")}
              </button>
              {!sel.locked && <NudgeButtons onNudge={(dx, dy) => nudge(sel.id, dx, dy)} />}
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-soft">{t("לחצו על טקסט או אלמנט במסגרת לאורך כדי לכוון אותו.")}</p>
        )}
        {Object.keys(portraitOverrides).length > 0 && (
          <button onClick={() => setPortraitOverrides({})} className="text-xs text-ink-soft underline">
            {t("החזרת כל המיקומים לאוטומטי")}
          </button>
        )}
      </div>
    );
  };

  const PANELS: { key: PanelKey; label: string }[] = [
    { key: "text", label: "טקסט" },
    { key: "elements", label: "אלמנטים" },
    { key: "digits", label: "ספרות" },
    { key: "qr", label: "קוד QR" },
    { key: "texture", label: "טקסטורה" },
    { key: "settings", label: "הגדרות מסגרת" },
  ];

  const SHADOW_SWATCHES = [
    { label: "שחור", value: "#000000" },
    { label: "לבן", value: "#ffffff" },
    { label: "זהב", value: "#c9a84c" },
    { label: "בורדו", value: "#7a1f2b" },
    { label: "כחול כהה", value: "#1c2a4a" },
  ];

  const decorationEditor = (el: Extract<MagnetFrameElement, { type: "decoration" }>) => (
    <div className="rounded-xl p-3 bg-chip space-y-2.5 mb-3" onClick={(e) => e.stopPropagation()}>
      <div className="text-[11px] font-semibold text-ink-soft">{t("האלמנט שנבחר")}</div>
      <SliderRow label={t("גודל")} value={el.sizePct} min={MAGNET_DECORATION_SIZE_RANGE.min} max={MAGNET_DECORATION_SIZE_RANGE.max} onChange={(v) => updateElement(el.id, { sizePct: v })} />
      {!el.customElementAssetId && !el.floralId && (
        <ColorRow
          value={el.color}
          onChange={(hex) => updateElement(el.id, { color: hex })}
          swatches={["#2e3142", "#c9a84c", "#ffffff", "#7a1f2b", "#52c98f"].map((value) => ({ label: value, value }))}
        />
      )}
      <RotationControl value={el.rotation ?? 0} onChange={(deg) => updateElement(el.id, { rotation: deg })} />
      {selectionActions(el, t("מחיקת האלמנט"))}
    </div>
  );

  const renderPanelContent = (key: PanelKey) => {
    if (key === "text") {
      const texts = elements.filter((el): el is MagnetFrameTextElement => el.type === "text");
      return (
        <div className="space-y-3">
          <button onClick={addText} className="w-full whitespace-nowrap rounded-lg px-3.5 py-2.5 text-sm font-semibold bg-ink text-white">
            {t("+ הוספת טקסט")}
          </button>
          {texts.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-ink-soft mb-1.5">{t("הטקסטים במסגרת")}</div>
              <div className="flex flex-wrap gap-1.5">
                {texts.map((el) => (
                  <button
                    key={el.id}
                    onClick={() => setSelectedId(el.id)}
                    className="max-w-[220px] truncate rounded-full px-3 py-1 text-xs border"
                    style={{
                      borderColor: selectedId === el.id ? "var(--color-amber-deep)" : "var(--color-line)",
                      background: selectedId === el.id ? "var(--color-amber-bg)" : "var(--color-card)",
                      color: "var(--color-ink)",
                    }}
                  >
                    {el.locked ? "🔒 " : ""}
                    {el.text || t("טקסט ריק")}
                  </button>
                ))}
              </div>
            </div>
          )}
          {selected && selected.type === "text" && (
            <div className="rounded-xl p-3 bg-chip space-y-2.5" onClick={(e) => e.stopPropagation()}>
              <textarea
                value={selected.text}
                onChange={(e) => updateElement(selected.id, { text: e.target.value })}
                rows={2}
                className="w-full rounded-lg px-3 py-2 text-sm bg-card border border-line text-ink resize-none"
                placeholder={t("לדוגמה: רותם & דניאל · 12.6.2026")}
              />
              <p className="text-[10px] text-ink-soft">{t("אפשר גם ללחוץ פעמיים על הטקסט במסגרת כדי לערוך אותו שם.")}</p>
              <select
                value={selected.fontKey}
                onChange={(e) => updateElement(selected.id, { fontKey: e.target.value })}
                className="w-full rounded-lg px-2.5 py-2 text-xs bg-card border border-line text-ink"
              >
                <optgroup label={t("עברית")}>
                  {ALBUM_FONTS.filter((f) => f.category === "hebrew").map((f) => (
                    <option key={f.key} value={f.key} style={{ fontFamily: albumFontFamilyCss(f.key) }}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t("אנגלית")}>
                  {ALBUM_FONTS.filter((f) => f.category === "latin").map((f) => (
                    <option key={f.key} value={f.key} style={{ fontFamily: albumFontFamilyCss(f.key) }}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
              </select>
              <SliderRow label={t("גודל")} value={selected.fontSizePx} min={MAGNET_TEXT_SIZE_RANGE.min} max={MAGNET_TEXT_SIZE_RANGE.max} onChange={(v) => updateElement(selected.id, { fontSizePx: v })} />
              <SliderRow
                label={t("ריווח אותיות")}
                value={selected.letterSpacing ?? 0}
                min={-4}
                max={40}
                step={0.5}
                onChange={(v) => updateElement(selected.id, { letterSpacing: v })}
              />
              <ColorRow value={selected.color} onChange={(hex) => updateElement(selected.id, { color: hex })} />
              <div className="flex items-center gap-1.5">
                {(
                  [
                    ["bold", "B", "מודגש", "font-bold"],
                    ["italic", "I", "נטוי", "italic"],
                    ["underline", "U", "קו תחתון", "underline"],
                  ] as const
                ).map(([field, glyph, label, cls]) => (
                  <button
                    key={field}
                    type="button"
                    onClick={() => updateElement(selected.id, { [field]: !selected[field] })}
                    title={t(label)}
                    className={`h-8 w-8 rounded-lg border text-sm ${cls}`}
                    style={{
                      borderColor: selected[field] ? "var(--color-sage)" : "var(--color-line)",
                      background: selected[field] ? "var(--color-sage-bg)" : "var(--color-card)",
                      color: "var(--color-ink)",
                    }}
                  >
                    {glyph}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                <input type="checkbox" checked={selected.shadowEnabled} onChange={(e) => updateElement(selected.id, { shadowEnabled: e.target.checked })} />
                {t("צל לטקסט")}
              </label>
              {selected.shadowEnabled && (
                <div className="space-y-2 ps-5">
                  <SliderRow label={t("טשטוש")} value={selected.shadowBlurPx} min={0} max={20} onChange={(v) => updateElement(selected.id, { shadowBlurPx: v })} />
                  <SliderRow label={t("מרחק")} value={selected.shadowDistancePx} min={0} max={15} onChange={(v) => updateElement(selected.id, { shadowDistancePx: v })} />
                  <ColorRow value={selected.shadowColor ?? "#000000"} onChange={(hex) => updateElement(selected.id, { shadowColor: hex })} swatches={SHADOW_SWATCHES} />
                </div>
              )}
              <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={(selected.strokeWidth ?? 0) > 0}
                  onChange={(e) => updateElement(selected.id, e.target.checked ? { strokeWidth: 2, strokeColor: selected.strokeColor ?? "#ffffff" } : { strokeWidth: 0 })}
                />
                {t("קו מתאר")}
              </label>
              {(selected.strokeWidth ?? 0) > 0 && (
                <div className="space-y-2 ps-5">
                  <SliderRow label={t("עובי")} value={selected.strokeWidth ?? 0} min={0.5} max={12} step={0.5} onChange={(v) => updateElement(selected.id, { strokeWidth: v })} />
                  <ColorRow value={selected.strokeColor ?? "#000000"} onChange={(hex) => updateElement(selected.id, { strokeColor: hex })} swatches={SHADOW_SWATCHES} />
                </div>
              )}
              <RotationControl value={selected.rotation ?? 0} onChange={(deg) => updateElement(selected.id, { rotation: deg })} />
              {selectionActions(selected, t("מחיקת הטקסט"))}
            </div>
          )}
          {!(selected && selected.type === "text") && <p className="text-xs text-ink-soft">{t("בחרו טקסט על המסגרת כדי לערוך אותו, או הוסיפו טקסט חדש.")}</p>}
        </div>
      );
    }
    if (key === "elements") {
      return (
        <>
          {selected && selected.type === "decoration" && decorationEditor(selected)}
          <div>
            <div className="flex flex-wrap gap-1 mb-2">
              {ELEMENT_TABS.filter((tab) => tab.key !== "digits").map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => selectElementTab(tab.key)}
                  className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                  style={{
                    background: elementTab === tab.key ? "var(--color-amber-deep)" : "var(--color-chip)",
                    color: elementTab === tab.key ? "#fff" : "var(--color-ink-soft)",
                  }}
                >
                  {t(tab.label)}
                </button>
              ))}
            </div>
            {elementTab !== "watercolor" && elementTab !== "custom" && (
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[10px] text-ink-soft">{t("צבע")}</span>
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
                      if (file) void uploadElementFile(file);
                    }}
                  />
                  <span className="text-xs font-semibold text-ink-soft">{uploadingElement ? t("מעלה...") : t("+ העלאת אלמנט משלי")}</span>
                </label>
                <p className="text-[10px] text-ink-soft">{t("האלמנטים שמעלים כאן נשמרים ונשארים זמינים גם בעיצובים הבאים.")}</p>
                {customElements.length > 0 && (
                  <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
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
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
                {MAGNET_FRAME_FLORALS.map((f) => (
                  <button key={f.id} onClick={() => addFloral(f.id)} title={f.label} className="rounded-lg border border-line p-1 bg-chip aspect-square flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} className="w-full h-full" style={{ objectFit: "contain" }} alt="" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
                {ALBUM_ORNAMENTS.filter((o) => o.category === elementTab).map((o) => (
                  <button key={o.id} onClick={() => addDecoration(o.id)} title={o.label} className="rounded-lg border border-line p-1 bg-chip aspect-square flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ornamentDataUrl(o, decorationColor)} className="w-full h-full" style={{ objectFit: "contain" }} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      );
    }
    if (key === "digits") {
      return (
        <>
          {selected && selected.type === "decoration" && decorationEditor(selected)}
          <div className="space-y-2.5">
            {MAGNET_DIGIT_STYLES.map((style) => {
              const color = style.colors ? (style.colors.find((c) => c.key === digitColors[style.key]) ?? style.colors[0]) : undefined;
              return (
                <div key={style.key}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-[10px] font-semibold text-ink-soft">{t(style.label)}</div>
                    {style.colors && (
                      <div className="flex items-center gap-1">
                        {style.colors.map((c) => (
                          <button
                            key={c.key}
                            onClick={() => setDigitColors((prev) => ({ ...prev, [style.key]: c.key }))}
                            title={t(c.label)}
                            aria-label={t(c.label)}
                            className="w-4 h-4 rounded-full border-2"
                            style={{ background: c.swatch, borderColor: color?.key === c.key ? "var(--color-amber-deep)" : "transparent" }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-7 sm:grid-cols-13 gap-1.5" dir="ltr">
                    {style.numbers.map((n) => (
                      <button
                        key={n}
                        onClick={() => addFloral(magnetDigitId(style.key, n, color?.key), 22)}
                        title={[t(style.label), color ? t(color.label) : "", n].filter(Boolean).join(" ")}
                        className="rounded-lg border border-line p-0.5 bg-chip aspect-square flex items-center justify-center"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={magnetDigitUrl(style.key, n, color?.key)} loading="lazy" className="w-full h-full" style={{ objectFit: "contain" }} alt={n} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {DIGIT_STYLES.map((style) => (
              <div key={style.key}>
                <div className="text-[10px] font-semibold text-ink-soft mb-1">{t(style.label)}</div>
                <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5" dir="ltr">
                  {DIGITS.map((digit) => (
                    <button
                      key={digit}
                      onClick={() => addDigit(digit, style)}
                      title={`${t(style.label)} ${digit}`}
                      className="rounded-lg border border-line bg-chip aspect-square flex items-center justify-center text-xl leading-none"
                      style={{
                        fontFamily: albumFontFamilyCss(style.fontKey),
                        fontWeight: style.bold ? 700 : 400,
                        fontStyle: style.italic ? "italic" : "normal",
                        color: decorationColor === "#ffffff" ? "var(--color-ink)" : decorationColor,
                      }}
                    >
                      {digit}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      );
    }
    if (key === "qr")
      return (
        <QrPanel
          selected={selected && selected.type === "qr" ? selected : null}
          eventId={eventId}
          portfolioSlug={portfolioSlug}
          sizeKey={sizeKey}
          orientation="landscape"
          onAdd={addElement}
          onChange={(id, patch) => updateElement(id, patch)}
          actions={selected && selected.type === "qr" ? selectionActions(selected, t("מחיקת הקוד")) : null}
        />
      );
    if (key === "texture")
      return (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <button
                onClick={() => setTextureTab("builtin")}
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: textureTab === "builtin" ? "var(--color-amber-deep)" : "var(--color-chip)", color: textureTab === "builtin" ? "var(--color-on-accent)" : "var(--color-ink-soft)" }}
              >
                {t("40 טקסטורות")}
              </button>
              <button
                onClick={() => {
                  setTextureTab("custom");
                  void loadCustomTextures();
                }}
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: textureTab === "custom" ? "var(--color-amber-deep)" : "var(--color-chip)", color: textureTab === "custom" ? "var(--color-on-accent)" : "var(--color-ink-soft)" }}
              >
                {t("הטקסטורות שלי")}
              </button>
            </div>
            {(frameSettings.textureId || frameSettings.customTextureAssetId) && (
              <button onClick={clearTexture} className="text-[11px] text-ink-soft underline shrink-0">
                {t("ללא טקסטורה")}
              </button>
            )}
          </div>
          {(frameSettings.textureId || frameSettings.customTextureAssetId) && (
            <SliderRow label={t("שקיפות")} value={frameSettings.textureOpacity} min={5} max={100} onChange={(v) => setFrameSettings((prev) => ({ ...prev, textureOpacity: v }))} />
          )}
          {textureTab === "builtin" ? (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {MAGNET_FRAME_TEXTURES.map((tex) => (
                <button
                  key={tex.id}
                  onClick={() => selectBuiltinTexture(tex.id)}
                  title={tex.label}
                  className="rounded-lg border-2 aspect-square overflow-hidden bg-white"
                  style={{ borderColor: frameSettings.textureId === tex.id ? "var(--color-amber-deep)" : "var(--color-line)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={textureDataUrl(tex)} alt={tex.label} className="w-full h-full" style={{ objectFit: "cover" }} draggable={false} />
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
                    if (file) void uploadTextureFile(file);
                  }}
                />
                <span className="text-xs font-semibold text-ink-soft">{uploadingTexture ? t("מעלה...") : t("+ העלאת טקסטורה משלי")}</span>
              </label>
              {customTextures.length > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {customTextures.map(
                    (tex) =>
                      tex.url && (
                        <button
                          key={tex.id}
                          onClick={() => selectCustomTexture(tex.id)}
                          title={tex.original_filename}
                          className="rounded-lg border-2 aspect-square overflow-hidden bg-white"
                          style={{ borderColor: frameSettings.customTextureAssetId === tex.id ? "var(--color-amber-deep)" : "var(--color-line)" }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={tex.url} alt={tex.original_filename} className="w-full h-full" style={{ objectFit: "cover" }} draggable={false} />
                        </button>
                      )
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    return (
      <div className="space-y-2.5">
        <div className="space-y-1.5">
          <span className="text-xs font-semibold">{t("גודל המסגרת")}</span>
          <div className="flex flex-wrap gap-1.5">
            {MAGNET_FRAME_SIZES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => changeSize(s.key)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold border"
                style={{
                  borderColor: (sizeKey ?? "20x15") === s.key ? "var(--color-amber-deep)" : "var(--color-line)",
                  background: (sizeKey ?? "20x15") === s.key ? "var(--color-amber-bg)" : "var(--color-card)",
                  color: "var(--color-ink)",
                }}
              >
                <Dim>{s.label}</Dim> {t("ס״מ")}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-ink-soft leading-relaxed">{t("הפריסה נשמרת ביחס למסגרת, כך שאפשר לעבור בין גדלים. בגודל מרובע יש מסגרת אחת בלבד.")}</p>
        </div>
        <div className="space-y-1.5 pt-1.5 border-t border-line">
          <span className="text-xs font-semibold">{t("שיוך לאירוע")}</span>
          <select
            value={eventId ?? ""}
            onChange={(e) => changeEvent(e.target.value || null)}
            className="w-full rounded-lg px-2.5 py-2 text-xs bg-card border border-line text-ink"
          >
            <option value="">{t("ללא אירוע")}</option>
            {eventId && !events.some((ev) => ev.id === eventId) && <option value={eventId}>{t("האירוע המשויך")}</option>}
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.label}
              </option>
            ))}
          </select>
        </div>
        <div className="pt-1.5 border-t border-line space-y-2.5">
          <SliderRow label={t("עובי מסגרת")} value={frameSettings.borderRatioPct} min={4} max={25} onChange={(v) => setFrameSettings((prev) => ({ ...prev, borderRatioPct: v }))} />
          <SliderRow label={t("עובי צלע תחתונה")} value={frameSettings.bottomBorderRatioPct} min={4} max={35} onChange={(v) => setFrameSettings((prev) => ({ ...prev, bottomBorderRatioPct: v }))} />
          <SliderRow label={t("עיגול פינות")} value={frameSettings.cornerRadiusPct} min={0} max={100} onChange={(v) => setFrameSettings((prev) => ({ ...prev, cornerRadiusPct: v }))} />
        </div>
        <div className="pt-1.5 border-t border-line space-y-1.5">
          <span className="text-xs font-semibold">{t("צבע המסגרת")}</span>
          <ColorRow value={frameSettings.frameColor} onChange={(hex) => setFrameSettings((prev) => ({ ...prev, frameColor: hex }))} />
          <SliderRow label={t("שקיפות הצבע")} value={frameSettings.frameColorOpacity} min={0} max={100} onChange={(v) => setFrameSettings((prev) => ({ ...prev, frameColorOpacity: v }))} />
        </div>
        <div className="pt-1.5 border-t border-line">
          <InvitationPalette
            palette={frameSettings.palette}
            onPalette={(colors) => setFrameSettings((prev) => ({ ...prev, palette: colors }))}
            onApply={applyInvitationColors}
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer pt-1.5 border-t border-line">
          <input type="checkbox" checked={frameSettings.shadowEnabled} onChange={(e) => setFrameSettings((prev) => ({ ...prev, shadowEnabled: e.target.checked }))} />
          {t("הצללה בחלק הפנימי של המסגרת")}
        </label>
        {frameSettings.shadowEnabled && (
          <>
            <SliderRow label={t("עוצמה")} value={frameSettings.shadowOpacity} min={0} max={80} onChange={(v) => setFrameSettings((prev) => ({ ...prev, shadowOpacity: v }))} />
            <SliderRow label={t("טשטוש")} value={frameSettings.shadowBlurPx} min={0} max={40} onChange={(v) => setFrameSettings((prev) => ({ ...prev, shadowBlurPx: v }))} />
            <SliderRow label={t("מרחק")} value={frameSettings.shadowDistancePx} min={0} max={30} onChange={(v) => setFrameSettings((prev) => ({ ...prev, shadowDistancePx: v }))} />
          </>
        )}
      </div>
    );
  };

  // The editor fills the screen below the title row (owner, 2026-10-06): no page scroll. The right
  // side scrolls on its own, and the frames on the left stay put, sized to fit the height.
  const gridRef = useRef<HTMLDivElement>(null);
  const [fitHeight, setFitHeight] = useState<number | null>(null);
  const [tallScreen, setTallScreen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  useLayoutEffect(() => {
    if (!loaded) return;
    const measure = () => {
      const el = gridRef.current;
      if (!el || window.innerWidth < 640) {
        setFitHeight(null);
        return;
      }
      const top = el.getBoundingClientRect().top + window.scrollY;
      setFitHeight(Math.max(200, Math.floor(window.innerHeight - top - 16)));
      setTallScreen(window.matchMedia("(min-width: 1024px) and (min-height: 700px)").matches);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [loaded]);
  // The landscape frame's height per width (0.75 for 20×15). Side by side, the two frames share the
  // column so their heights match: the landscape one takes 1/(1+r²) of it. Stacked (a tall screen),
  // the portrait frame is 60% wide under the landscape one.
  const r = landscapeDims.heightPx / landscapeDims.widthPx;
  const landscapeShare = square ? 1 : 1 / (1 + r * r);
  const previewsMaxWidth = fitHeight
    ? Math.max(
        200,
        square ? (fitHeight - 150) / 1 : tallScreen ? (fitHeight - 170) / (r + 0.6 / r) : (fitHeight - 130) / (landscapeShare * r)
      )
    : undefined;

  if (!loaded) return null;
  if (notFound) {
    return (
      <div className="rounded-2xl p-8 text-center bg-card border border-line shadow-card space-y-3">
        <p className="text-sm text-ink">{t("המסגרת לא נמצאה.")}</p>
        <Link href="/magnet-frames" className="inline-block rounded-lg px-4 py-2 text-sm font-semibold bg-ink text-white">
          {t("לכל המסגרות")}
        </Link>
      </div>
    );
  }

  const saveLabel =
    saveState === "saving" ? t("שומר...") : saveState === "dirty" ? t("שינויים לא שמורים") : saveState === "error" ? t("השמירה נכשלה · ניסיון חוזר") : t("נשמר");
  const orientations: FrameOrientation[] = square ? ["landscape"] : ["landscape", "portrait"];
  const frameTitle = (o: FrameOrientation) =>
    square
      ? withDims(t("מסגרת {size}"), { size: magnetSizeLabel(sizeKey, o) })
      : withDims(o === "landscape" ? t("מסגרת לרוחב {size}") : t("מסגרת לאורך {size}"), { size: magnetSizeLabel(sizeKey, o) });
  const toolBtn = "h-9 w-9 shrink-0 rounded-lg border border-line bg-card text-ink flex items-center justify-center disabled:opacity-40";

  // Two sides (owner's design, 2026-10-05): the panels on the right (65%), and on the left (35%)
  // the frames as they will be exported, so a misplaced element shows up before downloading.
  return (
    <InvitationColors.Provider value={frameSettings.palette ?? []}>
      {/* A phone held upright gets this instead of the editor: the two sides need the width of a
          phone held sideways (owner, 2026-10-05). The editor stays mounted underneath, so turning
          the phone back and forth keeps everything as it was. */}
      <div className="hidden [@media(pointer:coarse)_and_(orientation:portrait)_and_(max-width:767px)]:flex flex-col items-center gap-4 rounded-2xl p-8 text-center bg-card border border-line shadow-card">
        <div className="w-16 h-16 rounded-full bg-chip flex items-center justify-center" style={{ color: "var(--color-amber-deep)" }}>
          <IconRotateDevice size={28} />
        </div>
        <p className="text-lg font-bold font-display">{t("סובבו את המכשיר למצב אופקי")}</p>
        <p className="text-sm text-ink-soft">{t("כלי עיצוב המגנטים עובד במצב אופקי: המסגרות מצד אחד והפאנלים מהצד השני. סובבו את הטלפון כדי להמשיך.")}</p>
      </div>
      <div className={`[@media(pointer:coarse)_and_(orientation:portrait)_and_(max-width:767px)]:hidden ${ALBUM_FONT_CLASS_NAMES}`}>
        <div className="flex flex-wrap items-center gap-2 mb-4 [@media(max-height:500px)]:mb-2">
          <Link
            href="/magnet-frames"
            aria-label={t("לכל המסגרות")}
            className="hidden [@media(max-height:500px)]:flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-card text-ink-soft"
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ltr:rotate-180">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
          <input
            value={name}
            onChange={(e) => changeName(e.target.value)}
            placeholder={t("מסגרת ללא שם")}
            maxLength={80}
            aria-label={t("שם המסגרת")}
            className="min-w-0 flex-1 sm:flex-none sm:w-[min(420px,40vw)] rounded-lg px-2 py-1 text-[24px] [@media(max-height:500px)]:text-lg font-bold font-display bg-transparent border border-transparent hover:border-line focus:border-line focus:bg-card"
          />
          <div className="relative">
            <button
              onClick={() => setHelpOpen((v) => !v)}
              aria-label={t("הסבר")}
              aria-expanded={helpOpen}
              className="h-7 w-7 rounded-full border border-line bg-card text-sm font-bold text-ink-soft flex items-center justify-center"
            >
              ?
            </button>
            {helpOpen && (
              <div
                role="dialog"
                className="absolute start-0 top-9 z-30 w-[min(380px,80vw)] rounded-xl p-3.5 bg-card border border-line shadow-sheet text-xs leading-relaxed text-ink-soft space-y-2"
                onClick={() => setHelpOpen(false)}
              >
                <p>{t("מסגרת עם חלון שקוף באמצע, שבו תוכנס תמונת האירוע. מוסיפים טקסט ואלמנטים וגוררים אותם על המסגרת. כל שינוי נשמר לבד.")}</p>
                <p>{t("על אלמנט שנבחר: הידית בפינה משנה גודל, והידית למעלה מסובבת. לחיצה כפולה על טקסט עורכת אותו במקום. Alt בזמן גרירה מבטל את ההצמדה.")}</p>
                <p>{t("קיצורים: Ctrl+Z ביטול, Ctrl+Shift+Z שחזור, Ctrl+D שכפול, Delete מחיקה, חיצים להזזה (Shift להזזה גדולה), Esc לביטול הבחירה.")}</p>
              </div>
            )}
          </div>
          <ClientApprovalBar designId={designId} eventId={eventId} />
          <div className="ms-auto flex items-center gap-1.5">
            <button onClick={undo} disabled={!canUndo} className={toolBtn} title={t("ביטול (Ctrl+Z)")} aria-label={t("ביטול")}>
              <ToolIcon d={ICON.undo} />
            </button>
            <button onClick={redo} disabled={!canRedo} className={toolBtn} title={t("שחזור (Ctrl+Shift+Z)")} aria-label={t("שחזור")}>
              <ToolIcon d={ICON.redo} />
            </button>
            <button
              onClick={() => (saveState === "error" || saveState === "dirty" ? void save() : undefined)}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border"
              style={
                saveState === "error"
                  ? { borderColor: "var(--color-rose)", color: "var(--color-rose)", background: "var(--color-rose-bg)" }
                  : saveState === "saved"
                    ? { borderColor: "transparent", color: "var(--color-sage)", background: "var(--color-sage-bg)" }
                    : { borderColor: "var(--color-line)", color: "var(--color-ink-soft)", background: "var(--color-card)" }
              }
              aria-live="polite"
            >
              {saveState === "saved" ? "✓ " : ""}
              {saveLabel}
            </button>
          </div>
        </div>

        <div ref={gridRef} className="grid gap-4 sm:gap-5 sm:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] items-start" style={fitHeight ? { height: fitHeight } : undefined}>
          <section className="rounded-2xl bg-card border border-line shadow-card overflow-hidden flex flex-col sm:h-full">
            {!square && (
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 [@media(max-height:500px)]:py-1.5">
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => goToStep(n)}
                    aria-current={step === n ? "step" : undefined}
                    className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors"
                    style={{ background: step === n ? "var(--color-ink)" : "var(--color-chip)", color: step === n ? "#fff" : "var(--color-ink-soft)" }}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px]" style={{ background: step === n ? "rgba(255,255,255,0.2)" : "var(--color-card)" }}>
                      {n}
                    </span>
                    {frameTitle(n === 1 ? "landscape" : "portrait")}
                  </button>
                ))}
                <button
                  onClick={() => goToStep(step === 1 ? 2 : 1)}
                  className="ms-auto rounded-lg px-3.5 py-1.5 text-sm font-bold"
                  style={{ background: step === 1 ? "var(--color-amber-deep)" : "transparent", color: step === 1 ? "var(--color-on-accent)" : "var(--color-ink-soft)" }}
                >
                  {step === 1 ? t("המשך למסגרת לאורך ←") : t("→ חזרה למסגרת לרוחב")}
                </button>
              </div>
            )}
            {step === 2 && !square ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-4 [@media(max-height:500px)]:p-3">{renderPortraitPanel()}</div>
            ) : (
              <>
                <div role="tablist" className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>button]:[@media(max-height:500px)]:py-2">
                  {PANELS.map((panel) => {
                    const open = openPanel === panel.key;
                    return (
                      <button
                        key={panel.key}
                        role="tab"
                        aria-selected={open}
                        onClick={() => selectPanel(panel.key)}
                        className="shrink-0 whitespace-nowrap px-3.5 py-3 text-sm font-semibold transition-colors"
                        style={{ color: open ? "var(--color-ink)" : "var(--color-ink-soft)", boxShadow: open ? "inset 0 -2px 0 var(--color-amber-deep)" : undefined }}
                      >
                        {t(panel.label)}
                      </button>
                    );
                  })}
                </div>
                <div ref={panelScrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 [@media(max-height:500px)]:p-3">
                  {openPanel && renderPanelContent(openPanel)}
                </div>
              </>
            )}
          </section>

          {/* Side by side when the screen is short (a phone held sideways), stacked on a tall one. */}
          <aside className="order-first sm:order-none sm:h-full sm:overflow-y-auto sm:overflow-x-hidden">
            <div className="mx-auto w-full pt-5 px-3" style={previewsMaxWidth ? { maxWidth: previewsMaxWidth + 24 } : undefined}>
              <div
                className={`grid items-start gap-x-3 gap-y-8 ${square ? "grid-cols-1" : "[@media(min-width:1024px)_and_(min-height:700px)]:grid-cols-1"}`}
                style={square ? undefined : { gridTemplateColumns: tallScreen ? undefined : `${landscapeShare}fr ${1 - landscapeShare}fr` }}
              >
                {orientations.map((o) => (
                  <div key={o} className={o === "portrait" ? "[@media(min-width:1024px)_and_(min-height:700px)]:w-[60%] [@media(min-width:1024px)_and_(min-height:700px)]:mx-auto w-full" : "w-full"}>
                    <div className="mb-1.5 text-[11px] font-semibold text-ink-soft text-center">
                      {frameTitle(o)}
                      {!square && (step === 1) === (o === "landscape") && (
                        <span className="ms-1.5 rounded-full px-1.5 py-px text-[10px] text-white" style={{ background: "var(--color-amber-deep)" }}>
                          {t("בעריכה")}
                        </span>
                      )}
                    </div>
                    {renderFrame(o)}
                    {/* Wraps to two rows in a narrow column (the portrait frame on a phone held sideways). */}
                    <div className="mt-2 flex flex-wrap gap-1.5 [&>button]:basis-[56px]">
                      <button
                        onClick={() => download(o)}
                        disabled={!!exportBusy}
                        title={t("הורדת המסגרת כ-PNG ({size})", { size: magnetSizeLabel(sizeKey, o) })}
                        className="flex-1 min-w-0 rounded-lg px-1.5 py-2 text-[11px] sm:text-xs font-semibold bg-chip text-ink disabled:opacity-60 flex items-center justify-center gap-1"
                      >
                        {exportBusy === `${o}-png` ? t("מוריד...") : (
                          <>
                            <DownloadGlyph /> PNG
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => download(o, "psd")}
                        disabled={!!exportBusy}
                        title={t("קובץ פוטושופ עם שכבות: המסגרת, הטקסטורה, כל טקסט ואלמנט בשכבה משלו, והצללות כ-Layer Style")}
                        className="flex-1 min-w-0 rounded-lg px-1.5 py-2 text-[11px] sm:text-xs font-semibold border border-line bg-card text-ink disabled:opacity-60 flex items-center justify-center gap-1"
                      >
                        {exportBusy === `${o}-psd` ? t("מכין PSD...") : (
                          <>
                            <DownloadGlyph /> PSD
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2 text-[11px] text-ink-soft">
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
                  <button type="button" onClick={() => setPhotoPickerOpen((v) => !v)} className="font-semibold underline underline-offset-2 text-ink">
                    {samplePhoto ? t("החלפת התמונה בחלון") : t("תמונה לדוגמה בחלון")}
                  </button>
                  {samplePhoto && (
                    <button type="button" onClick={() => chooseSamplePhoto(null)} className="underline underline-offset-2">
                      {t("הסרת התמונה")}
                    </button>
                  )}
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={showPrintGuides} onChange={(e) => setShowPrintGuides(e.target.checked)} />
                    {t("אזור בטוח להדפסה")}
                  </label>
                </div>
                {photoPickerOpen && <SamplePhotoPicker eventId={eventId} onChoose={chooseSamplePhoto} onClose={() => setPhotoPickerOpen(false)} />}
                {showPrintGuides && <p className="text-center leading-relaxed">{t("הקו המקווקו מסמן 3 מ״מ מהקצה. טקסט ואלמנטים חשובים כדאי להשאיר בתוכו.")}</p>}
                {!square && <p className="text-center leading-relaxed">{t("שתי המסגרות מתעדכנות יחד. אפשר לגרור אלמנטים בכל אחת מהן.")}</p>}
              </div>
              {error && <p className="mt-2 text-xs text-rose text-center">{error}</p>}
            </div>
          </aside>
        </div>
      </div>
    </InvitationColors.Provider>
  );
}

// Choosing the sample photo: from the device (stays in this browser only), or from a gallery — the
// linked event's first, else the latest galleries.
function SamplePhotoPicker({ eventId, onChoose, onClose }: { eventId: string | null; onChoose: (p: SamplePhoto) => void; onClose: () => void }) {
  const t = useT();
  const [galleries, setGalleries] = useState<{ id: string; title: string }[] | null>(null);
  const [galleryId, setGalleryId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.from("galleries").select("id, title, event_id, created_at").order("created_at", { ascending: false }).limit(30);
      if (!alive) return;
      const rows = (data ?? []) as { id: string; title: string; event_id: string | null }[];
      const ordered = [...rows.filter((g) => eventId && g.event_id === eventId), ...rows.filter((g) => !eventId || g.event_id !== eventId)];
      setGalleries(ordered.map((g) => ({ id: g.id, title: g.title })));
      setGalleryId(ordered[0]?.id ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [eventId]);

  useEffect(() => {
    if (!galleryId) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhotos(null);
    void (async () => {
      const { data } = await createClient().from("gallery_photos").select("id").eq("gallery_id", galleryId).order("sort_order", { ascending: true }).limit(24);
      if (alive) setPhotos(((data ?? []) as { id: string }[]).map((p) => p.id));
    })();
    return () => {
      alive = false;
    };
  }, [galleryId]);

  return (
    <div className="rounded-xl border border-line bg-card p-3 space-y-2.5 text-start">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink">{t("תמונה לדוגמה בחלון")}</span>
        <button type="button" onClick={onClose} className="text-ink-soft" aria-label={t("סגירה")}>
          ✕
        </button>
      </div>
      <p className="text-[10px] leading-relaxed">{t("רק לתצוגה בעורך, כדי לראות איך המסגרת נראית עם תמונה. היא לא נשמרת בקובץ.")}</p>
      <label className="flex items-center justify-center rounded-lg border border-dashed border-line p-2 text-center cursor-pointer text-xs font-semibold text-ink-soft">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onChoose({ url: URL.createObjectURL(file), local: true });
          }}
        />
        {t("בחירת תמונה מהמכשיר")}
      </label>
      {galleries && galleries.length > 0 && (
        <>
          <select value={galleryId ?? ""} onChange={(e) => setGalleryId(e.target.value)} className="w-full rounded-lg px-2 py-1.5 text-xs bg-white border border-line text-ink">
            {galleries.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
          {photos === null ? (
            <p className="text-[10px]">{t("טוען...")}</p>
          ) : photos.length === 0 ? (
            <p className="text-[10px]">{t("אין תמונות בגלריה הזו.")}</p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto">
              {photos.map((pid) => {
                const url = `/api/galleries/${galleryId}/photos/${pid}/image?size=640&fast=1`;
                return (
                  <button key={pid} type="button" onClick={() => onChoose({ url, local: false })} className="aspect-square overflow-hidden rounded-md bg-chip">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
