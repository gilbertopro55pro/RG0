// The songs a client chooses for the event's clip in the portal (PortalStageActions, owner
// 2026-10-13): a song name or a YouTube link per field, instead of sending them on WhatsApp. A
// wedding's highlights clip asks for a calm song and an upbeat one, unless the client prefers one
// song; any other event asks for one. Stored on events.clip_songs (migration 0161).
export type ClipSongs = { single?: string; calm?: string; upbeat?: string; chosenAt: string };

export const CLIP_SONG_MAX = 500;

// A wedding (in any of the app's languages) gets the two-song choice.
export function isWeddingEvent(eventType: string | null | undefined): boolean {
  return /חתונ|wedding|свадьб/i.test(eventType ?? "");
}

const clean = (v: unknown) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, CLIP_SONG_MAX) : "";

// The client's input, checked: one song, or (a wedding that didn't ask for one) a calm and an
// upbeat one. null when a required field is empty.
export function parseClipSongs(input: unknown, twoSongsAllowed: boolean): ClipSongs | null {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const chosenAt = new Date().toISOString();
  if (twoSongsAllowed && o.oneSong !== true) {
    const calm = clean(o.calm);
    const upbeat = clean(o.upbeat);
    return calm && upbeat ? { calm, upbeat, chosenAt } : null;
  }
  const single = clean(o.single);
  return single ? { single, chosenAt } : null;
}

// The songs as labelled lines (the label is a Hebrew dictionary key, translated by the caller).
export function clipSongLines(s: ClipSongs | null | undefined): { label: string; value: string }[] {
  if (!s) return [];
  if (s.single) return [{ label: "השיר לקליפ", value: s.single }];
  return [
    ...(s.calm ? [{ label: "שיר רגוע", value: s.calm }] : []),
    ...(s.upbeat ? [{ label: "שיר קצבי", value: s.upbeat }] : []),
  ];
}
