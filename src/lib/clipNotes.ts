// Notes for the clip (owner, 2026-10-25, "עדכון שקוף"): in a package with a clip, the client
// writes them in the portal (PortalClipNotes, api/portal/[token]/clip-notes), and the photographer
// sees and copies them on the event page, with no edit field (ClipNotesView). Stored on
// events.clip_notes / clip_notes_at (migration 0192). Not in EventRow (lib/types.ts is part of the
// PDF worker's build, and a change there redeploys it): pages that show the notes select them.

export const CLIP_NOTES_MAX = 2000;

export type ClipNotesFields = { clip_notes: string | null; clip_notes_at: string | null };

// The client's text, checked: control characters out (line breaks and tabs stay), Windows line
// breaks as plain ones, at most two empty lines in a row, trimmed and cut at the maximum. "" clears
// the notes. null when it isn't text at all.
export function parseClipNotes(input: unknown): string | null {
  if (typeof input !== "string") return null;
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, CLIP_NOTES_MAX)
    .trim();
}

// A package with a clip: one of its stages is the clip song selection (every built-in package with
// a clip has one, and a custom stage counts by its name, lib/clientReminders.ts stageRole), or a
// custom stage names the clip ("עריכת קליפ").
export function packageHasClip(stages: readonly { role: string | null; label: string }[]): boolean {
  return stages.some((s) => s.role === "client_song_selection" || /קליפ|clip|клип/i.test(s.label));
}

// The event log line for a save (stored in Hebrew, like every log line): written, changed or
// cleared.
export function clipNotesLogText(clientName: string, before: string | null, after: string): string {
  if (!after) return `${clientName} מחקו את ההערות לקליפ`;
  return before ? `${clientName} עדכנו את ההערות לקליפ` : `${clientName} כתבו הערות לקליפ`;
}
