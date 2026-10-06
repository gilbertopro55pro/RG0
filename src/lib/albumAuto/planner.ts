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
// (owners → parents → siblings → grandparents → the event in shooting order). Pure and
// deterministic — the same input always yields the same plan, so re-running the designer doesn't
// shuffle the book.

// ---------------------------------------------------------------------------------------------
// Event kind & cell labels
// ---------------------------------------------------------------------------------------------

function normalizeText(s: string): string {
  // Hebrew maqaf, hyphens and underscores all act as spaces ("בר-מצווה", "בר־מצווה", "bar_mitzvah").
  return s.toLowerCase().replace(/[־\-_–—]/g, " ").replace(/\s+/g, " ").trim();
}

export function detectEventKind(title: string, eventType?: string | null): EventKind {
  const text = ` ${normalizeText(`${eventType ?? ""} ${title ?? ""}`)} `;
  // Order matters: the more specific kinds first (henna titles sometimes also mention the wedding;
  // "בת מצווה" must not fall through to a "בת 60" birthday match).
  if (/חינה|henna|hina/.test(text)) return "henna";
  if (/חתונה|wedding/.test(text)) return "wedding";
  if (/בת מצו(ו)?ה|bat mitz?vah|bat mitsvah/.test(text)) return "bat_mitzvah";
  if (/בר מצו(ו)?ה|bar mitz?vah|bar mitsvah|עלי(י)?ה לתורה|הנחת תפילין|aliyah/.test(text)) return "bar_mitzvah";
  if (/יום הולדת|יומהולדת|יום ההולדת|חוגג|חוגגת|birthday|bday/.test(text)) return "birthday";
  // "יוסי בן 60", "בת 40"
  if (/(^|\s)(בן|בת|גיל)\s?\d{1,3}(\s|$)/.test(text)) return "birthday";
  // Last resort: a lone round age like "שרה 60" (no date separators around it, so "12/05" or
  // "30.5" don't count).
  if (/(^|\s)[1-9]0(\s|$)/.test(text)) return "birthday";
  return "other";
}

// The UI shows the cells in this order (1 parents, 2 owners, 3 siblings, 4 grandparents). The book
// order is different (owners first) — see SECTION_PRIORITY below.
export const CELL_ORDER: FamilyCellId[] = ["parents", "owners", "siblings", "grandparents"];

export function cellLabel(cell: FamilyCellId, kind: EventKind): string {
  switch (cell) {
    case "owners":
      if (kind === "wedding" || kind === "henna") return "חתן וכלה";
      if (kind === "bar_mitzvah") return "חתן בר המצווה";
      if (kind === "bat_mitzvah") return "כלת בת המצווה";
      return "בעלי השמחה";
    case "parents":
      return "ההורים";
    case "siblings":
      return "אחים ואחיות";
    case "grandparents":
      return "סבא וסבתא";
  }
}

// ---------------------------------------------------------------------------------------------
// Names & reference faces
// ---------------------------------------------------------------------------------------------

// How many people the free text names. Separators: commas, newlines, ";", "&", "+", "/", " and ",
// a standalone "ו", and "ו" as a word prefix joining names ("רחל ודוד" = 2, "אמא ואבא" = 2).
// Multi-word names ("סבתא שושנה", "אמא רחל") count as one.
export function countNames(names: string): number {
  const text = (names ?? "").trim();
  if (!text) return 0;
  // A bare number ("3") is taken literally.
  if (/^\d{1,2}$/.test(text)) return Number(text);
  const segments = text
    .split(/[,،;\n\r&+/|]|\s+and\s+|\s+ו\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  let count = 0;
  for (const seg of segments) {
    const words = seg.split(/\s+/).filter(Boolean);
    let n = words.length > 0 ? 1 : 0;
    // Each later word that starts with "ו" + at least two letters opens a new name.
    for (let i = 1; i < words.length; i++) {
      if (/^ו[א-ת]{2,}/.test(words[i])) n++;
    }
    count += n;
  }
  return count;
}

// The reference photo's faces that belong to the cell: the largest N (N = number of names), or,
// with no names, every face at least a quarter the size of the largest (drops background people).
export function pickCellFaces(faces: { descriptor: number[]; area: number }[], names: string): number[][] {
  if (!faces || faces.length === 0) return [];
  const sorted = faces
    .map((f, i) => ({ f, i }))
    .sort((a, b) => b.f.area - a.f.area || a.i - b.i)
    .map((x) => x.f);
  const n = countNames(names);
  if (n > 0) return sorted.slice(0, n).map((f) => f.descriptor);
  const largest = sorted[0].area;
  return sorted.filter((f) => f.area >= largest * 0.25).map((f) => f.descriptor);
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
// Book order (differs from the UI's CELL_ORDER).
const SECTION_PRIORITY: FamilyCellId[] = ["owners", "parents", "siblings", "grandparents"];
// Owner's book structure (2026-09-30), when the photographer filled the family cells: the pages
// after the cover run owners (1-3), parents (4-5), siblings (6-8), grandparents (9-11), then the rest
// of the event in shooting order. These are each section's page SLOTS: a section with fewer photos
// takes fewer pages (never an empty page or a page short of photos), and the next one moves up.
const SECTION_SLOTS: Record<FamilyCellId, number> = { owners: 3, parents: 2, siblings: 3, grandparents: 3 };

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
    cellArea: { owners: 0, parents: 0, siblings: 0, grandparents: 0 },
    identifiedArea: 0,
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
    // Look-alike from another cell within the margin: the face counts for that cell too.
    for (const q of pairs) {
      if (q.f === f && people[q.p].cell !== cell && q.d - d < MARGIN) info.cells.add(people[q.p].cell);
    }
  }
  return info;
}

