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
  Abril_Fatface,
  Alex_Brush,
  Allura,
  Amatic_SC,
  Architects_Daughter,
  Arimo,
  Barlow,
  Bebas_Neue,
  Bellefair,
  Bodoni_Moda,
  Bona_Nova,
  Bona_Nova_SC,
  Cardo,
  Cinzel,
  Cinzel_Decorative,
  Comfortaa,
  Cookie,
  Cormorant_Garamond,
  Courgette,
  Crimson_Text,
  DM_Sans,
  EB_Garamond,
  Fredoka,
  Homemade_Apple,
  IBM_Plex_Sans_Hebrew,
  Indie_Flower,
  Inter,
  Josefin_Sans,
  Julius_Sans_One,
  Kalam,
  Karantina,
  Karla,
  Libertinus_Serif,
  Libre_Baskerville,
  Lobster,
  Lunasima,
  M_PLUS_1p,
  M_PLUS_Rounded_1c,
  Marck_Script,
  Noto_Rashi_Hebrew,
  Noto_Serif_Hebrew,
  Nunito,
  Open_Sans,
  Oswald,
  PT_Serif,
  Parisienne,
  Permanent_Marker,
  Playpen_Sans_Hebrew,
  Quicksand,
  Raleway,
  Righteous,
  Rubik_Broken_Fax,
  Rubik_Bubbles,
  Rubik_Distressed,
  Rubik_Doodle_Shadow,
  Rubik_Doodle_Triangles,
  Rubik_Gemstones,
  Rubik_Glitch,
  Rubik_Iso,
  Rubik_Lines,
  Rubik_Maps,
  Rubik_Marker_Hatch,
  Rubik_Maze,
  Rubik_Microbe,
  Rubik_Moonrocks,
  Rubik_Puddles,
  Rubik_Scribble,
  Rubik_Spray_Paint,
  Rubik_Storm,
  Rubik_Vinyl,
  Rubik_Wet_Paint,
  Satisfy,
  Shadows_Into_Light,
  Solitreo,
  Spectral,
  Tangerine,
  Tinos,
  Varela_Round,
  Work_Sans,
  Yellowtail,
} from "next/font/google";
import localFont from "next/font/local";
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

