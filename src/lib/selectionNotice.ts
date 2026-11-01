// The event's log line when the client changes the photo selection after confirming it (owner,
// 2026-11-01): one line that keeps the latest count, written as already read, so the event card's
// counter rises only on the final confirmation (confirm-selection), not on every photo picked.

const PREFIX = "הלקוח/ה עדכנו את בחירת התמונות מהגלריה";

export function selectionUpdateText(count: number): string {
  return `${PREFIX}, נבחרו כעת ${count} תמונות`;
}

export function isSelectionUpdateText(text: string | null | undefined): boolean {
  return !!text && text.startsWith(PREFIX);
}