// A family section's photos over at most `slots` pages, never a page short of photos: as many
// pages as the section's minimum per page allows, two pages split 60:40 (owner, 2026-09-30), more
// pages as even as possible. Pages keep consecutive runs, so the section stays in shooting order.
function splitSection(ids: string[], slots: number, b: Bounds): string[][] {
  const n = ids.length;
  if (n === 0) return [];
  const pages = Math.max(1, Math.min(slots, Math.floor(n / b.min), Math.ceil(n / 2)));
  let sizes: number[];
  if (pages === 1) sizes = [n];
  else if (pages === 2) {
    const first = Math.ceil(n * 0.6);
    sizes = [first, n - first];
  } else {
    const base = Math.floor(n / pages);
    sizes = Array.from({ length: pages }, (_, i) => base + (i < n % pages ? 1 : 0));
  }
  const out: string[][] = [];
  let pos = 0;
  for (const size of sizes) {
    out.push(ids.slice(pos, pos + size));
    pos += size;
  }
  return out;
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
  offset = 0
): PlannedSpread[] {
  const pageCap = (pos: number) => pageCapAt(pos + offset);
  const fits = spreads.length <= maxSpreads && spreads.every((s, i) => s.photoIds.length <= pageCap(i + 1) && (s.photoIds.length >= 2 || spreads.length === 1));
  const ids = spreads.flatMap((s) => s.photoIds);
  const P = ids.length;
  if (fits || P < 4) return spreads;
  const sec = spreads.flatMap((s) => s.photoIds.map(() => s.section));
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
        const c = best[i][a] + (size - want[i]) ** 2 + 6 * inside(secCh, a, b) + 2 * inside(burst, a, b) - cutBonus(b);
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
  const sections = cuts.map(([a]) => sec[a]);
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
  return chunks.map((c, i) => ({ section: sections[i], photoIds: c, heroId: heroFor(sections[i], c) }));
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
    const target = prev && prev.section === s.section ? prev : ok(next) ? next : ok(prev) ? prev : next ?? prev;
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

  // Cell people.
  let people: Person[] = [];
  const cellSize: Record<FamilyCellId, number> = { owners: 0, parents: 0, siblings: 0, grandparents: 0 };
  for (const c of cells) {
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

  // 2. Family sections, in priority order. Which other cells may share the frame: owners only with
  // themselves; parents with the owners; siblings with owners/parents; grandparents with anyone.
  // "Few strangers": at most one unidentified face beyond the identified ones (a guest walking
  // behind is fine; a crowd shot belongs to the event).
  const allowed: Record<FamilyCellId, FamilyCellId[]> = {
    owners: ["owners"],
    parents: ["owners", "parents"],
    siblings: ["owners", "parents", "siblings"],
    grandparents: ["owners", "parents", "siblings", "grandparents"],
  };
  // Spreads the book may have: the pages (typed count, capped at 30; else 30) minus the cover.
  const typed = opts.targetSpreads && opts.targetSpreads > 0 ? Math.min(AUTO_MAX_PAGES, Math.floor(opts.targetSpreads)) : null;
  const maxSpreads = Math.max(1, (typed ?? AUTO_MAX_PAGES) - (opts.hasCover === false ? 0 : 1));
  // Section slots, trimmed to fit the book: the family pages never squeeze the rest of the event
  // past the hard per-page ceiling (a short typed count with many photos). The section with the
  // most slots gives one up first, the later section on a tie; then the selection runs again.
  const used = new Set<string>();
  const sectionPhotos: Record<FamilyCellId, string[]> = { owners: [], parents: [], siblings: [], grandparents: [] };
  const refIds: Record<FamilyCellId, string | null> = { owners: null, parents: null, siblings: null, grandparents: null };
  const slots = { ...SECTION_SLOTS };
  let familyBudget = Math.max(0, maxSpreads - 1);
  for (let round = 0; round < 20; round++) {
    for (let guard = 0; guard < 20 && SECTION_PRIORITY.reduce((a, c) => a + slots[c], 0) > familyBudget; guard++) {
      const c = [...SECTION_PRIORITY].reverse().reduce((m, x) => (slots[x] > slots[m] ? x : m), "grandparents" as FamilyCellId);
      slots[c]--;
    }
    used.clear();
    for (const c of SECTION_PRIORITY) {
      sectionPhotos[c] = [];
      refIds[c] = null;
    }

    // 1. Reference photos open their sections (owners' reference wins if one photo is marked twice).
    for (const cell of SECTION_PRIORITY) {
      const ref = referencePhotos?.find((r) => r.id === cell)?.photoId;
      if (ref && slots[cell] > 0 && byId.has(ref) && !used.has(ref)) {
        used.add(ref);
        refIds[cell] = ref;
        sectionPhotos[cell].push(ref);
      }
    }

    for (const cell of SECTION_PRIORITY) {
      if (cellSize[cell] === 0) continue; // unfilled cell → empty section (its reference photo aside)
      const capByShape = slots[cell] * bounds[groupOf(cell)].max;
      const room = capByShape - sectionPhotos[cell].length;
      if (room <= 0) continue;
      const candidates = allPhotos.filter((p) => {
        if (used.has(p.id)) return false;
        const fi = info.get(p.id) as PhotoInfo;
        if (!fi.cells.has(cell)) return false;
        for (const c of fi.cells) if (!allowed[cell].includes(c)) return false;
        if (cell === "owners") return fi.faceCount <= cellSize.owners + 1; // portrait-like shots
        return fi.faceCount <= fi.identified + 1;
      });
      // Closer (bigger face) first; shooting order breaks ties.
      candidates.sort(
        (a, b) =>
          (info.get(b.id) as PhotoInfo).cellArea[cell] - (info.get(a.id) as PhotoInfo).cellArea[cell] ||
          (orderIdx.get(a.id) as number) - (orderIdx.get(b.id) as number)
      );
      const picked = candidates.slice(0, room);
      // Inside a section the chosen photos run in shooting order (keeps outfits/locations together),
      // with the reference photo leading.
      picked.sort((a, b) => (orderIdx.get(a.id) as number) - (orderIdx.get(b.id) as number));
      for (const p of picked) {
        used.add(p.id);
        sectionPhotos[cell].push(p.id);
      }
    }

    const familyPages = SECTION_PRIORITY.reduce((a, c) => a + splitSection(sectionPhotos[c], Math.max(1, slots[c]), bounds[groupOf(c)]).length, 0);
    const eventLeft = allPhotos.length - used.size;
    if (familyBudget === 0 || eventLeft === 0 || (maxSpreads - familyPages) * HARD_MAX_PER_SPREAD >= eventLeft) break;
    familyBudget = Math.min(familyBudget, familyPages) - 1;
  }

  // 3. Everything else is the event, in shooting order.
  const eventIds = ordered.filter((p) => !used.has(p.id)).map((p) => p.id);

  // Spreads for the family sections.
  const spreads: PlannedSpread[] = [];
  let seed = 0;
  const heroByFaces = (ids: string[]): string =>
    ids.reduce((best, id) =>
      (info.get(id) as PhotoInfo).identifiedArea > (info.get(best) as PhotoInfo).identifiedArea ? id : best
    );
  for (const cell of SECTION_PRIORITY) {
    const ids = sectionPhotos[cell];
    if (ids.length === 0) continue;
    for (const c of splitSection(ids, Math.max(1, slots[cell]), bounds[groupOf(cell)])) {
      spreads.push({ section: cell, photoIds: c, heroId: heroByFaces(c) });
      seed++;
    }
  }

  // Event spreads: target-aware bounds, breaking at stage gaps when times are known. With no
  // target, the style's natural sizes are used unless they'd go past the page limit.
  const gapAfter = time
    ? (i: number) =>
        i + 1 < eventIds.length ? (time.get(eventIds[i + 1]) as number) - (time.get(eventIds[i]) as number) : 0
    : undefined;
  const familySpreads = spreads.length;
  let eventBounds = bounds.event;
  if (typed) {
    eventBounds = targetEventBounds(bounds.event, eventIds.length, Math.max(1, maxSpreads - familySpreads));
  } else if (familySpreads + chunk(eventIds, bounds.event, seed, gapAfter).length > maxSpreads) {
    eventBounds = targetEventBounds(bounds.event, eventIds.length, Math.max(1, maxSpreads - familySpreads));
  }
  const eventChunks = chunk(eventIds, eventBounds, seed, gapAfter);
  if (time) separateBursts(eventChunks, time);
  for (const c of eventChunks) {
    const hero = c.find((id) => isLandscape(byId.get(id))) ?? c[0];
    spreads.push({ section: "event", photoIds: c, heroId: hero });
    seed++;
  }
  mergeSingles(spreads, byId);
  const heroFor = (section: SectionKind, ids: string[]) =>
    section === "event" ? (ids.find((id) => isLandscape(byId.get(id))) ?? ids[0]) : heroByFaces(ids);
  // The family pages stay exactly as sectioned; only the event part is re-fitted to the limits,
  // from the book position right after them.
  const famCount = spreads.findIndex((sp) => sp.section === "event");
  const head = famCount < 0 ? spreads.slice() : spreads.slice(0, famCount);
  const tail = famCount < 0 ? [] : spreads.slice(famCount);
  const book = tail.length > 0 ? [...head, ...fitPages(tail, Math.max(1, maxSpreads - head.length), time, heroFor, head.length)] : head;
  spreads.splice(0, spreads.length, ...book);

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
