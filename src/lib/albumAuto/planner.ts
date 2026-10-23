import { FACE_MATCH_THRESHOLD } from "@/lib/faceRecognition";
import type {
  AlbumPlan,
  AutoPhoto,
  AutoStyleId,
  CellPeople,
  EventKind,
  FamilyCell,
  FamilyCellId,
  PhotoFaces,
  PlannedSpread,
  PlanOptions,
  SectionKind,
} from "./types";

// Auto album planner: decides which photo goes on which spread, in the owner's book order
// (owners → parents → siblings → grandparents → the event in shooting order; a "בוק" photo
// session: shooting order only, opts.kind). Pure and
// deterministic — the same input always yields the same plan, so re-running the designer doesn't
// shuffle the book.

// ---------------------------------------------------------------------------------------------
// Event kind & cell labels
// ---------------------------------------------------------------------------------------------

function normalizeText(s: string): string {
  // Niqqud and cantillation marks go; Hebrew maqaf, hyphens and underscores all act as spaces
  // ("בר-מצווה", "בר־מצווה", "bar_mitzvah").
  return s
    .toLowerCase()
    .replace(/[\u0591-\u05BD\u05BF-\u05C7]/g, "")
    .replace(/[־\-_–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// A Hebrew word as a whole word: not glued to other letters, except a one-letter preposition
// (ו, ב, ל, מ, ש, כ) and the article (ה) in front ("לבר המצווה", "החתונה", "בחינה"). So "בוק"
// matches "הבוק" but never "בוקר", and "חינה" never matches inside "מבחינה". (No lookbehind: older
// Safari can't parse it.)
const HEB = "א-ת";
const hebrewWord = (body: string) => `(?:^|[^${HEB}])[ובלמשכ]?ה?(?:${body})(?![${HEB}])`;

// Checked in this order: the more specific kinds first. A "בוק בת מצווה" is a book, not the bat
// mitzvah; henna titles sometimes also mention the wedding; "בת מצווה" must not fall through to a
// "בת 60" birthday match.
const KIND_PATTERNS: [EventKind, RegExp][] = [
  ["book", new RegExp(hebrewWord("בוק|בוקים"))],
  ["henna", new RegExp(`${hebrewWord("חינה|חינאה")}|\\bhenn?a\\b|\\bhina\\b`)],
  // "חתונה", "חתונת דנה", "החתונה", "חתונות"; "חופה" is the ceremony.
  ["wedding", new RegExp(`${hebrewWord(`חתונ[${HEB}]*|חופה|חופת`)}|\\bwedding`)],
  // "בת מצווה", "בת-מצוה", "בת המצווה", "לבת המצווה", "בתמצווה", "בת מיצווה".
  ["bat_mitzvah", new RegExp(`${hebrewWord("בת ה?מי?צוו?ה|בתמי?צוו?ה")}|\\bbat ?mi(?:t?z|ts)vah?\\b`)],
  // "בר מצווה" in the same spellings, "עלייה / עליה לתורה", "הנחת תפילין".
  ["bar_mitzvah", new RegExp(`${hebrewWord("בר ה?מי?צוו?ה|ברמי?צוו?ה|עלי?יה לתורה|הנחת תפילין|תפילין")}|\\bbar ?mi(?:t?z|ts)vah?\\b|\\baliyah?\\b`)],
  ["birthday", /יום הולדת|יומהולדת|יום ההולדת|חוגג|חוגגת|birthday|bday/],
  // "יוסי בן 60", "בת 40"
  ["birthday", /(^|\s)(בן|בת|גיל)\s?\d{1,3}(\s|$)/],
  // Last resort: a lone round age like "שרה 60" (no date separators around it, so "12/05" or
  // "30.5" don't count).
  ["birthday", /(^|\s)[1-9]0(\s|$)/],
];

function kindOfText(raw: string | null | undefined): EventKind {
  const text = normalizeText(raw ?? "");
  if (!text) return "other";
  for (const [kind, re] of KIND_PATTERNS) if (re.test(text)) return kind;
  return "other";
}

// The event type's name first (the photographer picked it on the event), then the gallery title.
// A "בוק" in either one wins: a photo-book session is often filed under the bar/bat mitzvah event
// type, with "בוק" only in the gallery's title.
export function detectEventKind(title: string, eventType?: string | null): EventKind {
  const fromType = kindOfText(eventType);
  const fromTitle = kindOfText(title);
  if (fromType === "book" || fromTitle === "book") return "book";
  return fromType !== "other" ? fromType : fromTitle;
}

// The photo cover's two lines (owner, 2026-10-21, the corrected cover of "עלייה לתורה - אורי"): the
// name large and "event | date" small under it — "אורי" and "עלייה לתורה | 5.10.2026". A title in
// two parts ("עלייה לתורה - אורי", "דנה ואורי | חתונה") splits on the dash or bar, and the part that
// names the event kind goes to the small line; a title in one part stays whole, with the date alone
// under it. `date` is the event's day (YYYY-MM-DD), written as on the owner's cover, day first.
export function coverTitleLines(title: string, date?: string | null): { main: string; sub: string | null } {
  const parts = title.split(/\s+[-–—|]\s+/).map((p) => p.trim()).filter(Boolean);
  let main = title.trim();
  let kind: string | null = null;
  if (parts.length >= 2) {
    const k = parts.findIndex((p) => kindOfText(p) !== "other");
    const at = k >= 0 && parts.some((p, i) => i !== k && kindOfText(p) === "other") ? k : -1;
    main = at >= 0 ? parts.filter((_, i) => i !== at).join(" ") : parts[0];
    kind = at >= 0 ? parts[at] : parts.slice(1).join(" ");
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  const day = m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : null;
  const sub = [kind, day].filter(Boolean).join(" | ");
  return { main, sub: sub || null };
}

// How many people the owners' cell holds for the kind, when the photographer didn't write their
// names: one bar/bat mitzvah child, a couple at a wedding or henna. Unknown otherwise.
export function ownersCountFor(kind: EventKind): number | undefined {
  if (kind === "wedding" || kind === "henna") return 2;
  if (kind === "bar_mitzvah" || kind === "bat_mitzvah") return 1;
  return undefined;
}

// The UI shows the cells in this order (parents, the bride's parents at a wedding, owners, siblings,
// the grandparents of both sides). The book order is different (owners first) — see SECTION_PRIORITY
// below.
export const CELL_ORDER: FamilyCellId[] = ["parents", "parents2", "owners", "siblings", "grandparents", "grandparents2"];

const isCouple = (kind: EventKind) => kind === "wedding" || kind === "henna";

// The cells the photographer sees for the kind: two parents' cells only at a wedding or a henna (the
// groom's and the bride's, owner 2026-10-21), the grandparents of both sides at every kind, none in a
// photo-book session.
export function cellsFor(kind: EventKind): FamilyCellId[] {
  if (kind === "book") return [];
  return CELL_ORDER.filter((c) => c !== "parents2" || isCouple(kind));
}

export function cellLabel(cell: FamilyCellId, kind: EventKind): string {
  switch (cell) {
    case "owners":
      if (isCouple(kind)) return "חתן וכלה";
      if (kind === "bar_mitzvah") return "חתן בר המצווה";
      if (kind === "bat_mitzvah") return "כלת בת המצווה";
      return "בעלי השמחה";
    case "parents":
      return isCouple(kind) ? "הורי החתן" : "ההורים";
    case "parents2":
      return "הורי הכלה";
    case "siblings":
      return "אחים ואחיות";
    case "grandparents":
      return isCouple(kind) ? "סבא וסבתא מצד החתן" : "סבא וסבתא מצד אבא";
    case "grandparents2":
      return isCouple(kind) ? "סבא וסבתא מצד הכלה" : "סבא וסבתא מצד אמא";
  }
}

// ---------------------------------------------------------------------------------------------
// Names & reference faces
// ---------------------------------------------------------------------------------------------

// The order the names are written in, as the people stand in the photo: right to left in Hebrew
// (the field opens with "מימין לשמאל:", owner 2026-10-21), left to right in English and Russian.
export type NamesOrder = "rtl" | "ltr";

// A direction the photographer typed at the start themselves wins over the field's.
const LEADING_ORDER: [RegExp, NamesOrder][] = [
  [/^\s*(?:מ)?ימין\s+לשמאל\s*[:：-]?/, "rtl"],
  [/^\s*(?:מ)?שמאל\s+לימין\s*[:：-]?/, "ltr"],
  [/^\s*(?:from\s+)?right\s+to\s+left\s*[:-]?/i, "rtl"],
  [/^\s*(?:from\s+)?left\s+to\s+right\s*[:-]?/i, "ltr"],
  [/^\s*справа\s+налево\s*[:-]?/i, "rtl"],
  [/^\s*слева\s+направо\s*[:-]?/i, "ltr"],
];

function readNames(names: string, order: NamesOrder): { text: string; order: NamesOrder } {
  const text = names ?? "";
  for (const [re, o] of LEADING_ORDER) if (re.test(text)) return { text: text.replace(re, ""), order: o };
  return { text, order };
}

// The names, in the order they were written. Separators: commas, newlines, ";", "&", "+", "/",
// " and ", a standalone "ו", and "ו" as a word prefix joining names ("רחל ודוד", "אמא ואבא").
// Multi-word names ("סבתא שושנה", "אמא רחל") are one name. A bare number names nobody.
export function nameList(names: string): string[] {
  const text = readNames(names, "rtl").text.trim();
  if (!text || /^\d{1,2}$/.test(text)) return [];
  const out: string[] = [];
  for (const seg of text.split(/[,،;\n\r&+/|]|\s+and\s+|\s+ו\s+/i)) {
    const words = seg.trim().split(/\s+/).filter(Boolean);
    let cur: string[] = [];
    words.forEach((w, i) => {
      // Each later word that starts with "ו" + at least two letters opens a new name.
      if (i > 0 && /^ו[א-ת]{2,}/.test(w)) {
        out.push(cur.join(" "));
        cur = [w.slice(1)];
      } else cur.push(w);
    });
    if (cur.length) out.push(cur.join(" "));
  }
  return out;
}

// How many people the free text names ("רחל ודוד" = 2, "אמא רחל, אבא דוד" = 2). A bare number ("3")
// is taken literally.
export function countNames(names: string): number {
  const text = readNames(names, "rtl").text.trim();
  if (/^\d{1,2}$/.test(text)) return Number(text);
  return nameList(names).length;
}

// The reference photo's faces that belong to the cell: the largest N (N = number of names), or,
// with no names, every face at least a quarter the size of the largest (drops background people),
// but never more than `maxPeople` when the cell's head count is known (the owners' cell: one bar
// mitzvah child, a couple — so the parents standing behind the child in the owners' reference
// photo don't become "owners" too).
export function pickCellFaces(faces: { descriptor: number[]; area: number }[], names: string, maxPeople?: number): number[][] {
  return pickFaceIndices(faces, countNames(names), maxPeople).map((i) => faces[i].descriptor);
}

function pickFaceIndices(faces: { area: number }[], named: number, maxPeople?: number): number[] {
  if (!faces || faces.length === 0) return [];
  const sorted = faces
    .map((f, i) => ({ f, i }))
    .sort((a, b) => b.f.area - a.f.area || a.i - b.i);
  if (named > 0) return sorted.slice(0, named).map((x) => x.i);
  const largest = sorted[0].f.area;
  const big = sorted.filter((x) => x.f.area >= largest * 0.25);
  return (maxPeople && maxPeople > 0 ? big.slice(0, maxPeople) : big).map((x) => x.i);
}

// A name that already belongs to an earlier cell, so its face in this photo is that person and not
// one of this cell's (the boy "אורי" or "הילד" in the parents' photo, "אבא" in the grandparents').
// Titles alone ("אבא", "סבתא") never match another cell's names: a bride's parents written "אבא,
// אמא" are not the groom's parents written the same way.
const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\u0591-\u05BD\u05BF-\u05C7]/g, "")
    .replace(/[.,:;!?()"'״׳`־\-–—]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
const OWNER_WORDS = new Set(["חתן", "החתן", "כלה", "הכלה", "כלת", "ילד", "הילד", "ילדה", "הילדה", "groom", "bride", "жених", "невеста"]);
const OWNER_PHRASE = /(?:^|\s)ה?(?:בר|בת)\s+ה?מי?צוו?ה(?:\s|$)|בעל(?:ת|י)?\s+השמחה/;
const PARENT_WORDS = new Set(["אבא", "אמא", "הורים", "ההורים", "dad", "mom", "father", "mother", "parents", "папа", "мама", "родители"]);
const GRANDPARENT_WORDS = new Set(["סבא", "סבתא", "grandpa", "grandma", "grandfather", "grandmother", "дедушка", "бабушка"]);
// "X של החתן" is someone of the groom's, not the groom.
const OF_WORDS = new Set(["של", "of", "у"]);
const TITLE_WORDS = new Set([
  ...OWNER_WORDS,
  ...PARENT_WORDS,
  ...GRANDPARENT_WORDS,
  ...OF_WORDS,
  "אח", "אחות", "האח", "האחות", "אחי", "אחותי", "בר", "בת", "מצווה", "המצווה", "מצוה", "המצוה", "בעל", "בעלת", "בעלי", "השמחה",
  "brother", "sister", "the", "брат", "сестра",
]);

function nameKey(name: string): Set<string> {
  return new Set(normName(name).filter((w) => !TITLE_WORDS.has(w)));
}

function isOwnerTitle(name: string): boolean {
  const words = normName(name);
  if (words.some((w) => OF_WORDS.has(w) || PARENT_WORDS.has(w) || GRANDPARENT_WORDS.has(w))) return false;
  return words.some((w) => OWNER_WORDS.has(w)) || OWNER_PHRASE.test(words.join(" "));
}

function isParentTitle(name: string): boolean {
  const words = normName(name);
  return words.some((w) => PARENT_WORDS.has(w)) && !words.some((w) => GRANDPARENT_WORDS.has(w));
}

function sameName(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const w of small) if (!big.has(w)) return false;
  return true;
}

function earlierPerson(name: string, cell: FamilyCellId, earlier: { cell: FamilyCellId; key: Set<string> }[]): FamilyCellId | null {
  const key = nameKey(name);
  const byName = earlier.find((e) => sameName(e.key, key));
  if (byName) return byName.cell;
  if (cell !== "owners" && isOwnerTitle(name)) return "owners";
  if ((cell === "siblings" || cell === "grandparents" || cell === "grandparents2") && isParentTitle(name)) return "parents";
  return null;
}

// `x`: the face's centre across the photo (0 left, 1 right), so the names can be matched to the faces
// by the order they were written in. Without it the names only count.
export type CellReference = { id: FamilyCellId; faces: { descriptor: number[]; area: number; x?: number }[]; names: string };

// What became of each face of a cell's reference photo: one of the cell's people (`cell`), a person of
// an earlier cell (`known`, with that cell), or left out (`unused`: a background face beyond the
// names). `name`: the name written for it, when the names could be matched to the faces.
export type CellFaceUse = { status: "cell" | "known" | "unused"; name: string | null; knownCell: FamilyCellId | null };

// Every filled cell's faces, the cells in book order (owners first). A reference photo often shows
// people of an earlier cell too: the parents with the bar mitzvah boy standing in front, the
// grandparents with the couple. Picking the cell's largest faces would then make the boy one of "the
// parents", and his own shots would leave the owners' pages. Two ways keep him out:
// - By the names (owner, 2026-10-21): the names are written in the order the people stand ("מימין
//   לשמאל: אבא, אורי, אמא"), so each of the cell's faces, taken in that order across the photo, gets
//   its name. A name an earlier cell already has ("אורי" in the owners' cell), or a title of an earlier
//   cell ("הילד", "החתן"; "אבא" among the grandparents), marks that face as the earlier person.
// - By the faces: each person already known is matched to their own face in the photo (closest pairs
//   first, one face per person, within the same-person distance), and those faces are left out — only
//   the surplus over the names written, when there are names, so a cell's own named people stay. When
//   the names already account for an earlier person, the names decide and this is skipped.
// The owners' cell takes at most the kind's head count when it has no names (ownersCountFor).
export function cellFaceUses(refs: CellReference[], kind?: EventKind, order: NamesOrder = "rtl"): { id: FamilyCellId; faces: CellFaceUse[] }[] {
  const out: { id: FamilyCellId; faces: CellFaceUse[] }[] = [];
  const known: { cell: FamilyCellId; descriptor: number[] }[] = [];
  const earlierNames: { cell: FamilyCellId; key: Set<string> }[] = [];
  for (const cell of SECTION_PRIORITY) {
    const ref = refs.find((r) => r.id === cell);
    if (!ref || !ref.faces || ref.faces.length === 0) continue;
    const { order: dir } = readNames(ref.names, order);
    const names = nameList(ref.names);
    const named = countNames(ref.names);
    const owner = names.map((n) => earlierPerson(n, cell, earlierNames));
    const uses: CellFaceUse[] = ref.faces.map(() => ({ status: "unused", name: null, knownCell: null }));

    // By the faces: an earlier person's own face, up to the surplus over the names. Names that can
    // be matched to the faces and already name an earlier person decide instead.
    const canMatch = names.length > 0 && ref.faces.length >= names.length && ref.faces.every((f) => typeof f.x === "number");
    const maxDrop = canMatch && owner.some(Boolean) ? 0 : named > 0 ? Math.max(0, ref.faces.length - named) : ref.faces.length;
    const pairs: { k: number; f: number; d: number }[] = [];
    known.forEach((k, ki) =>
      ref.faces.forEach((face, fi) => {
        const d = euclidean(k.descriptor, face.descriptor);
        if (d < FACE_MATCH_THRESHOLD) pairs.push({ k: ki, f: fi, d });
      })
    );
    pairs.sort((a, b) => a.d - b.d || a.k - b.k || a.f - b.f);
    const matched = new Set<number>();
    let dropped = 0;
    for (const p of pairs) {
      if (dropped >= maxDrop) break;
      if (uses[p.f].status === "known" || matched.has(p.k)) continue;
      uses[p.f] = { status: "known", name: null, knownCell: known[p.k].cell };
      matched.add(p.k);
      dropped++;
    }

    // The cell's faces among the rest, then the names over them in the order they were written.
    const rest = ref.faces.map((f, i) => ({ ...f, i })).filter((f) => uses[f.i].status !== "known");
    const chosen = pickFaceIndices(rest, named, cell === "owners" && kind ? ownersCountFor(kind) : undefined).map((j) => rest[j].i);
    for (const i of chosen) if (ref.faces[i].descriptor?.length) uses[i] = { status: "cell", name: null, knownCell: null };
    const positioned = chosen.filter((i) => uses[i].status === "cell" && typeof ref.faces[i].x === "number");
    if (names.length > 0 && positioned.length === names.length) {
      positioned.sort((a, b) => (dir === "rtl" ? (ref.faces[b].x as number) - (ref.faces[a].x as number) : (ref.faces[a].x as number) - (ref.faces[b].x as number)));
      positioned.forEach((i, n) => {
        uses[i] = owner[n] ? { status: "known", name: names[n], knownCell: owner[n] } : { status: "cell", name: names[n], knownCell: null };
      });
    }
    names.forEach((n, k) => {
      if (!owner[k]) earlierNames.push({ cell, key: nameKey(n) });
    });
    out.push({ id: cell, faces: uses });
    ref.faces.forEach((f, i) => {
      if (uses[i].status !== "unused" && f.descriptor?.length) known.push({ cell: uses[i].status === "cell" ? cell : (uses[i].knownCell as FamilyCellId), descriptor: f.descriptor });
    });
  }
  return out;
}

// Every filled cell's people (see cellFaceUses), the largest face first.
export function cellPeopleFromReferences(refs: CellReference[], kind?: EventKind, order: NamesOrder = "rtl"): CellPeople[] {
  const out: CellPeople[] = [];
  for (const { id, faces } of cellFaceUses(refs, kind, order)) {
    const ref = refs.find((r) => r.id === id) as CellReference;
    const descriptors = ref.faces
      .map((f, i) => ({ f, i }))
      .filter((x) => faces[x.i].status === "cell" && Array.isArray(x.f.descriptor) && x.f.descriptor.length > 0)
      .sort((a, b) => b.f.area - a.f.area || a.i - b.i)
      .map((x) => x.f.descriptor);
    if (descriptors.length > 0) out.push({ id, descriptors });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------------------------

type Bounds = { min: number; max: number };
type SectionGroup = "owners" | "family" | "event";

const STYLE_BOUNDS: Record<AutoStyleId, Record<SectionGroup, Bounds>> = {
  // Clean and modern: as many photos a page as the photographer's own albums (2026-10-06) — 3-5 on
  // the opening pages, 8-15 later (the page caps below still hold).
  clean: { owners: { min: 3, max: 5 }, family: { min: 4, max: 8 }, event: { min: 7, max: 13 } },
  catalog: { owners: { min: 2, max: 4 }, family: { min: 3, max: 6 }, event: { min: 4, max: 8 } },
  scribble: { owners: { min: 2, max: 3 }, family: { min: 3, max: 5 }, event: { min: 3, max: 6 } },
  modern: { owners: { min: 3, max: 5 }, family: { min: 4, max: 8 }, event: { min: 7, max: 13 } },
};
// Owner's rules (2026-09-29): never a spread with a single photo (every minimum above is ≥ 2, and
// mergeSingles() catches the rest), and a HARD limit of 30 pages ("דפים") counting the cover — with
// the count left empty the book never goes past it and puts more photos on each page instead; a
// count the photographer typed is capped at 30 too. Per-page photo caps by position: see pageCap().
const AUTO_MAX_PAGES = 30;
// Shots this close together are a burst of the same moment: never on the same spread.
const BURST_MS = 3000;

// Absolute ceiling of photos on one spread, even when a target spread count forces stretching.
const HARD_MAX_PER_SPREAD = 20;
// A gap this long between consecutive shots usually means a new stage of the event.
const STAGE_GAP_MS = 15 * 60 * 1000;
// Book order (differs from the UI's CELL_ORDER): the groom's side before the bride's, the father's
// before the mother's.
const SECTION_PRIORITY: FamilyCellId[] = ["owners", "parents", "parents2", "siblings", "grandparents", "grandparents2"];
const cellRecord = <T,>(v: () => T): Record<FamilyCellId, T> =>
  ({ owners: v(), parents: v(), parents2: v(), siblings: v(), grandparents: v(), grandparents2: v() });
// Owner's book structure (2026-09-30), when the photographer filled the family cells: the pages
// after the cover run owners (1-3), parents (4-5), siblings (6-8), grandparents (9-11), then the rest
// of the event in shooting order. These are each section's page SLOTS: a section with fewer photos
// takes fewer pages (never an empty page or a page short of photos), and the next one moves up.
// Two sides (owner, 2026-10-21): the bride's parents get 2 slots of their own after the groom's; the
// grandparents' 3 slots become 2 for each side when both sides are filled.
function sectionSlots(cellSize: Record<FamilyCellId, number>): Record<FamilyCellId, number> {
  const bothGrand = cellSize.grandparents > 0 && cellSize.grandparents2 > 0;
  return { owners: 3, parents: 2, parents2: 2, siblings: 3, grandparents: bothGrand ? 2 : 3, grandparents2: bothGrand ? 2 : 3 };
}

function groupOf(section: SectionKind): SectionGroup {
  if (section === "owners") return "owners";
  if (section === "event") return "event";
  return "family";
}

// Local copy: faceRecognition.ts keeps its distance helper private.
function euclidean(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
function compareFilename(a: AutoPhoto, b: AutoPhoto): number {
  return collator.compare(a.filename ?? "", b.filename ?? "") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// Shooting order. With ≥70% EXIF times, sort by time and give each timeless photo an interpolated
// time from its file-name neighbours (cameras number files sequentially, so the file name tells
// where it sits between the timed shots). With fewer times, the file name alone is more reliable.
// Returns the ordered photos plus an effective time per photo (null when times aren't used).
function shootingOrder(photos: AutoPhoto[]): { ordered: AutoPhoto[]; time: Map<string, number> | null } {
  const byName = [...photos].sort(compareFilename);
  const timed = photos.filter((p) => typeof p.takenAt === "number" && Number.isFinite(p.takenAt));
  if (photos.length === 0 || timed.length / photos.length < 0.7) return { ordered: byName, time: null };

  const time = new Map<string, number>();
  const nameIdx = new Map<string, number>();
  byName.forEach((p, i) => nameIdx.set(p.id, i));
  for (let i = 0; i < byName.length; i++) {
    const p = byName[i];
    if (typeof p.takenAt === "number" && Number.isFinite(p.takenAt)) {
      time.set(p.id, p.takenAt);
      continue;
    }
    let prev = -1;
    for (let j = i - 1; j >= 0; j--) if (typeof byName[j].takenAt === "number") { prev = j; break; }
    let next = -1;
    for (let j = i + 1; j < byName.length; j++) if (typeof byName[j].takenAt === "number") { next = j; break; }
    if (prev >= 0 && next >= 0) {
      const tp = byName[prev].takenAt as number;
      const tn = byName[next].takenAt as number;
      time.set(p.id, tp + ((tn - tp) * (i - prev)) / (next - prev));
    } else if (prev >= 0) {
      time.set(p.id, byName[prev].takenAt as number);
    } else if (next >= 0) {
      time.set(p.id, byName[next].takenAt as number);
    }
  }
  const ordered = [...photos].sort(
    (a, b) => (time.get(a.id) as number) - (time.get(b.id) as number) || (nameIdx.get(a.id) as number) - (nameIdx.get(b.id) as number)
  );
  return { ordered, time };
}

type PhotoInfo = {
  faceCount: number;
  identified: number; // faces matched to a cell person
  cells: Set<FamilyCellId>; // cells with at least one person in the photo (ambiguous faces add both)
  cellArea: Record<FamilyCellId, number>; // summed face area per cell
  identifiedArea: number;
  owners: number[]; // the owners' people (indices into the people list) matched in the photo
};

type Person = { cell: FamilyCellId; refs: number[][] };

// Face matching, made as precise as the descriptors allow (owner, 2026-09-30: the book's family
// pages depend on it):
// - Per PERSON, not per cell: one face is one person, and one person appears once per photo (two
//   faces never both match the same sibling). Pairs are assigned greedily, closest first.
// - Look-alikes: a face whose best match is not clearly better (MARGIN) than the best person of
//   ANOTHER cell counts for both cells, so it can't slip onto the owners-only pages (a father who
//   looks like the groom's grandfather). The section filters are strict, so this errs on precision.
// - Small faces carry the least reliable descriptors: they need a tighter distance.
// - Reference expansion (expandReferences): a single reference face per person misses the same
//   person at another angle or light, so faces that match very confidently join that person's
//   references before the real matching pass.
const MARGIN = 0.05;
const SMALL_FACE_AREA = 0.0025; // ~5% × 5% of the photo
const SMALL_FACE_THRESHOLD = FACE_MATCH_THRESHOLD - 0.05;
const EXPAND_THRESHOLD = 0.42;
const EXPAND_MARGIN = 0.1;
const EXPAND_MAX_REFS = 12;

function personDistance(descriptor: number[], person: Person): number {
  let best = Number.POSITIVE_INFINITY;
  for (const r of person.refs) {
    const d = euclidean(descriptor, r);
    if (d < best) best = d;
  }
  return best;
}

function expandReferences(people: Person[], faces: PhotoFaces[]): Person[] {
  if (people.length === 0) return people;
  const extra: { d: number; descriptor: number[] }[][] = people.map(() => []);
  for (const photo of faces) {
    for (const face of photo.faces) {
      if (face.area < SMALL_FACE_AREA) continue;
      let bi = -1;
      let bd = Number.POSITIVE_INFINITY;
      let second = Number.POSITIVE_INFINITY; // nearest OTHER person
      people.forEach((p, i) => {
        const d = personDistance(face.descriptor, p);
        if (d < bd) {
          second = bd;
          bd = d;
          bi = i;
        } else if (d < second) second = d;
      });
      if (bi >= 0 && bd < EXPAND_THRESHOLD && second - bd >= EXPAND_MARGIN) extra[bi].push({ d: bd, descriptor: face.descriptor });
    }
  }
  return people.map((p, i) => ({
    cell: p.cell,
    refs: [...p.refs, ...extra[i].sort((a, b) => a.d - b.d).slice(0, EXPAND_MAX_REFS).map((e) => e.descriptor)],
  }));
}

function analyzeFaces(faces: PhotoFaces["faces"], people: Person[]): PhotoInfo {
  const info: PhotoInfo = {
    faceCount: faces.length,
    identified: 0,
    cells: new Set(),
    cellArea: cellRecord(() => 0),
    identifiedArea: 0,
    owners: [],
  };
  if (people.length === 0) return info;
  const pairs: { f: number; p: number; d: number }[] = [];
  faces.forEach((face, f) => {
    const limit = face.area < SMALL_FACE_AREA ? SMALL_FACE_THRESHOLD : FACE_MATCH_THRESHOLD;
    people.forEach((person, p) => {
      const d = personDistance(face.descriptor, person);
      if (d < limit) pairs.push({ f, p, d });
    });
  });
  pairs.sort((a, b) => a.d - b.d);
  const faceDone = new Set<number>();
  const personDone = new Set<number>();
  for (const { f, p, d } of pairs) {
    if (faceDone.has(f) || personDone.has(p)) continue;
    faceDone.add(f);
    personDone.add(p);
    const cell = people[p].cell;
    const face = faces[f];
    info.identified++;
    info.cells.add(cell);
    info.cellArea[cell] += face.area;
    info.identifiedArea += face.area;
    if (cell === "owners") info.owners.push(p);
    // Look-alike from another cell within the margin: the face counts for that cell too.
    for (const q of pairs) {
      if (q.f === f && people[q.p].cell !== cell && q.d - d < MARGIN) info.cells.add(people[q.p].cell);
    }
  }
  info.owners.sort((a, b) => a - b);
  return info;
}

// A family section's photos over at most `caps.length` pages (the section's page slots), page i
// holding at most caps[i] photos (the page cap of its position in the book and the style's maximum,
// see familyCaps). As many pages as the section's minimum per page allows, and more when the caps
// need them; two pages split 60:40 (owner, 2026-09-30), more pages as even as possible. Never a
// single-photo page (n ≥ 2). Pages keep consecutive runs, so the section keeps its order. The
// caller never passes more photos than the caps hold (the last page takes any excess, defensively).
export function splitSection(ids: string[], caps: number[], min: number): string[][] {
  const n = ids.length;
  if (n === 0 || caps.length === 0) return n === 0 ? [] : [ids.slice()];
  const slots = caps.length;
  let byCaps = 1;
  for (let room = caps[0]; room < n && byCaps < slots; byCaps++) room += caps[byCaps];
  const byMin = Math.max(1, Math.min(slots, Math.floor(n / Math.max(2, min))));
  const pages = Math.max(1, Math.min(slots, Math.max(byCaps, byMin), Math.floor(n / 2) || 1));
  let sizes: number[];
  if (pages === 1) sizes = [n];
  else if (pages === 2) {
    // 60:40, as close as the caps allow and never a lone photo on the second page.
    const lo = Math.max(2, n - caps[1]);
    const hi = Math.min(caps[0], n - 2);
    const first = Math.max(lo, Math.min(hi, Math.round(n * 0.6)));
    sizes = [first, n - first];
  } else {
    // One photo at a time to the emptiest page that still has room (the earlier page on a tie):
    // as even as possible, the extra photos on the first pages, every page within its cap.
    sizes = new Array(pages).fill(0);
    for (let k = 0; k < n; k++) {
      let best = -1;
      for (let i = 0; i < pages; i++) if (sizes[i] < caps[i] && (best < 0 || sizes[i] < sizes[best])) best = i;
      sizes[best < 0 ? pages - 1 : best]++;
    }
  }
  const out: string[][] = [];
  let pos = 0;
  sizes.forEach((size, i) => {
    out.push(ids.slice(pos, i === sizes.length - 1 ? n : pos + size));
    pos += size;
  });
  return out;
}

// The most photos each of a family section's page slots may hold: the page cap of the slot's
// position in the book (pageCap, 1-based, the cover not counted) and the style's maximum for the
// section.
export function familyCaps(firstPos: number, slots: number, max: number): number[] {
  return Array.from({ length: Math.max(0, slots) }, (_, i) => Math.min(pageCap(firstPos + i), max));
}

// The owners' group of shots with two owners or more in the frame (see mixOwnersShots). Each owner
// alone is the group of their person index (≥ 0).
export const TOGETHER = -1;

// The owners' section (owner, 2026-10-20: "the groom and the bride, each alone and together"): the
// owners' shots fall into groups, together (TOGETHER) and each owner alone. `ranked` is the
// candidates closest first. The pick takes the closest shot of each group in turn (together first),
// so a group with many close shots can't crowd the others out of the section's `room`. The order
// then spreads each group's shots (in shooting order) evenly through the section, a together shot
// first, so every page mixes them. With a single group (one owner, a bar/bat mitzvah child) this is
// simply the closest `room` shots in shooting order.
export function mixOwnersShots(ranked: string[], room: number, groupOf: (id: string) => number, order: (id: string) => number): string[] {
  if (room <= 0 || ranked.length === 0) return [];
  const groups = new Map<number, string[]>();
  for (const id of ranked) {
    const g = groupOf(id);
    const list = groups.get(g);
    if (list) list.push(id);
    else groups.set(g, [id]);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === TOGETHER ? -1 : b === TOGETHER ? 1 : a - b));
  const picked = new Map<number, string[]>(keys.map((k) => [k, []]));
  let left = room;
  for (let round = 0; left > 0; round++) {
    let took = false;
    for (const k of keys) {
      const list = groups.get(k) as string[];
      if (left > 0 && round < list.length) {
        (picked.get(k) as string[]).push(list[round]);
        left--;
        took = true;
      }
    }
    if (!took) break;
  }
  // Group k's i-th shot (of n) sits at (i + ½) / n of the section; together shots at i / n, so the
  // section opens with one.
  const placed: { id: string; at: number; g: number; o: number }[] = [];
  keys.forEach((k, g) => {
    const list = (picked.get(k) as string[]).sort((a, b) => order(a) - order(b));
    list.forEach((id, i) => placed.push({ id, at: (i + (k === TOGETHER ? 0 : 0.5)) / list.length, g, o: order(id) }));
  });
  placed.sort((a, b) => a.at - b.at || a.g - b.g || a.o - b.o);
  return placed.map((p) => p.id);
}

// Deterministic variety: consecutive spreads cycle through different sizes inside the bounds.
const SIZE_PATTERN = [1, 3, 0, 2, 4, 1, 5, 0, 3, 2];
function patternSize(b: Bounds, i: number): number {
  const span = b.max - b.min + 1;
  return b.min + (SIZE_PATTERN[i % SIZE_PATTERN.length] % span);
}

// Splits `items` into spreads of `bounds` sizes. At each step it only considers sizes that leave a
// usable remainder (0 or ≥ min). Among those it prefers breaking right before a stage gap
// (> 15 min, the largest one in reach); otherwise it takes the size closest to the variety pattern.
function chunk<T>(items: T[], bounds: Bounds, seed: number, gapAfter?: (i: number) => number): T[][] {
  const out: T[][] = [];
  let pos = 0;
  let step = 0;
  while (pos < items.length) {
    const left = items.length - pos;
    if (left <= bounds.min) {
      out.push(items.slice(pos));
      break;
    }
    const valid: number[] = [];
    for (let s = bounds.min; s <= Math.min(bounds.max, left); s++) {
      const rem = left - s;
      if (rem === 0 || rem >= bounds.min) valid.push(s);
    }
    let size: number;
    if (valid.length === 0) {
      // Bounds too narrow to split evenly (only possible with stretched target bounds): take the
      // minimum now; the tail gets merged below if it fits.
      size = bounds.min;
    } else {
      const target = patternSize(bounds, seed + step);
      size = valid.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best), valid[0]);
      if (gapAfter) {
        let bestGap = STAGE_GAP_MS;
        let hit = false;
        for (const s of valid) {
          if (s === left) continue; // the section's end is already a break
          const g = gapAfter(pos + s - 1);
          if (g > bestGap) {
            bestGap = g;
            size = s;
            hit = true;
          }
        }
        // Look one spread ahead: a stage gap just out of reach (k items away, k > max) — pick a
        // size now so the next spread can end exactly on it.
        if (!hit) {
          for (let k = bounds.max + 1; k <= Math.min(left - 1, bounds.max * 2); k++) {
            if (gapAfter(pos + k - 1) <= STAGE_GAP_MS) continue;
            const fits = valid.filter((s) => k - s >= bounds.min && k - s <= bounds.max);
            if (fits.length > 0) {
              size = fits.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best), fits[0]);
              break;
            }
          }
        }
      }
    }
    out.push(items.slice(pos, pos + size));
    pos += size;
    step++;
  }
  // A too-small tail joins the previous spread when that stays within the hard ceiling.
  if (out.length >= 2 && out[out.length - 1].length < bounds.min) {
    const tail = out[out.length - 1];
    const prev = out[out.length - 2];
    if (prev.length + tail.length <= Math.max(bounds.max, HARD_MAX_PER_SPREAD)) {
      out.splice(out.length - 2, 2, [...prev, ...tail]);
    }
  }
  return out;
}

// Moves burst shots (taken within BURST_MS of each other) apart: when a spread holds two, the later
// one swaps with a photo of the next spread that clashes with nothing there. Order stays roughly
// chronological (a swap only ever crosses one spread boundary).
function separateBursts(chunks: string[][], time: Map<string, number>): void {
  const clashes = (id: string, group: string[]) =>
    group.some((o) => o !== id && Math.abs((time.get(o) as number) - (time.get(id) as number)) < BURST_MS);
  // A long burst (10 frames in 12 s at this event) can't be split by swapping with the next spread
  // only, so the swap partner may come from up to two spreads ahead.
  for (let i = 0; i + 1 < chunks.length; i++) {
    for (let guard = 0; guard < chunks[i].length * 2; guard++) {
      const cur = chunks[i];
      const dup = [...cur].reverse().find((id) => clashes(id, cur));
      if (!dup) break;
      let done = false;
      for (let j = i + 1; j <= Math.min(i + 2, chunks.length - 1) && !done; j++) {
        const other = chunks[j];
        const swap = other.find((x) => !clashes(x, cur.filter((c) => c !== dup)) && !clashes(dup, other.filter((n) => n !== x)));
        if (swap) {
          cur[cur.indexOf(dup)] = swap;
          other[other.indexOf(swap)] = dup;
          done = true;
        }
      }
      if (!done) break;
    }
  }
}

// Owner's per-page caps (2026-09-29), by the spread's position in the book (1-based, the cover not
// counted): pages 1-5 up to 6 photos, 6-10 up to 8, 11-20 up to 15, 21-30 up to 20. With the 250
// photos clients may pick at most, 29 spreads hold 400, so there's room.
export function pageCap(pos: number): number {
  return pos <= 5 ? 6 : pos <= 10 ? 8 : pos <= 20 ? 15 : 20;
}
const pageCapAt = pageCap;

// The last pass, and the one that makes the limits hard: when the plan has more spreads than
// `maxSpreads`, or a spread over its page cap, the whole book (in its planned order) is split again
// into at most `maxSpreads` spreads, each of 2..pageCap photos, as even as the caps allow. Cuts are
// placed by dynamic programming: it prefers cutting at section boundaries and stage gaps and avoids
// burst shots on one spread. Only when even `maxSpreads` full spreads can't hold every photo (a
// short typed count with very many photos) do the last spreads go past their cap — a photo is
// never dropped.
function fitPages(
  spreads: PlannedSpread[],
  maxSpreads: number,
  time: Map<string, number> | null,
  heroFor: (section: SectionKind, ids: string[]) => string,
  // Book position of the first spread here (the family pages before the event take the first ones).
  offset = 0,
  // The cost of two sections sharing a page. The book by the gallery's tabs raises it, so a page
  // mixes two tabs only when the page limits leave no other way.
  mixPenalty = 6
): PlannedSpread[] {
  const pageCap = (pos: number) => pageCapAt(pos + offset);
  const fits = spreads.length <= maxSpreads && spreads.every((s, i) => s.photoIds.length <= pageCap(i + 1) && (s.photoIds.length >= 2 || spreads.length === 1));
  const ids = spreads.flatMap((s) => s.photoIds);
  const P = ids.length;
  if (fits || P < 4) return spreads;
  // Section boundaries: each gallery tab is its own section when the book follows the tabs (two
  // stage tabs are both "event" spreads but must not share a page), else the section kind.
  const sec = spreads.flatMap((s) => s.photoIds.map(() => s.tab ?? s.section));
  const kindOf = new Map(spreads.map((s) => [s.tab ?? s.section, s.section] as const));
  // Where the plan already cut (its stage-aware chunking): kept when the sizes allow.
  const planCut = new Set<number>();
  spreads.reduce((pos, s) => (planCut.add(pos + s.photoIds.length), pos + s.photoIds.length), 0);
  const maxN = Math.max(1, Math.min(maxSpreads, Math.floor(P / 2)));
  const capSum = (n: number) => Array.from({ length: n }, (_, i) => pageCap(i + 1)).reduce((a, b) => a + b, 0);
  let N = Math.min(spreads.length, maxN);
  while (N < maxN && capSum(N) < P) N++;
  const caps = Array.from({ length: N }, (_, i) => pageCap(i + 1));
  // Not enough room: the last spreads take the extra photos first (up to HARD_MAX_PER_SPREAD each,
  // from the end backwards), and only past that, round robin from the end.
  let total = capSum(N);
  for (let i = N - 1; i >= 0 && total < P; i--) {
    const add = Math.min(P - total, Math.max(0, HARD_MAX_PER_SPREAD - caps[i]));
    caps[i] += add;
    total += add;
  }
  for (let i = N - 1; total < P; total++, i = i === 0 ? N - 1 : i - 1) caps[i]++;
  // Even sizes: the level L with sum(min(cap, L)) = P.
  let lo = 0;
  let hi = Math.max(...caps);
  for (let it = 0; it < 40; it++) {
    const mid = (lo + hi) / 2;
    if (caps.reduce((a, c) => a + Math.min(c, mid), 0) < P) lo = mid;
    else hi = mid;
  }
  const want = caps.map((c) => Math.min(c, hi));
  // Prefix counts: section changes and burst pairs between neighbours k, k+1.
  const secCh = [0];
  const burst = [0];
  for (let k = 0; k + 1 < P; k++) {
    secCh.push(secCh[k] + (sec[k] !== sec[k + 1] ? 1 : 0));
    const ta = time?.get(ids[k]);
    const tb = time?.get(ids[k + 1]);
    burst.push(burst[k] + (ta !== undefined && tb !== undefined && Math.abs(tb - ta) < BURST_MS ? 1 : 0));
  }
  const inside = (pre: number[], a: number, b: number) => pre[b - 1] - pre[a]; // pairs within [a, b)
  const cutBonus = (b: number) => {
    if (b >= P) return 0;
    let bonus = (sec[b - 1] !== sec[b] ? 3 : 0) + (planCut.has(b) ? 0.5 : 0);
    const ta = time?.get(ids[b - 1]);
    const tb = time?.get(ids[b]);
    if (ta !== undefined && tb !== undefined && tb - ta > STAGE_GAP_MS) bonus += 1;
    return bonus;
  };
  const INF = Number.POSITIVE_INFINITY;
  const best: number[][] = Array.from({ length: N + 1 }, () => new Array(P + 1).fill(INF));
  const from: number[][] = Array.from({ length: N + 1 }, () => new Array(P + 1).fill(-1));
  best[0][0] = 0;
  for (let i = 0; i < N; i++)
    for (let a = 0; a < P; a++) {
      if (best[i][a] === INF) continue;
      for (let size = 2; size <= caps[i] && a + size <= P; size++) {
        const b = a + size;
        const c = best[i][a] + (size - want[i]) ** 2 + mixPenalty * inside(secCh, a, b) + 2 * inside(burst, a, b) - cutBonus(b);
        if (c < best[i + 1][b]) {
          best[i + 1][b] = c;
          from[i + 1][b] = a;
        }
      }
    }
  // The best book of at most N spreads that holds every photo.
  let n = -1;
  for (let k = 1; k <= N; k++) if (best[k][P] < INF && (n < 0 || best[k][P] < best[n][P])) n = k;
  if (n < 0) return spreads;
  const cuts: [number, number][] = [];
  for (let k = n, b = P; k > 0; k--) {
    const a = from[k][b];
    cuts.unshift([a, b]);
    b = a;
  }
  const chunks = cuts.map(([a, b]) => ids.slice(a, b));
  const keys = cuts.map(([a]) => sec[a]);
  const sections = keys.map((k) => kindOf.get(k) as SectionKind);
  // Bursts that still share a spread swap apart inside runs of event spreads (sizes stay the same).
  if (time) {
    for (let i = 0; i < chunks.length; ) {
      if (sections[i] !== "event") {
        i++;
        continue;
      }
      let j = i;
      while (j < chunks.length && sections[j] === "event") j++;
      separateBursts(chunks.slice(i, j), time);
      i = j;
    }
  }
  return chunks.map((c, i) => ({ section: sections[i], photoIds: c, heroId: heroFor(sections[i], c), ...(keys[i] !== sections[i] ? { tab: keys[i] } : {}) }));
}

// A spread with one photo is never allowed (owner's rule): it joins its neighbour — the previous
// spread when it's the same section, else the next, else the previous regardless of section.
function mergeSingles(spreads: PlannedSpread[], byId: Map<string, AutoPhoto>): void {
  for (let i = 0; i < spreads.length && spreads.length > 1; i++) {
    const s = spreads[i];
    if (s.photoIds.length !== 1) continue;
    const prev = spreads[i - 1];
    const next = spreads[i + 1];
    // The owners' pages hold only the owners (owner, 2026-09-30): another section's single photo
    // never joins them.
    const ok = (t: PlannedSpread | undefined) => !!t && (t.section !== "owners" || s.section === "owners");
    // Same section: the same gallery tab when the book follows the tabs.
    const same = (t: PlannedSpread | undefined) => !!t && (t.tab ?? t.section) === (s.tab ?? s.section);
    const target = same(prev) ? prev : same(next) ? next : prev && prev.section === s.section ? prev : ok(next) ? next : ok(prev) ? prev : next ?? prev;
    if (!target) continue;
    if (target === prev) target.photoIds.push(...s.photoIds);
    else target.photoIds.unshift(...s.photoIds);
    if (target.section === "event") target.heroId = target.photoIds.find((id) => isLandscape(byId.get(id))) ?? target.photoIds[0];
    spreads.splice(i, 1);
    i--;
  }
}

// Event bounds aimed at a target spread count: centre the style's bounds on the needed average,
// stretching up to HARD_MAX_PER_SPREAD per spread when there are many photos. Never below the style's minimum —
// with too few photos the book simply has fewer spreads (the contract: never repeat a photo).
function targetEventBounds(base: Bounds, photos: number, spreads: number): Bounds {
  if (spreads <= 0 || photos <= 0) return base;
  const avg = photos / spreads;
  if (avg <= base.min) return { min: base.min, max: Math.max(base.min, Math.min(base.max, base.min + 1)) };
  const min = Math.min(HARD_MAX_PER_SPREAD, Math.max(base.min, Math.floor(avg) - 1));
  const max = Math.min(HARD_MAX_PER_SPREAD, Math.max(min, Math.ceil(avg) + 1));
  return { min, max };
}

// ---------------------------------------------------------------------------------------------
// The book by the gallery's tabs (owner, 2026-10-21; see types.ts). Every album the owner designed
// by hand runs tab by tab in the tabs' numbered order ("1.אוירה", "2.חתן", "3.משפחה", "4.תפילה",
// "5.ארוחה"), so the photographer's own sorting decides the sections instead of face recognition.

// A tab's name without the number the photographer put in front of it for its order ("3.משפחה" →
// "משפחה").
export function tabLabel(name: string): string {
  return name.replace(/^\s*\d+\s*[.\-_)]?\s*/, "").trim() || name.trim();
}

export type TabRole = "atmosphere" | "owners" | "family" | "stage";

const ATMOSPHERE_RE = /(אוו?ירה|עיצוב|דקור)/;
const FAMILY_RE = /משפח/;
const OWNERS_RE = /(חתן|כלה|הזוג|בעלי השמחה)/;

// What each tab is, in the tabs' order: the atmosphere (decor, the venue), the owners (the couple,
// the bar/bat mitzvah child: a tab named for them, or else the first tab right before the family's,
// like "2.נטע" before "3.משפחה"), the family, and the event stages (everything else).
export function tabRoles(names: string[]): TabRole[] {
  const labels = names.map(tabLabel);
  const roles: TabRole[] = labels.map((l) => (ATMOSPHERE_RE.test(l) ? "atmosphere" : FAMILY_RE.test(l) ? "family" : "stage"));
  const firstPeople = roles.findIndex((r) => r !== "atmosphere");
  const named = labels.findIndex((l, i) => roles[i] === "stage" && OWNERS_RE.test(l));
  if (named >= 0) roles[named] = "owners";
  else if (firstPeople >= 0 && roles[firstPeople] === "stage" && roles.slice(firstPeople + 1).find((r) => r !== "atmosphere") === "family") roles[firstPeople] = "owners";
  return roles;
}

// Every tab of the event's owners, in the tabs' order: each tab named for them ("חתן", "כלה", "הזוג",
// a wedding often has all three), or else the one tabRoles infers (the tab right before the family's).
// Empty when no tab is theirs. The auto collage takes its photos from these (lib/collage/pick.ts).
export function ownersTabIndexes(names: string[]): number[] {
  const labels = names.map(tabLabel);
  const named = labels.flatMap((l, i) => (OWNERS_RE.test(l) && !FAMILY_RE.test(l) && !ATMOSPHERE_RE.test(l) ? [i] : []));
  if (named.length > 0) return named;
  const inferred = tabRoles(names).indexOf("owners");
  return inferred >= 0 ? [inferred] : [];
}

// Whether the book follows the tabs: the photos are sorted into two tabs or more, nearly all of them
// (a few photos left outside the tabs go after the stages).
export function followsTabs(photos: AutoPhoto[]): boolean {
  const tabbed = photos.filter((p) => p.tab);
  return new Set(tabbed.map((p) => p.tab!.key)).size >= 2 && tabbed.length >= photos.length * 0.8;
}

const UNTABBED = "__untabbed__";
// A page that mixes two tabs costs more than any unevenness in page sizes the limits could force.
const TAB_MIX_PENALTY = 400;

// `ids` over at least `minPages` pages from book position `pos`, and more when needed to hold them
// within each position's page cap (pageCap), as even as the caps allow; consecutive runs, so the
// order stays. Never a one-photo page while there are two photos or more.
export function splitWithinCaps(ids: string[], pos: number, minPages = 1): string[][] {
  const n = ids.length;
  if (n <= 1) return n ? [ids.slice()] : [];
  let k = Math.max(1, Math.min(minPages, Math.floor(n / 2)));
  const capOf = (i: number) => pageCap(pos + i);
  while (Array.from({ length: k }, (_, i) => capOf(i)).reduce((a, c) => a + c, 0) < n && k < Math.floor(n / 2)) k++;
  const caps = Array.from({ length: k }, (_, i) => capOf(i));
  const sizes = new Array(k).fill(0);
  for (let j = 0; j < n; j++) {
    let best = -1;
    for (let i = 0; i < k; i++) if (sizes[i] < caps[i] && (best < 0 || sizes[i] < sizes[best])) best = i;
    sizes[best < 0 ? k - 1 : best]++;
  }
  const out: string[][] = [];
  let at = 0;
  for (const size of sizes) {
    out.push(ids.slice(at, at + size));
    at += size;
  }
  return out;
}

function isLandscape(p: AutoPhoto | undefined): boolean {
  return !!p && p.aspect > 1.05;
}

/**
 * Plans the whole book. `referencePhotos` (the UI's FamilyCell list) is optional: when given, each
 * cell's reference photo opens its own section, since the photographer picked it as that
 * section's defining picture.
 */
export function planAlbum(
  photos: AutoPhoto[],
  faces: PhotoFaces[],
  cells: CellPeople[],
  opts: PlanOptions,
  referencePhotos?: Pick<FamilyCell, "id" | "photoId">[]
): AlbumPlan {
  // De-duplicate photo ids defensively (a photo can appear only once in the book).
  const seenIds = new Set<string>();
  const allPhotos = photos.filter((p) => (seenIds.has(p.id) ? false : (seenIds.add(p.id), true)));
  if (allPhotos.length === 0) return { coverPhotoId: null, spreads: [] };

  const bounds = STYLE_BOUNDS[opts.style] ?? STYLE_BOUNDS.clean;
  const { ordered, time } = shootingOrder(allPhotos);
  const orderIdx = new Map<string, number>();
  ordered.forEach((p, i) => orderIdx.set(p.id, i));
  const byId = new Map(allPhotos.map((p) => [p.id, p] as const));

  // A photo-book session (בוק בר/בת מצווה, owner 2026-10-20): no family sections at all. The cells
  // and their reference photos are ignored, and the whole book runs in shooting order.
  const isBook = opts.kind === "book";
  const familyCells = isBook ? [] : cells;
  const refs = isBook ? undefined : referencePhotos;

  // Cell people.
  let people: Person[] = [];
  const cellSize = cellRecord(() => 0);
  for (const c of familyCells) {
    for (const d of c.descriptors ?? []) {
      if (!Array.isArray(d) || d.length === 0) continue;
      people.push({ cell: c.id, refs: [d] });
      cellSize[c.id]++;
    }
  }
  const candidateIds = new Set(allPhotos.map((p) => p.id));
  people = expandReferences(people, faces.filter((f) => candidateIds.has(f.photoId)));

  const facesById = new Map(faces.map((f) => [f.photoId, f.faces] as const));
  const info = new Map<string, PhotoInfo>();
  for (const p of allPhotos) info.set(p.id, analyzeFaces(facesById.get(p.id) ?? [], people));

  if (!isBook && followsTabs(allPhotos)) return planByTabs(allPhotos, info, cellSize, orderIdx, time, bounds, opts, refs);

  // 2. Family sections, in priority order. Which other cells may share the frame: owners only with
  // themselves; the groom's parents with the owners; the bride's parents with the owners and the
  // groom's parents (both families together are the bride's parents' photo); siblings with
  // owners/parents; each side's grandparents with anyone before them. So the owner with a parent is
  // a parents' photo, a family shot with the siblings is a siblings' photo, and the grandparents with
  // anyone of the family are the grandparents'.
  // "Few strangers": at most one unidentified face beyond the identified ones (a guest walking
  // behind is fine; a crowd shot belongs to the event).
  const allowed = Object.fromEntries(SECTION_PRIORITY.map((c, i) => [c, SECTION_PRIORITY.slice(0, i + 1)])) as Record<FamilyCellId, FamilyCellId[]>;
  const isCandidate = (p: AutoPhoto, cell: FamilyCellId): boolean => {
    const fi = info.get(p.id) as PhotoInfo;
    if (!fi.cells.has(cell)) return false;
    for (const c of fi.cells) if (!allowed[cell].includes(c)) return false;
    // Owners: portrait-like shots — no more faces than the owners and one more, and of those at most
    // one stranger (the bride with two bridesmaids is not an owners-only photo).
    if (cell === "owners") return fi.faceCount <= cellSize.owners + 1 && fi.faceCount - fi.identified <= 1;
    return fi.faceCount <= fi.identified + 1;
  };
  const shotOrder = (id: string) => orderIdx.get(id) as number;
  // Owners' groups (mixOwnersShots): together = two owners or more in the frame, else the one owner.
  const ownersGroup = (id: string): number => {
    const o = (info.get(id) as PhotoInfo).owners;
    return o.length >= 2 ? TOGETHER : (o[0] ?? TOGETHER);
  };
  // Spreads the book may have: the pages (typed count, capped at 30; else 30) minus the cover.
  const typed = opts.targetSpreads && opts.targetSpreads > 0 ? Math.min(AUTO_MAX_PAGES, Math.floor(opts.targetSpreads)) : null;
  const maxSpreads = Math.max(1, (typed ?? AUTO_MAX_PAGES) - (opts.hasCover === false ? 0 : 1));

  type FamilyPage = { section: FamilyCellId; ids: string[] };
  const used = new Set<string>();
  const sectionPhotos = cellRecord<string[]>(() => []);
  const refIds = cellRecord<string | null>(() => null);
  const slots = sectionSlots(cellSize);
  // Selects each section's photos and splits them into pages, one section after the other, so every
  // page knows its position in the book and keeps that position's page cap (owner, 2026-09-29:
  // pages 1–5 up to 6 photos, 6–10 up to 8, …) and the style's maximum. Until 2026-10-20 the family
  // pages ignored the caps (a parents' page could hold 10). A section takes only as many of its
  // photos as its page slots hold at their positions; the rest stay in the event part, in shooting
  // order. A section left with a single photo never makes a one-photo page: that photo moves on to
  // lead the next section that has photos of its own (never the owners'), else the event part.
  const buildFamily = (): { pages: FamilyPage[]; leftover: string[] } => {
    used.clear();
    for (const c of SECTION_PRIORITY) {
      sectionPhotos[c] = [];
      refIds[c] = null;
    }
    // 1. Reference photos open their sections (owners' reference wins if one photo is marked twice).
    for (const cell of SECTION_PRIORITY) {
      const ref = refs?.find((r) => r.id === cell)?.photoId;
      if (ref && slots[cell] > 0 && byId.has(ref) && !used.has(ref)) {
        used.add(ref);
        refIds[cell] = ref;
      }
    }
    const pages: FamilyPage[] = [];
    const carry: string[] = [];
    for (const cell of SECTION_PRIORITY) {
      if (slots[cell] <= 0) continue;
      const b = bounds[groupOf(cell)];
      const caps = familyCaps(pages.length + 1, slots[cell], b.max);
      const capacity = caps.reduce((a, c) => a + c, 0);
      const own: string[] = refIds[cell] ? [refIds[cell] as string] : [];
      const room = capacity - own.length;
      // An unfilled cell → no photos of its own (its reference photo aside).
      if (cellSize[cell] > 0 && room > 0) {
        // Closer (bigger face) first; shooting order breaks ties.
        const ranked = allPhotos
          .filter((p) => !used.has(p.id) && isCandidate(p, cell))
          .sort((a, b) => (info.get(b.id) as PhotoInfo).cellArea[cell] - (info.get(a.id) as PhotoInfo).cellArea[cell] || shotOrder(a.id) - shotOrder(b.id))
          .map((p) => p.id);
        // Inside a section the chosen photos run in shooting order (keeps outfits/locations
        // together), with the reference photo leading. The owners' section mixes a couple's
        // together and alone shots (mixOwnersShots); with one owner it is the same shooting order.
        const picked =
          cell === "owners" ? mixOwnersShots(ranked, room, ownersGroup, shotOrder) : ranked.slice(0, room).sort((a, b) => shotOrder(a) - shotOrder(b));
        for (const id of picked) {
          used.add(id);
          own.push(id);
        }
      }
      if (own.length === 0) continue; // a waiting lone photo passes on
      const ids = [...carry.splice(0, Math.max(0, capacity - own.length)), ...own];
      sectionPhotos[cell] = ids;
      if (ids.length === 1) {
        carry.push(ids[0]);
        continue;
      }
      for (const pg of splitSection(ids, caps, b.min)) pages.push({ section: cell, ids: pg });
    }
    return { pages, leftover: carry };
  };

  // Section slots, trimmed to fit the book: the family pages never squeeze the rest of the event
  // past the hard per-page ceiling (a short typed count with many photos). The section with the
  // most slots gives one up first, the later section on a tie; then the selection runs again.
  let family: { pages: FamilyPage[]; leftover: string[] } = { pages: [], leftover: [] };
  let familyBudget = Math.max(0, maxSpreads - 1);
  for (let round = 0; round < 20; round++) {
    for (let guard = 0; guard < 20 && SECTION_PRIORITY.reduce((a, c) => a + slots[c], 0) > familyBudget; guard++) {
      const c = [...SECTION_PRIORITY].reverse().reduce((m, x) => (slots[x] > slots[m] ? x : m));
      if (slots[c] <= 0) break;
      slots[c]--;
    }
    family = buildFamily();
    const eventLeft = allPhotos.length - used.size + family.leftover.length;
    if (familyBudget <= 0 || eventLeft === 0 || (maxSpreads - family.pages.length) * HARD_MAX_PER_SPREAD >= eventLeft) break;
    familyBudget = Math.min(familyBudget, family.pages.length) - 1;
  }

  // 3. Everything else is the event, in shooting order, led by any lone family photo.
  const eventIds = [...family.leftover, ...ordered.filter((p) => !used.has(p.id)).map((p) => p.id)];

  // Spreads for the family sections: exactly as sectioned (no single-photo page, every page within
  // its cap).
  const heroByFaces = (ids: string[]): string =>
    ids.reduce((best, id) =>
      (info.get(id) as PhotoInfo).identifiedArea > (info.get(best) as PhotoInfo).identifiedArea ? id : best
    );
  const familySpreads: PlannedSpread[] = family.pages.map((pg) => ({ section: pg.section, photoIds: pg.ids, heroId: heroByFaces(pg.ids) }));
  const famCount = familySpreads.length;
  const heroFor = (section: SectionKind, ids: string[]) =>
    section === "event" ? (ids.find((id) => isLandscape(byId.get(id))) ?? ids[0]) : heroByFaces(ids);

  // Event spreads: target-aware bounds, breaking at stage gaps when times are known. With no
  // target, the style's natural sizes are used unless they'd go past the page limit.
  const gapAfter = time
    ? (i: number) =>
        i + 1 < eventIds.length ? (time.get(eventIds[i + 1]) as number) - (time.get(eventIds[i]) as number) : 0
    : undefined;
  const seed = famCount;
  let eventBounds = bounds.event;
  if (typed) {
    eventBounds = targetEventBounds(bounds.event, eventIds.length, Math.max(1, maxSpreads - famCount));
  } else if (famCount + chunk(eventIds, bounds.event, seed, gapAfter).length > maxSpreads) {
    eventBounds = targetEventBounds(bounds.event, eventIds.length, Math.max(1, maxSpreads - famCount));
  }
  const eventChunks = chunk(eventIds, eventBounds, seed, gapAfter);
  if (time) separateBursts(eventChunks, time);
  const eventSpreads: PlannedSpread[] = eventChunks.map((c) => ({ section: "event", photoIds: c, heroId: heroFor("event", c) }));
  mergeSingles(eventSpreads, byId);

  let spreads: PlannedSpread[];
  if (eventIds.length === 1 && famCount > 0) {
    // A single event photo can't be a page of its own: it joins the last family page when that
    // page isn't the owners' and has room; else that page's last photo keeps it company on an
    // event page; else (an owners' page of two) the three share one event page.
    const id = eventIds[0];
    const last = familySpreads[famCount - 1];
    const cap = familyCaps(famCount, 1, bounds[groupOf(last.section)].max)[0];
    if (last.section !== "owners" && last.photoIds.length < cap) {
      last.photoIds.push(id);
      last.heroId = heroByFaces(last.photoIds);
      spreads = familySpreads;
    } else if (last.photoIds.length >= 3) {
      const moved = last.photoIds.pop() as string;
      last.heroId = heroByFaces(last.photoIds);
      spreads = [...familySpreads, { section: "event", photoIds: [moved, id], heroId: heroFor("event", [moved, id]) }];
    } else {
      const ids = [...last.photoIds, id];
      spreads = [...familySpreads.slice(0, -1), { section: "event", photoIds: ids, heroId: heroFor("event", ids) }];
    }
  } else {
    // Only the event part is re-fitted to the limits, from the book position right after the
    // family pages.
    spreads = eventSpreads.length > 0 ? [...familySpreads, ...fitPages(eventSpreads, Math.max(1, maxSpreads - famCount), time, heroFor, famCount)] : familySpreads;
  }

  // Cover: the closest owners shot (a slight preference for portrait — covers are single pages).
  let coverPhotoId: string | null = null;
  let bestScore = 0;
  for (const id of sectionPhotos.owners) {
    const p = byId.get(id) as AutoPhoto;
    const score = (info.get(id) as PhotoInfo).cellArea.owners * (p.aspect < 1 ? 1.15 : 1);
    if (score > bestScore) {
      bestScore = score;
      coverPhotoId = id;
    }
  }
  if (!coverPhotoId) coverPhotoId = refIds.owners ?? spreads[0]?.photoIds[0] ?? null;

  return { coverPhotoId, spreads };
}

// The book by the gallery's tabs (see followsTabs): one section per tab in the tabs' order, the
// atmosphere tab last. Inside a tab the photos run in shooting order; the family tab, when the
// family cells were filled, runs parents, siblings, grandparents, then the rest of it. Each tab is
// split into pages on its own (a page holds one tab), at the style's sizes for its role; then the
// same last pass as the face-based book holds the page caps and the page limit (fitPages), keeping
// the tabs apart unless the limit can't. The atmosphere joins the last page (owner, 2026-10-21: "בדף
// האחרון"), or makes the last page itself when it has a page's worth of photos.
function planByTabs(
  allPhotos: AutoPhoto[],
  info: Map<string, PhotoInfo>,
  cellSize: Record<FamilyCellId, number>,
  orderIdx: Map<string, number>,
  time: Map<string, number> | null,
  bounds: Record<SectionGroup, Bounds>,
  opts: PlanOptions,
  refs?: Pick<FamilyCell, "id" | "photoId">[]
): AlbumPlan {
  const byId = new Map(allPhotos.map((p) => [p.id, p] as const));
  const shot = (id: string) => orderIdx.get(id) as number;
  const typed = opts.targetSpreads && opts.targetSpreads > 0 ? Math.min(AUTO_MAX_PAGES, Math.floor(opts.targetSpreads)) : null;
  const maxSpreads = Math.max(1, (typed ?? AUTO_MAX_PAGES) - (opts.hasCover === false ? 0 : 1));

  // The tabs in their order, each with its role and its photos.
  const tabMap = new Map<string, { key: string; name: string; order: number; ids: string[] }>();
  for (const p of allPhotos) {
    const key = p.tab?.key ?? UNTABBED;
    let t = tabMap.get(key);
    if (!t) tabMap.set(key, (t = { key, name: p.tab?.name ?? "", order: p.tab ? p.tab.order : Number.MAX_SAFE_INTEGER, ids: [] }));
    t.ids.push(p.id);
  }
  const tabs = [...tabMap.values()].sort((a, b) => a.order - b.order);
  const roles = tabRoles(tabs.map((t) => (t.key === UNTABBED ? "" : t.name)));
  const ordered = [
    ...tabs.filter((_, i) => roles[i] !== "atmosphere"),
    ...tabs.filter((_, i) => roles[i] === "atmosphere"),
  ];
  const roleOf = new Map(tabs.map((t, i) => [t.key, roles[i]] as const));
  const sectionOf = (role: TabRole): SectionKind => (role === "owners" ? "owners" : role === "family" ? "parents" : "event");

  // Inside a tab: shooting order; the family tab by family cell first when the cells were filled
  // (the latest cell in the frame decides, as on the family pages: the grandparents with the couple
  // are the grandparents'), the photos with nobody known last.
  const familyRank = (id: string): number => {
    const cells = (info.get(id) as PhotoInfo).cells;
    for (let r = SECTION_PRIORITY.length - 1; r >= 1; r--) if (cells.has(SECTION_PRIORITY[r])) return r;
    return cells.has("owners") ? 1 : SECTION_PRIORITY.length;
  };
  const familyCellsFilled = SECTION_PRIORITY.some((c) => c !== "owners" && cellSize[c] > 0);
  for (const t of ordered) {
    t.ids.sort((a, b) => (roleOf.get(t.key) === "family" && familyCellsFilled ? familyRank(a) - familyRank(b) : 0) || shot(a) - shot(b));
  }

  const heroByFaces = (ids: string[]): string =>
    ids.reduce((best, id) => ((info.get(id) as PhotoInfo).identifiedArea > (info.get(best) as PhotoInfo).identifiedArea ? id : best));
  const heroFor = (section: SectionKind, ids: string[]) =>
    section === "event" ? (ids.find((id) => isLandscape(byId.get(id))) ?? ids[0]) : heroByFaces(ids);
  const gapIn = (ids: string[]) =>
    time ? (i: number) => (i + 1 < ids.length ? (time.get(ids[i + 1]) as number) - (time.get(ids[i]) as number) : 0) : undefined;

  // The atmosphere: a page of its own only with a page's worth of photos; otherwise it joins the last page.
  const atmosphere = ordered.filter((t) => roleOf.get(t.key) === "atmosphere");
  const atmosphereIds = atmosphere.flatMap((t) => t.ids);
  const atmosphereOwnPage = atmosphereIds.length >= bounds.event.min;
  let sections = atmosphereOwnPage ? ordered : ordered.filter((t) => roleOf.get(t.key) !== "atmosphere");
  if (sections.length === 0) sections = atmosphere; // only atmosphere photos: one section after all
  else if (!atmosphereOwnPage && atmosphereIds.length > 0) {
    // The atmosphere's few photos close the last section's last page (a copy, the tab list stays).
    const last = sections[sections.length - 1];
    sections = [...sections.slice(0, -1), { ...last, ids: [...last.ids, ...atmosphereIds] }];
  }

  // Event bounds aimed at the page limit, like the face-based book.
  const peoplePages = (group: SectionGroup) =>
    sections
      .filter((t) => groupOf(sectionOf(roleOf.get(t.key) as TabRole)) === group)
      .reduce((n, t) => n + Math.max(1, Math.ceil(t.ids.length / bounds[group].max)), 0);
  const nonEvent = peoplePages("owners") + peoplePages("family");
  const eventCount = sections.filter((t) => sectionOf(roleOf.get(t.key) as TabRole) === "event").reduce((n, t) => n + t.ids.length, 0);
  let eventBounds = bounds.event;
  const naturalEvent = sections
    .filter((t) => sectionOf(roleOf.get(t.key) as TabRole) === "event")
    .reduce((n, t) => n + Math.max(1, Math.ceil(t.ids.length / bounds.event.max)), 0);
  if (eventCount > 0 && (typed || nonEvent + naturalEvent > maxSpreads)) {
    eventBounds = targetEventBounds(bounds.event, eventCount, Math.max(1, maxSpreads - nonEvent));
  }

  // Each tab on its own pages, from where the previous tab ended: the style's sizes for its role
  // (breaking at stage gaps inside a long tab), or, when a page would go past the cap of its
  // position in the book, as many pages again (more if the caps need them), as even as they allow.
  let spreads: PlannedSpread[] = [];
  sections.forEach((t, k) => {
    const section = sectionOf(roleOf.get(t.key) as TabRole);
    const b = section === "event" ? eventBounds : bounds[groupOf(section)];
    const pos = spreads.length + 1;
    let pages = chunk(t.ids, b, spreads.length + k, gapIn(t.ids));
    if (pages.some((pg, i) => pg.length > pageCap(pos + i))) pages = splitWithinCaps(t.ids, pos, pages.length);
    for (const ids of pages) spreads.push({ section, photoIds: ids, heroId: heroFor(section, ids), tab: t.key });
  });
  mergeSingles(spreads, byId);
  // Only a book past the page limit (or a merged single past a cap) goes through the last pass,
  // which then keeps the tabs apart wherever the limits let it.
  spreads = fitPages(spreads, maxSpreads, time, heroFor, 0, TAB_MIX_PENALTY);

  // Cover: from the owners' tab — the owners' reference photo when it's there, else the closest
  // owners shot (faces known), else its first portrait shot; without an owners' tab, the first photo.
  const ownersTab = tabs.find((t) => roleOf.get(t.key) === "owners");
  let coverPhotoId: string | null = null;
  if (ownersTab) {
    const ref = refs?.find((r) => r.id === "owners")?.photoId;
    if (ref && ownersTab.ids.includes(ref)) coverPhotoId = ref;
    else {
      let best = 0;
      for (const id of ownersTab.ids) {
        const score = (info.get(id) as PhotoInfo).cellArea.owners * ((byId.get(id) as AutoPhoto).aspect < 1 ? 1.15 : 1);
        if (score > best) {
          best = score;
          coverPhotoId = id;
        }
      }
      coverPhotoId ??= ownersTab.ids.find((id) => (byId.get(id) as AutoPhoto).aspect < 1) ?? ownersTab.ids[0] ?? null;
    }
  }
  coverPhotoId ??= spreads[0]?.photoIds[0] ?? null;
  return { coverPhotoId, spreads };
}
