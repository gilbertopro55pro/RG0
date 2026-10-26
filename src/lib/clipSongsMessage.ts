// Its own file, not lib/clipSongs.ts: that one is part of the PDF worker's build (lib/types.ts
// imports its type), and a change there redeploys the worker.

// The WhatsApp message the client sends the photographer from the portal's song stage, with
// "שמירה ושליחה בוואטסאפ" (owner, 2026-10-26, the wording is theirs): the event, the song (or the
// calm and upbeat songs), and the clip notes when there are any. Translated with the portal's
// language (t); in Hebrew it's exactly the owner's text.
export function clipSongsWhatsAppMessage(
  p: {
    photographerName: string | null;
    eventName: string;
    eventDate: string;
    songs: { oneSong: boolean; single: string; calm: string; upbeat: string };
    notes: string;
  },
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  const name = p.photographerName?.trim();
  const lines = [
    name ? t("היי {name},", { name }) : t("היי,"),
    t("מצורפים הפרטים לעריכת הקליפ של האירוע:"),
    t("שם האירוע: {name}", { name: p.eventName }),
    t("תאריך: {date}", { date: p.eventDate }),
    "",
  ];
  if (p.songs.oneSong) lines.push(t("השיר: {song}", { song: p.songs.single.trim() }));
  else
    lines.push(
      t("השירים לקליפ:"),
      t("שיר שקט: {song}", { song: p.songs.calm.trim() }),
      t("שיר קיצבי: {song}", { song: p.songs.upbeat.trim() })
    );
  const notes = p.notes.trim();
  if (notes) lines.push("", t("הערות לקליפ:"), notes);
  return lines.join("\n");
}
