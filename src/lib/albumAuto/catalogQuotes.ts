// The short English lines the catalog style writes on its pages (owner, 2026-11-02: "very short
// positive quotes", empowering, matching what the page's photos show, as the reference book did with
// "Draw your world" on the graffiti page and "Nature is the glass reflecting truth" by the trees).
// Claude picks one for each page from this list by looking at the page's photos (the catalog-quotes
// route); without it, the page's tab name decides (fallbackQuotes). Short sayings only, nothing quoted
// from a song or a book.

export type QuoteTag =
  | "beach"
  | "sunset"
  | "nature"
  | "flowers"
  | "city"
  | "music"
  | "pet"
  | "joy"
  | "freedom"
  | "dream"
  | "light"
  | "travel"
  | "love"
  | "family"
  | "magic"
  | "life";

export type CatalogQuote = { id: string; text: string; tags: QuoteTag[] };

const Q = (id: string, text: string, ...tags: QuoteTag[]): CatalogQuote => ({ id, text, tags });

export const CATALOG_QUOTES: CatalogQuote[] = [
  Q("b1", "Salt in the air, sand in my hair", "beach"),
  Q("b2", "Life is better at the beach", "beach"),
  Q("b3", "Ride the waves", "beach", "freedom"),
  Q("b4", "Happiness comes in waves", "beach", "joy"),
  Q("b5", "Let the sea set you free", "beach", "freedom"),
  Q("b6", "Good times and tan lines", "beach", "joy"),
  Q("b7", "Find me by the sea", "beach"),
  Q("b8", "Ocean air, salty hair", "beach"),
  Q("b9", "Sea, sun and smiles", "beach", "joy"),
  Q("s1", "Chase the sunset", "sunset", "freedom"),
  Q("s2", "Golden hour, golden heart", "sunset", "light"),
  Q("s3", "Stay golden", "sunset", "light"),
  Q("s4", "Every sunset brings a promise", "sunset", "dream"),
  Q("s5", "Hello sunshine", "light", "joy"),
  Q("n1", "Nature is my happy place", "nature"),
  Q("n2", "Stay wild", "nature", "freedom"),
  Q("n3", "Wander often, wonder always", "nature", "travel"),
  Q("n4", "Into the wild", "nature", "freedom"),
  Q("n5", "Breathe in the moment", "nature", "life"),
  Q("n6", "Rooted and growing", "nature", "dream"),
  Q("n7", "Grow through what you go through", "nature", "dream"),
  Q("n8", "Find your wild", "nature", "freedom"),
  Q("f1", "Bloom where you are planted", "flowers", "nature"),
  Q("f2", "Let yourself bloom", "flowers", "dream"),
  Q("f3", "Little flower, big dreams", "flowers", "dream"),
  Q("f4", "Bloom and grow", "flowers", "nature"),
  Q("f5", "Grow your own way", "flowers", "dream"),
  Q("c1", "Draw your world", "city", "dream"),
  Q("c2", "Create your own story", "city", "dream"),
  Q("c3", "Make your mark", "city", "dream"),
  Q("c4", "Color outside the lines", "city", "freedom"),
  Q("c5", "Be bold, be you", "city", "dream"),
  Q("c6", "Paint your own path", "city", "dream"),
  Q("c7", "Stand out", "city"),
  Q("c8", "Own your style", "city"),
  Q("m1", "Let the music play", "music"),
  Q("m2", "Life is a song, sing it", "music", "life"),
  Q("m3", "Dance to your own beat", "music", "freedom"),
  Q("m4", "Music speaks my heart", "music"),
  Q("m5", "Follow your rhythm", "music", "dream"),
  Q("m6", "Play it loud", "music", "joy"),
  Q("p1", "Best friends forever", "pet", "love"),
  Q("p2", "Paws and smiles", "pet", "joy"),
  Q("p3", "Love has four paws", "pet", "love"),
  Q("p4", "My furry best friend", "pet"),
  Q("j1", "Choose joy", "joy"),
  Q("j2", "Laugh often", "joy"),
  Q("j3", "Good vibes only", "joy"),
  Q("j4", "Happiness looks good on you", "joy"),
  Q("j5", "Sparkle and shine", "joy", "light"),
  Q("j6", "Keep smiling", "joy"),
  Q("j7", "Smile, it's a beautiful day", "joy", "light"),
  Q("j8", "Simply happy", "joy"),
  Q("r1", "Jump into life", "freedom", "joy"),
  Q("r2", "Free spirit", "freedom"),
  Q("r3", "Fly high", "freedom", "dream"),
  Q("r4", "Spread your wings", "freedom", "magic"),
  Q("r5", "Dance like nobody's watching", "freedom", "music"),
  Q("r6", "Feel free", "freedom"),
  Q("d1", "Dream big", "dream"),
  Q("d2", "Believe in yourself", "dream"),
  Q("d3", "Be yourself", "dream"),
  Q("d4", "You are enough", "dream"),
  Q("d5", "Born to shine", "dream", "light"),
  Q("d6", "The best is yet to come", "dream", "life"),
  Q("d7", "Brave and beautiful", "dream"),
  Q("d8", "Make it happen", "dream"),
  Q("d9", "Own your story", "dream"),
  Q("d10", "Follow your heart", "dream", "love"),
  Q("d11", "Stay curious", "dream", "travel"),
  Q("d12", "Live your dream", "dream"),
  Q("l1", "Shine bright", "light", "dream"),
  Q("l2", "Let your light shine", "light"),
  Q("l3", "Glow from within", "light"),
  Q("l4", "Be the light", "light"),
  Q("t1", "Adventure awaits", "travel", "freedom"),
  Q("t2", "Explore more", "travel"),
  Q("t3", "Collect moments", "travel", "life"),
  Q("t4", "Go where you feel alive", "travel", "freedom"),
  Q("t5", "Travelling somewhere", "travel"),
  Q("v1", "Together is a wonderful place to be", "love", "family"),
  Q("v2", "Two hearts, one love", "love"),
  Q("v3", "Forever starts today", "love"),
  Q("v4", "Happily ever after", "love", "magic"),
  Q("v5", "Love grows here", "love", "family"),
  Q("v6", "Family is everything", "family"),
  Q("v7", "Home is where the love is", "family", "love"),
  Q("g1", "Believe in magic", "magic"),
  Q("g2", "Butterfly dreams", "magic", "flowers"),
  Q("g3", "A little magic", "magic"),
  Q("g4", "Fairytales do come true", "magic", "love"),
  Q("e1", "Enjoy the little things", "life"),
  Q("e2", "Live in the moment", "life"),
  Q("e3", "Life is beautiful", "life"),
  Q("e4", "Make today amazing", "life", "joy"),
  Q("e5", "Every moment matters", "life"),
  Q("e6", "Life is a journey", "life", "travel"),
  Q("e7", "Do more of what makes you happy", "life", "joy"),
  Q("e8", "Just breathe", "life"),
  Q("e9", "Today is a gift", "life"),
  Q("e10", "Small moments, big memories", "life", "family"),
];

