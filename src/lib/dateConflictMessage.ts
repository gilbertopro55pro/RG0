import type { TFn } from "@/i18n/translate";

// The date-conflict message from /api/events (POST and PATCH), in the photographer's language:
// the server sends who or what takes the date (conflictSource/conflictWith, see dateConflict.ts),
// and its own Hebrew `error` only as a fallback. `anyway`: the form offers to save past it.
export function dateConflictMessage(
  t: TFn,
  data: { conflictSource?: string; conflictWith?: string; error?: string },
  anyway: boolean
): string {
  const name = (data.conflictWith ?? "").trim();
  if (data.conflictSource === "event") {
    return anyway ? t("כבר קיים אירוע בתאריך זה ({name}). אפשר לשמור בכל זאת.", { name }) : t("כבר קיים אירוע בתאריך זה ({name}).", { name });
  }
  if (data.conflictSource === "calendar") {
    return name ? t("ביומן Google שלכם כבר רשום בתאריך הזה: {name}.", { name }) : t("ביומן Google שלכם כבר רשום משהו בתאריך הזה.");
  }
  return data.error ? t(data.error) : t("כבר קיים אירוע בתאריך זה");
}
