// Shared bits of the home screen's vivid look (lib/tones.ts, admin only for now).

// The two header buttons (calendar, settings): glass with a thin gold ring and a brass icon.
export const VIVID_HEADER_BUTTON = "relative shrink-0 h-[42px] w-[42px] rounded-xl flex items-center justify-center";
export const VIVID_HEADER_BUTTON_STYLE = {
  background: "var(--color-hero-glass)",
  border: "1px solid color-mix(in srgb, var(--vivid-foil) 40%, transparent)",
  boxShadow: "0 4px 12px rgba(var(--shadow-tint), 0.1)",
  color: "var(--color-brass)",
  backdropFilter: "blur(20px) saturate(150%)",
  WebkitBackdropFilter: "blur(20px) saturate(150%)",
} as const;

// A tool's icon on its tile: a small square in the tool's tone. "brass" is the app's accent (price
// quotes, magnet frames), the rest are lib/tones.ts tones.
export function vividIconStyle(tone: "brass" | "paid" | "upcoming" | "pending" | "creative" | "neutral") {
  return tone === "brass"
    ? { background: "var(--color-amber-bg)", color: "var(--color-brass)" }
    : { background: `var(--tone-${tone}-bg)`, color: `var(--tone-${tone}-ink)` };
}
export const VIVID_ICON_BOX = "h-[34px] w-[34px] shrink-0 rounded-lg flex items-center justify-center";
