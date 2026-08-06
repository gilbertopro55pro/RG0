// Google Calendar's fixed event-color palette (colorId 1-11) — identical for every
// Google account, sourced from https://www.googleapis.com/calendar/v3/colors.
export const GOOGLE_EVENT_COLORS = [
  { id: "1", name: "לבנדר", hex: "#a4bdfc" },
  { id: "2", name: "מרווה", hex: "#7ae7bf" },
  { id: "3", name: "ענבים", hex: "#dbadff" },
  { id: "4", name: "פלמינגו", hex: "#ff887c" },
  { id: "5", name: "בננה", hex: "#fbd75b" },
  { id: "6", name: "קלמנטינה", hex: "#ffb878" },
  { id: "7", name: "טווס", hex: "#46d6db" },
  { id: "8", name: "גרפיט", hex: "#e1e1e1" },
  { id: "9", name: "אוכמניות", hex: "#5484ed" },
  { id: "10", name: "בזיליקום", hex: "#51b749" },
  { id: "11", name: "עגבנייה", hex: "#dc2127" },
] as const;

export function googleColorHex(colorId: string | null): string | null {
  return GOOGLE_EVENT_COLORS.find((c) => c.id === colorId)?.hex ?? null;
}