const BY_ID = new Map(CATALOG_QUOTES.map((q) => [q.id, q]));
export const quoteById = (id: string): CatalogQuote | undefined => BY_ID.get(id);

// Which spreads carry a line (the reference: about two in five, never two in a row): the first page
// of every tab, and otherwise one page in three.
export function quoteSpreads(tabs: readonly (string | null | undefined)[]): number[] {
  const out: number[] = [];
  let last = -10;
  tabs.forEach((tab, i) => {
    const tabStart = i === 0 || (tab ?? null) !== (tabs[i - 1] ?? null);
    if (i - last < 2) return;
    if ((tabStart && tab) || i - last >= 3) {
      out.push(i);
      last = i;
    }
  });
  return out;
}

// What a tab's name says about its place (Hebrew or English): the beach, a sunset, nature, the city.
const TAB_TAGS: [RegExp, QuoteTag[]][] = [
  [/חוף|(^|\s)ים(\s|$)|גלים|beach|sea|ocean|surf/i, ["beach"]],
  [/שקיעה|sunset|golden/i, ["sunset"]],
  [/גרפיטי|רחוב|עיר|נמל|graffiti|street|city|urban|port/i, ["city"]],
  [/פרח|פריחה|כלנית|flower|bloom/i, ["flowers"]],
  [/יער|פארק|טבע|שדה|גן|נחל|עין|מעיין|forest|park|nature|garden|field|woods/i, ["nature"]],
  [/גיטרה|כינור|מוזיקה|פסנתר|guitar|music|piano|violin/i, ["music"]],
  [/כלב|חתול|סוס|dog|cat|horse|pet/i, ["pet"]],
  [/חתונה|זוג|חתן|כלה|wedding|couple|bride|groom/i, ["love"]],
  [/משפחה|family/i, ["family"]],
];

