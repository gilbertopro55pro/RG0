import { Frank_Ruhl_Libre } from "next/font/google";

// Scoped to gallery pages only (not the main app) — a serif display face reserved for the
// client-facing gallery experience, where a more editorial/premium feel is worth the extra font.
export const galleryFont = Frank_Ruhl_Libre({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-gallery-serif",
});

export type GridStyle = "masonry" | "grid" | "framed" | "justified";
export type TitleFont = "serif" | "sans";

export type GalleryThemeTokens = {
  id: string;
  label: string;
  bg: string;
  surface: string;
  surfaceSoft: string;
  ink: string;
  inkSoft: string;
  accent: string;
  accentInk: string;
  border: string;
  radius: string;
  titleFont: "serif" | "sans";
  titleWeight: number;
  titleTracking: string;
  titleTransform?: "uppercase";
  // Layout — the part that makes each theme feel like a different gallery, not just a recolor.
  gridStyle: GridStyle;
  gap: number;
  photoRadius: string;
  photoBorder: boolean;
  bannerDivider: boolean;
  bannerFramed: boolean;
  bannerFullBleed: boolean;
};

// Five complete, self-contained looks — each bundles its own palette, typography treatment and
// corner radius so choosing one theme is choosing a whole finished style, not assembling parts.
export const GALLERY_THEMES: GalleryThemeTokens[] = [
  {
    id: "classic",
    label: "קלאסי",
    bg: "#faf9f6",
    surface: "#ffffff",
    surfaceSoft: "#f3f1ec",
    ink: "#2b2621",
    inkSoft: "#7a7266",
    accent: "#b08d57",
    accentInk: "#ffffff",
    border: "#e8e3d9",
    radius: "16px",
    titleFont: "serif",
    titleWeight: 600,
    titleTracking: "0em",
    gridStyle: "masonry",
    gap: 10,
    photoRadius: "14px",
    photoBorder: false,
    bannerDivider: true,
    bannerFramed: false,
    bannerFullBleed: false,
  },
  {
    id: "editorial",
    label: "דרמטי",
    bg: "#121212",
    surface: "#1c1c1c",
    surfaceSoft: "#272727",
    ink: "#f5f5f5",
    inkSoft: "#aeaeae",
    accent: "#e0a94c",
    accentInk: "#121212",
    border: "#343434",
    radius: "6px",
    titleFont: "sans",
    titleWeight: 800,
    titleTracking: "-0.02em",
    gridStyle: "masonry",
    gap: 2,
    photoRadius: "0px",
    photoBorder: false,
    bannerDivider: false,
    bannerFramed: false,
    bannerFullBleed: true,
  },
  {
    id: "minimal",
    label: "מינימלי",
    bg: "#ffffff",
    surface: "#ffffff",
    surfaceSoft: "#f7f7f7",
    ink: "#1a1a1a",
    inkSoft: "#8a8a8a",
    accent: "#1a1a1a",
    accentInk: "#ffffff",
    border: "#ececec",
    radius: "4px",
    titleFont: "sans",
    titleWeight: 300,
    titleTracking: "0.1em",
    titleTransform: "uppercase",
    gridStyle: "grid",
    gap: 24,
    photoRadius: "0px",
    photoBorder: false,
    bannerDivider: false,
    bannerFramed: false,
    bannerFullBleed: false,
  },
  {
    id: "warm",
    label: "חם",
    bg: "#f7ede0",
    surface: "#fffaf3",
    surfaceSoft: "#f0e2cf",
    ink: "#5a3e2b",
    inkSoft: "#97795f",
    accent: "#c1662f",
    accentInk: "#ffffff",
    border: "#e6d5bd",
    radius: "20px",
    titleFont: "serif",
    titleWeight: 500,
    titleTracking: "0em",
    gridStyle: "masonry",
    gap: 8,
    photoRadius: "22px",
    photoBorder: false,
    bannerDivider: false,
    bannerFramed: true,
    bannerFullBleed: false,
  },
  {
    id: "romantic",
    label: "רומנטי",
    bg: "#fdf1f2",
    surface: "#fffbfb",
    surfaceSoft: "#fbe4e7",
    ink: "#5c3742",
    inkSoft: "#9c7883",
    accent: "#c97b8f",
    accentInk: "#ffffff",
    border: "#f3d9dd",
    radius: "24px",
    titleFont: "serif",
    titleWeight: 500,
    titleTracking: "0.01em",
    gridStyle: "framed",
    gap: 14,
    photoRadius: "18px",
    photoBorder: true,
    bannerDivider: true,
    bannerFramed: false,
    bannerFullBleed: false,
  },
];

