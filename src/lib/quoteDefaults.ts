import { ADMIN_EMAIL } from "@/lib/admin";

// The quote builder's notes field, pre-filled (owner, 2026-10-01; admin only for now, "עדכון אדמין").
// Editable per quote like any other note. Every other account starts with an empty field.
export const ADMIN_DEFAULT_QUOTE_NOTES = ["זמני אספקה:", "תמונות עד 7 ימי עסקים", "וידאו עד 35 ימי עסקים", "גלריית תמונות בתוקף ל-3 חודשים"].join("\n");

export function defaultQuoteNotesFor(email: string | null | undefined): string {
  return email === ADMIN_EMAIL ? ADMIN_DEFAULT_QUOTE_NOTES : "";
}