const amaticSc = Amatic_SC({ subsets: ["hebrew"], weight: "700", variable: "--font-af-amatic-sc", display: "swap" });
const arimo = Arimo({ subsets: ["hebrew"], weight: "700", variable: "--font-af-arimo", display: "swap" });
const bellefair = Bellefair({ subsets: ["hebrew"], weight: "400", variable: "--font-af-bellefair", display: "swap" });
const bonaNova = Bona_Nova({ subsets: ["hebrew"], weight: "700", variable: "--font-af-bona-nova", display: "swap" });
const bonaNovaSc = Bona_Nova_SC({ subsets: ["hebrew"], weight: "700", variable: "--font-af-bona-nova-sc", display: "swap" });
const cardo = Cardo({ subsets: ["hebrew"], weight: "700", variable: "--font-af-cardo", display: "swap" });
const fredoka = Fredoka({ subsets: ["hebrew"], weight: "700", variable: "--font-af-fredoka", display: "swap" });
const ibmPlexSansHebrew = IBM_Plex_Sans_Hebrew({ subsets: ["hebrew"], weight: "700", variable: "--font-af-ibm-plex-sans-hebrew", display: "swap" });
const karantina = Karantina({ subsets: ["hebrew"], weight: "700", variable: "--font-af-karantina", display: "swap" });
const libertinusSerif = Libertinus_Serif({ subsets: ["hebrew"], weight: "400", variable: "--font-af-libertinus-serif", display: "swap" });
const lunasima = Lunasima({ subsets: ["hebrew"], weight: "700", variable: "--font-af-lunasima", display: "swap" });
const mPlus1p = M_PLUS_1p({ subsets: ["hebrew"], weight: "700", variable: "--font-af-m-plus-1p", display: "swap" });
const mPlusRounded1c = M_PLUS_Rounded_1c({ subsets: ["hebrew"], weight: "700", variable: "--font-af-m-plus-rounded-1c", display: "swap" });
const notoRashiHebrew = Noto_Rashi_Hebrew({ subsets: ["hebrew"], weight: "700", variable: "--font-af-noto-rashi-hebrew", display: "swap" });
const notoSerifHebrew = Noto_Serif_Hebrew({ subsets: ["hebrew"], weight: "700", variable: "--font-af-noto-serif-hebrew", display: "swap" });
const openSansHebrew = Open_Sans({ subsets: ["hebrew"], weight: "700", variable: "--font-af-open-sans-hebrew", display: "swap" });
const playpenSansHebrew = Playpen_Sans_Hebrew({ subsets: ["hebrew"], weight: "700", variable: "--font-af-playpen-sans-hebrew", display: "swap" });
const solitreo = Solitreo({ subsets: ["hebrew"], weight: "400", variable: "--font-af-solitreo", display: "swap" });
const tinos = Tinos({ subsets: ["hebrew"], weight: "700", variable: "--font-af-tinos", display: "swap" });
const varelaRound = Varela_Round({ subsets: ["hebrew"], weight: "400", variable: "--font-af-varela-round", display: "swap" });
const rubikDoodleShadow = Rubik_Doodle_Shadow({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-doodle-shadow", display: "swap" });
const rubikDoodleTriangles = Rubik_Doodle_Triangles({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-doodle-triangles", display: "swap" });
const rubikMoonrocks = Rubik_Moonrocks({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-moonrocks", display: "swap" });
const rubikPuddles = Rubik_Puddles({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-puddles", display: "swap" });
const rubikStorm = Rubik_Storm({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-storm", display: "swap" });
const rubikVinyl = Rubik_Vinyl({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-vinyl", display: "swap" });
const rubikWetPaint = Rubik_Wet_Paint({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-wet-paint", display: "swap" });
const rubikMaps = Rubik_Maps({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-maps", display: "swap" });
const rubikMicrobe = Rubik_Microbe({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-microbe", display: "swap" });
const rubikGemstones = Rubik_Gemstones({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-gemstones", display: "swap" });
const rubikIso = Rubik_Iso({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-iso", display: "swap" });
const rubikBubbles = Rubik_Bubbles({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-bubbles", display: "swap" });
const rubikGlitch = Rubik_Glitch({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-glitch", display: "swap" });
const rubikScribble = Rubik_Scribble({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-scribble", display: "swap" });
const rubikSprayPaint = Rubik_Spray_Paint({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-spray-paint", display: "swap" });
const rubikLines = Rubik_Lines({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-lines", display: "swap" });
const rubikMarkerHatch = Rubik_Marker_Hatch({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-marker-hatch", display: "swap" });
const rubikMaze = Rubik_Maze({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-maze", display: "swap" });
const rubikDistressed = Rubik_Distressed({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-distressed", display: "swap" });
const rubikBrokenFax = Rubik_Broken_Fax({ subsets: ["hebrew"], weight: "400", variable: "--font-af-rubik-broken-fax", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: "700", variable: "--font-af-inter", display: "swap" });
const raleway = Raleway({ subsets: ["latin"], weight: "700", variable: "--font-af-raleway", display: "swap" });
const nunito = Nunito({ subsets: ["latin"], weight: "700", variable: "--font-af-nunito", display: "swap" });
const workSans = Work_Sans({ subsets: ["latin"], weight: "700", variable: "--font-af-work-sans", display: "swap" });
const quicksand = Quicksand({ subsets: ["latin"], weight: "700", variable: "--font-af-quicksand", display: "swap" });
const josefinSans = Josefin_Sans({ subsets: ["latin"], weight: "700", variable: "--font-af-josefin-sans", display: "swap" });
const oswald = Oswald({ subsets: ["latin"], weight: "700", variable: "--font-af-oswald", display: "swap" });
const barlow = Barlow({ subsets: ["latin"], weight: "700", variable: "--font-af-barlow", display: "swap" });
const karla = Karla({ subsets: ["latin"], weight: "700", variable: "--font-af-karla", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], weight: "700", variable: "--font-af-dm-sans", display: "swap" });
const cormorantGaramond = Cormorant_Garamond({ subsets: ["latin"], weight: "700", variable: "--font-af-cormorant-garamond", display: "swap" });
const ebGaramond = EB_Garamond({ subsets: ["latin"], weight: "700", variable: "--font-af-eb-garamond", display: "swap" });
const libreBaskerville = Libre_Baskerville({ subsets: ["latin"], weight: "700", variable: "--font-af-libre-baskerville", display: "swap" });
const crimsonText = Crimson_Text({ subsets: ["latin"], weight: "700", variable: "--font-af-crimson-text", display: "swap" });
const cinzel = Cinzel({ subsets: ["latin"], weight: "700", variable: "--font-af-cinzel", display: "swap" });
const bodoniModa = Bodoni_Moda({ subsets: ["latin"], weight: "700", variable: "--font-af-bodoni-moda", display: "swap" });
const abrilFatface = Abril_Fatface({ subsets: ["latin"], weight: "400", variable: "--font-af-abril-fatface", display: "swap" });
const spectral = Spectral({ subsets: ["latin"], weight: "700", variable: "--font-af-spectral", display: "swap" });
const ptSerif = PT_Serif({ subsets: ["latin"], weight: "700", variable: "--font-af-pt-serif", display: "swap" });
const parisienne = Parisienne({ subsets: ["latin"], weight: "400", variable: "--font-af-parisienne", display: "swap" });
const alexBrush = Alex_Brush({ subsets: ["latin"], weight: "400", variable: "--font-af-alex-brush", display: "swap" });
const allura = Allura({ subsets: ["latin"], weight: "400", variable: "--font-af-allura", display: "swap" });
const tangerine = Tangerine({ subsets: ["latin"], weight: "700", variable: "--font-af-tangerine", display: "swap" });
const satisfy = Satisfy({ subsets: ["latin"], weight: "400", variable: "--font-af-satisfy", display: "swap" });
const cookie = Cookie({ subsets: ["latin"], weight: "400", variable: "--font-af-cookie", display: "swap" });
const kalam = Kalam({ subsets: ["latin"], weight: "700", variable: "--font-af-kalam", display: "swap" });
const homemadeApple = Homemade_Apple({ subsets: ["latin"], weight: "400", variable: "--font-af-homemade-apple", display: "swap" });
const marckScript = Marck_Script({ subsets: ["latin"], weight: "400", variable: "--font-af-marck-script", display: "swap" });
const yellowtail = Yellowtail({ subsets: ["latin"], weight: "400", variable: "--font-af-yellowtail", display: "swap" });
const bebasNeue = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-af-bebas-neue", display: "swap" });
const righteous = Righteous({ subsets: ["latin"], weight: "400", variable: "--font-af-righteous", display: "swap" });
const lobster = Lobster({ subsets: ["latin"], weight: "400", variable: "--font-af-lobster", display: "swap" });
const permanentMarker = Permanent_Marker({ subsets: ["latin"], weight: "400", variable: "--font-af-permanent-marker", display: "swap" });
const comfortaa = Comfortaa({ subsets: ["latin"], weight: "700", variable: "--font-af-comfortaa", display: "swap" });
const shadowsIntoLight = Shadows_Into_Light({ subsets: ["latin"], weight: "400", variable: "--font-af-shadows-into-light", display: "swap" });
const indieFlower = Indie_Flower({ subsets: ["latin"], weight: "400", variable: "--font-af-indie-flower", display: "swap" });
const architectsDaughter = Architects_Daughter({ subsets: ["latin"], weight: "400", variable: "--font-af-architects-daughter", display: "swap" });
const courgette = Courgette({ subsets: ["latin"], weight: "400", variable: "--font-af-courgette", display: "swap" });
const cinzelDecorative = Cinzel_Decorative({ subsets: ["latin"], weight: "700", variable: "--font-af-cinzel-decorative", display: "swap" });
const juliusSansOne = Julius_Sans_One({ subsets: ["latin"], weight: "400", variable: "--font-af-julius-sans-one", display: "swap" });

// Not bundled in next/font/google's own catalog (verified against its font-data.json), so loaded
// directly from the TTF Google itself serves for this family, via next/font/local instead.
const gveretLevin = localFont({
  src: "../assets/fonts/GveretLevin-Hebrew.ttf",
  weight: "400",
  variable: "--font-af-gveret-levin",
  display: "swap",
});

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
  "amatic-sc": amaticSc.variable,
  arimo: arimo.variable,
  bellefair: bellefair.variable,
  "bona-nova": bonaNova.variable,
  "bona-nova-sc": bonaNovaSc.variable,
  cardo: cardo.variable,
  fredoka: fredoka.variable,
  "ibm-plex-sans-hebrew": ibmPlexSansHebrew.variable,
  karantina: karantina.variable,
  "libertinus-serif": libertinusSerif.variable,
  lunasima: lunasima.variable,
  "m-plus-1p": mPlus1p.variable,
  "m-plus-rounded-1c": mPlusRounded1c.variable,
  "noto-rashi-hebrew": notoRashiHebrew.variable,
  "noto-serif-hebrew": notoSerifHebrew.variable,
  "open-sans-hebrew": openSansHebrew.variable,
  "playpen-sans-hebrew": playpenSansHebrew.variable,
  solitreo: solitreo.variable,
  tinos: tinos.variable,
  "varela-round": varelaRound.variable,
  "rubik-doodle-shadow": rubikDoodleShadow.variable,
  "rubik-doodle-triangles": rubikDoodleTriangles.variable,
  "rubik-moonrocks": rubikMoonrocks.variable,
  "rubik-puddles": rubikPuddles.variable,
  "rubik-storm": rubikStorm.variable,
  "rubik-vinyl": rubikVinyl.variable,
  "rubik-wet-paint": rubikWetPaint.variable,
  "rubik-maps": rubikMaps.variable,
  "rubik-microbe": rubikMicrobe.variable,
  "rubik-gemstones": rubikGemstones.variable,
  "rubik-iso": rubikIso.variable,
  "rubik-bubbles": rubikBubbles.variable,
  "rubik-glitch": rubikGlitch.variable,
  "rubik-scribble": rubikScribble.variable,
  "rubik-spray-paint": rubikSprayPaint.variable,
  "rubik-lines": rubikLines.variable,
  "rubik-marker-hatch": rubikMarkerHatch.variable,
  "rubik-maze": rubikMaze.variable,
  "rubik-distressed": rubikDistressed.variable,
  "rubik-broken-fax": rubikBrokenFax.variable,
  inter: inter.variable,
  raleway: raleway.variable,
  nunito: nunito.variable,
  "work-sans": workSans.variable,
  quicksand: quicksand.variable,
  "josefin-sans": josefinSans.variable,
  oswald: oswald.variable,
  barlow: barlow.variable,
  karla: karla.variable,
  "dm-sans": dmSans.variable,
  "cormorant-garamond": cormorantGaramond.variable,
  "eb-garamond": ebGaramond.variable,
  "libre-baskerville": libreBaskerville.variable,
  "crimson-text": crimsonText.variable,
  cinzel: cinzel.variable,
  "bodoni-moda": bodoniModa.variable,
  "abril-fatface": abrilFatface.variable,
  spectral: spectral.variable,
  "pt-serif": ptSerif.variable,
  parisienne: parisienne.variable,
  "alex-brush": alexBrush.variable,
  allura: allura.variable,
  tangerine: tangerine.variable,
  satisfy: satisfy.variable,
  cookie: cookie.variable,
  kalam: kalam.variable,
  "homemade-apple": homemadeApple.variable,
  "marck-script": marckScript.variable,
  yellowtail: yellowtail.variable,
  "bebas-neue": bebasNeue.variable,
  righteous: righteous.variable,
  lobster: lobster.variable,
  "permanent-marker": permanentMarker.variable,
  comfortaa: comfortaa.variable,
  "shadows-into-light": shadowsIntoLight.variable,
  "indie-flower": indieFlower.variable,
  "architects-daughter": architectsDaughter.variable,
  courgette: courgette.variable,
  "cinzel-decorative": cinzelDecorative.variable,
  "julius-sans-one": juliusSansOne.variable,
  "gveret-levin": gveretLevin.variable,
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
  amaticSc,
  arimo,
  bellefair,
  bonaNova,
  bonaNovaSc,
  cardo,
  fredoka,
  ibmPlexSansHebrew,
  karantina,
  libertinusSerif,
  lunasima,
  mPlus1p,
  mPlusRounded1c,
  notoRashiHebrew,
  notoSerifHebrew,
  openSansHebrew,
  playpenSansHebrew,
  solitreo,
  tinos,
  varelaRound,
  rubikDoodleShadow,
  rubikDoodleTriangles,
  rubikMoonrocks,
  rubikPuddles,
  rubikStorm,
  rubikVinyl,
  rubikWetPaint,
  rubikMaps,
  rubikMicrobe,
  rubikGemstones,
  rubikIso,
  rubikBubbles,
  rubikGlitch,
  rubikScribble,
  rubikSprayPaint,
  rubikLines,
  rubikMarkerHatch,
  rubikMaze,
  rubikDistressed,
  rubikBrokenFax,
  inter,
  raleway,
  nunito,
  workSans,
  quicksand,
  josefinSans,
  oswald,
  barlow,
  karla,
  dmSans,
  cormorantGaramond,
  ebGaramond,
  libreBaskerville,
  crimsonText,
  cinzel,
  bodoniModa,
  abrilFatface,
  spectral,
  ptSerif,
  parisienne,
  alexBrush,
  allura,
  tangerine,
  satisfy,
  cookie,
  kalam,
  homemadeApple,
  marckScript,
  yellowtail,
  bebasNeue,
  righteous,
  lobster,
  permanentMarker,
  comfortaa,
  shadowsIntoLight,
  indieFlower,
  architectsDaughter,
  courgette,
  cinzelDecorative,
  juliusSansOne,
  gveretLevin,
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
  //
  // The three var() calls are NESTED as each other's fallback argument, not comma-separated
  // siblings in font-family's own value list — those look equivalent when everything resolves,
  // but aren't: if a single var(--font-af-<key>) with no fallback ever fails to resolve (the
  // custom property genuinely isn't in scope for that render — e.g. a font next/font's own
  // fallback-metrics step warned about at build time), the CSS spec makes the ENTIRE containing
  // property value invalid at computed-value time, not just that one comma-separated entry — so
  // the whole font-family falls back to whatever's INHERITED (typically the page's own default
  // Heebo), silently ignoring every option in the list including the later ones. Nesting each
  // var() as the prior one's fallback means a single missing variable only skips past that one
  // link in the chain instead of invalidating the whole declaration.
  return `var(--font-af-${font.key}, var(--font-af-heebo-hebrew, var(--font-af-heebo-latin, sans-serif)))`;
}
