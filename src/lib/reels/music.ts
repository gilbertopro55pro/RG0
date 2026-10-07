// Royalty-free music for reels (owner, 2026-10-07). Every track here is an original piece written
// and synthesised for this system (rendered by scripts/reel-music: `node scripts/reel-music/tracks.mjs <dir>`, then AAC 128k with ffmpeg), so
// photographers can post reels with it anywhere, with no licence or attribution. `bpm` lets the
// builder cut on the beat.
export type ReelTrack = { id: string; label: string; mood: string; bpm: number; seconds: number; url: string };

export const REEL_TRACKS: ReelTrack[] = [
  { id: "tender", label: "רגע מרגש", mood: "פסנתר ומיתרים, רגשי ושקט", bpm: 72, seconds: 66, url: "/reels/music/tender.m4a" },
  { id: "celebration", label: "חגיגה", mood: "פופ שמח וקצבי", bpm: 118, seconds: 51, url: "/reels/music/celebration.m4a" },
  { id: "cinematic", label: "קולנועי", mood: "מיתרים ותופים, נבנה לשיא", bpm: 80, seconds: 55, url: "/reels/music/cinematic.m4a" },
  { id: "acoustic", label: "אקוסטי", mood: "גיטרה, מחיאות כפיים, קליל", bpm: 100, seconds: 51, url: "/reels/music/acoustic.m4a" },
  { id: "lofi", label: "לואו־פיי רגוע", mood: "פסנתר חשמלי, רגוע ונעים", bpm: 82, seconds: 50, url: "/reels/music/lofi.m4a" },
  { id: "energy", label: "אנרגיה", mood: "דאנס מקפיץ", bpm: 124, seconds: 48, url: "/reels/music/energy.m4a" },
];

export function trackById(id: string | undefined): ReelTrack | null {
  return REEL_TRACKS.find((t) => t.id === id) ?? null;
}