export function tabQuoteTags(tab: string | null | undefined): QuoteTag[] {
  if (!tab) return [];
  for (const [re, tags] of TAB_TAGS) if (re.test(tab)) return tags;
  return [];
}

// Without Claude's pick: a line that fits the tab's place when the name tells it, else an uplifting
// one about life and dreams; each line once in the album.
export function fallbackQuotes(spreads: readonly { key: number; tab?: string | null }[], used: Set<string> = new Set()): Map<number, string> {
  const out = new Map<number, string>();
  const general: QuoteTag[] = ["dream", "joy", "life", "light", "freedom"];
  spreads.forEach(({ key, tab }, n) => {
    const tags = tabQuoteTags(tab);
    const pool = CATALOG_QUOTES.filter((q) => !used.has(q.id));
    const fit = tags.length ? pool.filter((q) => q.tags.some((t) => tags.includes(t))) : [];
    const gen = pool.filter((q) => q.tags.some((t) => t === general[n % general.length]));
    const pick = fit[0] ?? gen[0] ?? pool[0];
    if (!pick) return;
    used.add(pick.id);
    out.set(key, pick.text);
  });
  return out;
}

// A line Claude wrote itself when none on the list fits (a plane wreck, a skateboard): kept only when
// it is short English words.
export function cleanCustomQuote(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const t = text.replace(/\s+/g, " ").replace(/^["'“”]+|["'“”]+$/g, "").trim();
  if (!t || t.length > 40) return null;
  if (!/^[A-Za-z][A-Za-z ,.'!&-]*$/.test(t)) return null;
  if (t.split(" ").length > 7) return null;
  return t;
}

// The answer's picks → a line per spread: a listed id, or a short line of its own; each listed line
// once. Spreads it skipped (or answered badly) get the fallback.
export function quotesFromPicks(
  picks: unknown,
  spreads: readonly { key: number; tab?: string | null }[]
): Map<number, string> {
  const out = new Map<number, string>();
  const used = new Set<string>();
  const keys = new Set(spreads.map((s) => s.key));
  if (Array.isArray(picks)) {
    for (const p of picks) {
      if (!p || typeof p !== "object") continue;
      const { page, quoteId, custom } = p as { page?: unknown; quoteId?: unknown; custom?: unknown };
      if (typeof page !== "number" || !keys.has(page) || out.has(page)) continue;
      const listed = typeof quoteId === "string" ? quoteById(quoteId) : undefined;
      if (listed && !used.has(listed.id)) {
        used.add(listed.id);
        out.set(page, listed.text);
        continue;
      }
      const own = cleanCustomQuote(custom);
      if (own && ![...out.values()].includes(own)) out.set(page, own);
    }
  }
  const missing = spreads.filter((s) => !out.has(s.key));
  for (const [k, v] of fallbackQuotes(missing, used)) out.set(k, v);
  return out;
}

// The handwriting of a page's line, in turn: an elegant script, a rounder one, a brush (the reference
// mixes them). Sacramento was too thin to read at this size.
const QUOTE_FONTS = ["great-vibes", "dancing-script", "pacifico"] as const;
export const quoteFont = (n: number): string => QUOTE_FONTS[((n % QUOTE_FONTS.length) + QUOTE_FONTS.length) % QUOTE_FONTS.length];
