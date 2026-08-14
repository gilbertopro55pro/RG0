export const GALLERY_THEMES = [
  { id: "classic", label: "קלאסי" },
  { id: "editorial", label: "דרמטי" },
  { id: "minimal", label: "מינימלי" },
  { id: "warm", label: "חם" },
] as const;

export type GalleryTheme = (typeof GALLERY_THEMES)[number]["id"];

export const GALLERY_PALETTES = [
  { id: "light", label: "לבן", bg: "#ffffff", ink: "#201f33" },
  { id: "dark", label: "כהה", bg: "#14121f", ink: "#f6f4fb" },
  { id: "cream", label: "קרם", bg: "#f6f1e7", ink: "#4a3b2a" },
  { id: "sage", label: "מרווה", bg: "#eef5ef", ink: "#2f4a3a" },
  { id: "blush", label: "פודרה", bg: "#fbeef0", ink: "#5a2f3a" },
] as const;

export type GalleryPalette = (typeof GALLERY_PALETTES)[number]["id"];

export function paletteById(id: string) {
  return GALLERY_PALETTES.find((p) => p.id === id) ?? GALLERY_PALETTES[0];
}

// Reuses the app's own two already-loaded font families (Heebo/display, Rubik/sans) — each
// theme only varies weight, size, tracking and case, never pulls in a new typeface.
export function galleryTitleStyle(theme: string): Record<string, string | number> {
  switch (theme as GalleryTheme) {
    case "editorial":
      return { fontFamily: "var(--font-display)", fontWeight: 800, letterSpacing: "-0.02em" };
    case "minimal":
      return { fontFamily: "var(--font-sans)", fontWeight: 300, letterSpacing: "0.08em", textTransform: "uppercase" };
    case "warm":
      return { fontFamily: "var(--font-display)", fontWeight: 600 };
    case "classic":
    default:
      return { fontFamily: "var(--font-display)", fontWeight: 700 };
  }
}

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
