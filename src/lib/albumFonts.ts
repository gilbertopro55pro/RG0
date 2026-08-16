import {
  Heebo,
  Rubik,
  Assistant,
  Frank_Ruhl_Libre,
  David_Libre,
  Secular_One,
  Suez_One,
  Alef,
  Miriam_Libre,
  Noto_Sans_Hebrew,
  Montserrat,
  Playfair_Display,
  Lora,
  Poppins,
  Merriweather,
  Dancing_Script,
  Great_Vibes,
  Pacifico,
  Caveat,
  Sacramento,
} from "next/font/google";
import { ALBUM_FONT_DEFS } from "@/lib/albumFontFiles";

// Two dedicated fallback faces (Hebrew + Latin) appended after every selected font in the CSS
// font-family chain — plain CSS per-character font fallback (no unicode-range hacks needed):
// whichever glyphs the chosen font lacks (e.g. a Hebrew-subset font has no Latin glyphs, or vice
// versa) fall through to these automatically.
const heeboHebrewFallback = Heebo({ subsets: ["hebrew"], weight: "700", variable: "--font-af-heebo-hebrew", display: "swap" });
const heeboLatinFallback = Heebo({ subsets: ["latin"], weight: "700", variable: "--font-af-heebo-latin", display: "swap" });

const heebo = Heebo({ subsets: ["hebrew"], weight: "700", variable: "--font-af-heebo", display: "swap" });
const rubik = Rubik({ subsets: ["hebrew"], weight: "700", variable: "--font-af-rubik", display: "swap" });
const assistant = Assistant({ subsets: ["hebrew"], weight: "700", variable: "--font-af-assistant", display: "swap" });
const frankRuhlLibre = Frank_Ruhl_Libre({ subsets: ["hebrew"], weight: "700", variable: "--font-af-frank-ruhl-libre", display: "swap" });
const davidLibre = David_Libre({ subsets: ["hebrew"], weight: "700", variable: "--font-af-david-libre", display: "swap" });
const secularOne = Secular_One({ subsets: ["hebrew"], weight: "400", variable: "--font-af-secular-one", display: "swap" });
const suezOne = Suez_One({ subsets: ["hebrew"], weight: "400", variable: "--font-af-suez-one", display: "swap" });
const alef = Alef({ subsets: ["hebrew"], weight: "700", variable: "--font-af-alef", display: "swap" });
const miriamLibre = Miriam_Libre({ subsets: ["hebrew"], weight: "700", variable: "--font-af-miriam-libre", display: "swap" });
const notoSansHebrew = Noto_Sans_Hebrew({ subsets: ["hebrew"], weight: "700", variable: "--font-af-noto-sans-hebrew", display: "swap" });

const montserrat = Montserrat({ subsets: ["latin"], weight: "700", variable: "--font-af-montserrat", display: "swap" });
const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: "700", variable: "--font-af-playfair-display", display: "swap" });
const lora = Lora({ subsets: ["latin"], weight: "700", variable: "--font-af-lora", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: "700", variable: "--font-af-poppins", display: "swap" });
const merriweather = Merriweather({ subsets: ["latin"], weight: "700", variable: "--font-af-merriweather", display: "swap" });
const dancingScript = Dancing_Script({ subsets: ["latin"], weight: "700", variable: "--font-af-dancing-script", display: "swap" });
const greatVibes = Great_Vibes({ subsets: ["latin"], weight: "400", variable: "--font-af-great-vibes", display: "swap" });
const pacifico = Pacifico({ subsets: ["latin"], weight: "400", variable: "--font-af-pacifico", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], weight: "700", variable: "--font-af-caveat", display: "swap" });
const sacramento = Sacramento({ subsets: ["latin"], weight: "400", variable: "--font-af-sacramento", display: "swap" });

export type AlbumFontOption = { key: string; label: string; category: "hebrew" | "latin"; variable: string };

const variableByKey: Record<string, string> = {
  heebo: heebo.variable,
  rubik: rubik.variable,
  assistant: assistant.variable,
  "frank-ruhl-libre": frankRuhlLibre.variable,
  "david-libre": davidLibre.variable,
  "secular-one": secularOne.variable,
  "suez-one": suezOne.variable,
  alef: alef.variable,
  "miriam-libre": miriamLibre.variable,
  "noto-sans-hebrew": notoSansHebrew.variable,
  montserrat: montserrat.variable,
  "playfair-display": playfairDisplay.variable,
  lora: lora.variable,
  poppins: poppins.variable,
  merriweather: merriweather.variable,
  "dancing-script": dancingScript.variable,
  "great-vibes": greatVibes.variable,
  pacifico: pacifico.variable,
  caveat: caveat.variable,
  sacramento: sacramento.variable,
};

export const ALBUM_FONTS: AlbumFontOption[] = ALBUM_FONT_DEFS.map((def) => ({
  key: def.key,
  label: def.label,
  category: def.category,
  variable: variableByKey[def.key],
}));

const fontByKey = new Map(ALBUM_FONTS.map((f) => [f.key, f]));

// Every font's `.variable` class needs to be present on a shared ancestor so its
// `--font-af-<key>` custom property is actually in scope for albumFontFamilyCss()'s var()
// references below — `.className` (a common mix-up, since it looks like the obvious choice) sets
// a FIXED font-family directly instead, and stacking 20 of those on one element just means
// whichever one wins the cascade "sticks" regardless of which font is actually selected per
// element, which is exactly the "changing the font doesn't change the text" bug this fixes.
export const ALBUM_FONT_CLASS_NAMES = [
  heebo,
  rubik,
  assistant,
  frankRuhlLibre,
  davidLibre,
  secularOne,
  suezOne,
  alef,
  miriamLibre,
  notoSansHebrew,
  montserrat,
  playfairDisplay,
  lora,
  poppins,
  merriweather,
  dancingScript,
  greatVibes,
  pacifico,
  caveat,
  sacramento,
  heeboHebrewFallback,
  heeboLatinFallback,
]
  .map((f) => f.variable)
  .join(" ");

// The chosen font first, then the two Heebo faces as automatic per-glyph fallback (a script the
// chosen font doesn't cover — e.g. Latin digits inside a Hebrew-only subset font — silently
// resolves through these instead of an unstyled system font).
export function albumFontFamilyCss(key: string | undefined): string {
  const font = fontByKey.get(key ?? "heebo") ?? fontByKey.get("heebo")!;
  // `font.variable` (like every ALBUM_FONTS entry's) is next/font's generated CLASSNAME for
  // applying the CSS variable — the right thing to put inside var() is the variable's actual
  // NAME, which every font here was declared with as `--font-af-<key>` (see the Heebo/Rubik/…
  // calls above), not that classname. Using the classname inside var() used to be silently
  // invalid CSS, which is why picking a font never visibly changed anything.
  return `var(--font-af-${font.key}), var(--font-af-heebo-hebrew), var(--font-af-heebo-latin), sans-serif`;
}
