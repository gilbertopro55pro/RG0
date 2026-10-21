// "Vivid" (owner, 2026-10-21, sketch "גילברטו – עיצוב עם יותר חיים"): the same warm-glass look
// with color that carries meaning. Five tones, each with one fixed meaning across the app, all at
// the same muted strength so the screen stays premium: color only where it says something.
// Admin only for now (VividProvider): every other account keeps the current look.
//
// The colors live in globals.css (--tone-<name>, -ink, -bg; light and dark); this file names them
// and holds the small rules for picking one.

export type Tone = "paid" | "upcoming" | "attention" | "pending" | "creative" | "neutral";

export const TONES: readonly Tone[] = ["paid", "upcoming", "attention", "pending", "creative", "neutral"];

// The tone's CSS variables: the solid (dots, bars), the text on its tint, and the tint.
export function toneVars(tone: Tone): { solid: string; ink: string; bg: string } {
  return { solid: `var(--tone-${tone})`, ink: `var(--tone-${tone}-ink)`, bg: `var(--tone-${tone}-bg)` };
}

// A tag or a tile in the tone: the tint behind, the deep text color on it.
export function toneStyle(tone: Tone): { background: string; color: string } {
  const v = toneVars(tone);
  return { background: v.bg, color: v.ink };
}

// How far an event is through its stages, for the thin bar under it. No stages: nothing to show.
export function stageProgress(stages: readonly { done: boolean }[] | null | undefined): { done: number; total: number; pct: number } | null {
  const total = stages?.length ?? 0;
  if (!total) return null;
  const done = stages!.filter((s) => s.done).length;
  return { done, total, pct: Math.round((done / total) * 100) };
}

// The color of an event's date tile in the list: done (closed) green, a freelance job purple, one
// that needs the photographer (open balance, unpaid deposit, unsigned contract, imported and not
// filled in) red, everything else upcoming blue.
export function eventDateTone(e: { closed: boolean; freelance: boolean; needsAttention: boolean }): Tone {
  if (e.closed) return "paid";
  if (e.needsAttention) return "attention";
  if (e.freelance) return "creative";
  return "upcoming";
}
