import { AUTO_STYLES, type AutoStyleId } from "./types";

// Which automatic album styles a photographer can pick (owner, 2026-11-07, "שחרור": the automatic
// designer opened to everyone with "קו נקי" and "קטלוג" only; "מקושקש" and "מודרני" stay with the
// admin account until they're released, release-queue row 1).
export const RELEASED_AUTO_STYLES: readonly AutoStyleId[] = ["clean", "catalog"];

export function autoStylesFor(admin: boolean): typeof AUTO_STYLES {
  return admin ? AUTO_STYLES : AUTO_STYLES.filter((st) => RELEASED_AUTO_STYLES.includes(st.id));
}

/** The style a choice resolves to: one the photographer can pick, else "קו נקי". */
export function allowedAutoStyle(id: string, admin: boolean): AutoStyleId {
  return autoStylesFor(admin).some((st) => st.id === id) ? (id as AutoStyleId) : "clean";
}
