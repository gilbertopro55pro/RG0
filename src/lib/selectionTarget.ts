// How many photos the client picks for the album, per event type (owner, 2026-10-27, "עדכון
// שקוף"): when the client's favorites reach it, the client gallery's selection bar turns green with
// a bold line saying so, and confetti falls once per gallery (galleries.selection_target_celebrated_at),
// however the selection changes afterwards. The photographer changes the numbers in Settings ›
// "תמחור וחבילות צילום" (SelectionTargetsSettings), saved in photographers.photo_selection_targets
// (event type name -> count, null = no target for it). A type not set there takes the default below.

export const SELECTION_TARGET_DEFAULTS: readonly { name: string; count: number }[] = [
  { name: "חתונה", count: 200 },
  { name: "חינה", count: 150 },
  { name: "בר מצווה", count: 150 },
  { name: "בת מצווה", count: 150 },
  { name: "עלייה לתורה", count: 150 },
  { name: "ברית", count: 150 },
  { name: "בוק בר מצווה", count: 70 },
  { name: "בוק בת מצווה", count: 70 },
];
export const SELECTION_TARGET_MAX = 2000;

export type SelectionTargets = Record<string, number | null>;

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[֑-ֽֿ-ׇ]/g, "")
    .replace(/[־\-_–—,.|/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// A Hebrew word on its own (a one-letter preposition and the article may come first), so "בוק"
// never matches "בוקר" and "חינה" never matches "מבחינה". No lookbehind: older Safari can't parse it.
const HEB = "א-ת";
const word = (body: string) => new RegExp(`(?:^|[^${HEB}])[ובלמשכ]?ה?(?:${body})(?![${HEB}])`);
const BOOK = word("בוק|בוקים");
const BAT = word("בת ה?מי?צוו?ה|בתמי?צוו?ה|בת");
const BAR = word("בר ה?מי?צוו?ה|ברמי?צוו?ה|בר");

// The default type a free-text name (an event type, a gallery title) reads as, or null.
export function selectionKindOf(raw: string | null | undefined): string | null {
  const text = normalize(raw ?? "");
  if (!text) return null;
  if (BOOK.test(text)) return BAT.test(text) && !BAR.test(text) ? "בוק בת מצווה" : "בוק בר מצווה";
  if (word("חינה|חינאה").test(text)) return "חינה";
  if (word(`חתונ[${HEB}]*|חופה|חופת`).test(text)) return "חתונה";
  if (word("בת ה?מי?צוו?ה|בתמי?צוו?ה").test(text)) return "בת מצווה";
  if (word("עלי?יה לתורה").test(text)) return "עלייה לתורה";
  if (word("בר ה?מי?צוו?ה|ברמי?צוו?ה").test(text)) return "בר מצווה";
  if (word("ברית|בריתה|ברית מילה").test(text)) return "ברית";
  return null;
}

// The count for this gallery: the photographer's number for the event's exact type, else the
// default type its name reads as (the event type first, then the gallery's title), with the
// photographer's number for that type, else its default. Null: no target, nothing is shown.
export function selectionTargetFor({
  eventType,
  title,
  targets,
}: {
  eventType: string | null | undefined;
  title?: string | null;
  targets?: SelectionTargets | null;
}): number | null {
  const own = targets ?? {};
  const exact = eventType?.trim();
  if (exact && Object.prototype.hasOwnProperty.call(own, exact)) return validCount(own[exact]);
  const kind = selectionKindOf(eventType) ?? selectionKindOf(title);
  if (!kind) return null;
  if (Object.prototype.hasOwnProperty.call(own, kind)) return validCount(own[kind]);
  return SELECTION_TARGET_DEFAULTS.find((d) => d.name === kind)?.count ?? null;
}

export function validCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= SELECTION_TARGET_MAX ? value : null;
}

// Where the client stands: below the target, on it, or past it.
export function selectionTargetState(count: number, target: number | null): "none" | "below" | "reached" | "over" {
  if (!target) return "none";
  if (count < target) return "below";
  return count === target ? "reached" : "over";
}

// The confetti falls the first time the client's favorites climb to the target in this gallery:
// never on loading a page that's already past it, and never again once it fell.
export function shouldCelebrate(previous: number, next: number, target: number | null, celebrated: boolean): boolean {
  return !!target && !celebrated && previous < target && next >= target;
}
