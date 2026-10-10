// Sub-tab names often come from folder names numbered for order: "1.הכנות", "2.צילומי חוץ",
// "03 - חופה" (owner, 2026-10-10). The number sets the order and the visitor sees only the name.
// Shared by the public page and Settings (client and server).

const ORDER_PREFIX = /^\s*(\d+)(?:\s*[.\-_)]\s*|\s+)(?=\S)/;

// "1.הכנות" → "הכנות". A name that is only a number stays as it is.
export function subTabLabel(name: string): string {
  const stripped = name.replace(ORDER_PREFIX, "");
  return stripped.trim() ? stripped : name;
}

// The number a name starts with, or null.
export function subTabOrder(name: string): number | null {
  const m = name.match(ORDER_PREFIX);
  return m ? Number(m[1]) : null;
}

// Numbered sub-tabs first, by their number; the rest after them in the order given (stable sort).
export function sortSubTabs<T>(items: T[], nameOf: (item: T) => string): T[] {
  return items
    .map((item, i) => ({ item, i, n: subTabOrder(nameOf(item)) }))
    .sort((a, b) => (a.n ?? Infinity) - (b.n ?? Infinity) || a.i - b.i)
    .map((x) => x.item);
}