export function galleryThemeById(id: string): GalleryThemeTokens {
  return GALLERY_THEMES.find((t) => t.id === id) ?? GALLERY_THEMES[0];
}

// A theme is just a starting point — the photographer can deviate from its default font and
// photo layout without losing the rest of the theme (colors, radius, banner treatment). Null
// overrides mean "use whatever this theme normally uses".
export type GalleryStyleOverrides = {
  titleFontOverride?: string | null;
  gridStyleOverride?: string | null;
};

export function resolveGalleryTheme(id: string, overrides?: GalleryStyleOverrides): GalleryThemeTokens {
  const base = galleryThemeById(id);
  return {
    ...base,
    titleFont: (overrides?.titleFontOverride as TitleFont | null | undefined) || base.titleFont,
    gridStyle: (overrides?.gridStyleOverride as GridStyle | null | undefined) || base.gridStyle,
  };
}

// One CSS custom-property map per theme, meant to be spread onto the page's outer wrapper style —
// every themed class downstream reads these vars (e.g. bg-[var(--gt-surface)]) instead of the
// app's own light/dark tokens, so the whole gallery — not just the background — follows the theme.
export function galleryThemeVars(id: string, overrides?: GalleryStyleOverrides): Record<string, string> {
  const t = resolveGalleryTheme(id, overrides);
  return {
    "--gt-bg": t.bg,
    "--gt-surface": t.surface,
    "--gt-surface-soft": t.surfaceSoft,
    "--gt-ink": t.ink,
    "--gt-ink-soft": t.inkSoft,
    "--gt-accent": t.accent,
    "--gt-accent-ink": t.accentInk,
    "--gt-border": t.border,
    "--gt-radius": t.radius,
    "--gt-gap": `${t.gap}px`,
    "--gt-photo-radius": t.photoRadius,
  };
}

export function galleryTitleStyle(id: string, overrides?: GalleryStyleOverrides): Record<string, string | number> {
  const t = resolveGalleryTheme(id, overrides);
  return {
    fontFamily: t.titleFont === "serif" ? "var(--font-gallery-serif)" : "var(--font-sans)",
    fontWeight: t.titleWeight,
    letterSpacing: t.titleTracking,
    ...(t.titleTransform ? { textTransform: t.titleTransform } : {}),
  };
}

export const FONT_OPTIONS: { id: TitleFont; label: string }[] = [
  { id: "serif", label: "סריף" },
  { id: "sans", label: "סאנס" },
];

export const GRID_STYLE_OPTIONS: { id: GridStyle; label: string }[] = [
  { id: "masonry", label: "פסיפס" },
  { id: "grid", label: "רשת" },
  { id: "framed", label: "ממוסגר" },
  { id: "justified", label: "שורות" },
];

export const COVER_TEXT_POSITIONS = [
  { id: "above", label: "מעל התמונה" },
  { id: "below", label: "מתחת לתמונה" },
  { id: "center-left", label: "מרכז שמאל" },
  { id: "center-right", label: "מרכז ימין" },
] as const;

export type CoverTextPosition = (typeof COVER_TEXT_POSITIONS)[number]["id"];

export const COVER_SHAPES = [
  { id: "banner", label: "באנר" },
  { id: "rectangle", label: "מלבן" },
  { id: "square", label: "ריבוע" },
  { id: "circle", label: "עיגול" },
] as const;

export type CoverShape = (typeof COVER_SHAPES)[number]["id"];

export function coverAspectRatio(shape: string): string {
  switch (shape as CoverShape) {
    case "banner":
      return "3 / 1";
    case "square":
    case "circle":
      return "1 / 1";
    case "rectangle":
    default:
      return "16 / 9";
  }
}

export function isOverlayPosition(position: string): boolean {
  return position === "center-left" || position === "center-right";
}
