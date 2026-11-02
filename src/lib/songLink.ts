// A link to the song for the reel's beat (owner, 2026-11-02: "להדביק קישור ישיר לסרטון עם המוזיקה
// הרצויה רק בשביל שהמערכת תוכל להרכיב את הרילס לפי המעברים על הביט"). The server fetches the file
// (api/reels/song-link) and hands its bytes to the browser, which finds the beat and plays it in the
// preview, like a song file picked from the device. Nothing is stored.
//
// Only a link straight to a file works. A post on Instagram, TikTok or YouTube is a page: those
// services don't let another system take the music out of a post (and their terms forbid it), so
// such a link gets an explanation instead of a failed download.

export const SONG_LINK_MAX_BYTES = 60 * 1024 * 1024;

export type SongLinkProblem = "invalid" | "social";

// Pages of services whose music can't be taken from a link.
const SOCIAL_HOSTS = [
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "facebook.com",
  "fb.watch",
  "spotify.com",
  "music.apple.com",
  "soundcloud.com",
  "deezer.com",
  "music.youtube.com",
  "threads.net",
];

function isSocialHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return SOCIAL_HOSTS.some((s) => h === s || h.endsWith(`.${s}`));
}

// The pasted text as a link the server may fetch: http(s), a real host name, the usual ports.
export function parseSongLink(raw: unknown): { url: URL } | { problem: SongLinkProblem } {
  if (typeof raw !== "string") return { problem: "invalid" };
  const text = raw.trim();
  if (!text || text.length > 2048) return { problem: "invalid" };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return { problem: "invalid" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { problem: "invalid" };
  if (url.username || url.password) return { problem: "invalid" };
  if (url.port && url.port !== "80" && url.port !== "443") return { problem: "invalid" };
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host === "localhost") return { problem: "invalid" };
  if (isSocialHost(host)) return { problem: "social" };
  return { url };
}

// An address the server must never fetch (its own machine, a private network, the cloud's metadata).
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(v4);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || v6.startsWith("ff");
}

const MEDIA_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|mp4|m4v|mov|webm)$/i;

// What the server got is a media file (not a web page).
export function isMediaResponse(contentType: string | null, url: URL): boolean {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (type.startsWith("audio/") || type.startsWith("video/")) return true;
  return (type === "application/octet-stream" || type === "binary/octet-stream" || type === "") && MEDIA_EXT.test(url.pathname);
}

// The file's name for the screen: the last part of the link's path.
export function songLinkFileName(url: URL, contentType: string | null): string {
  let last = "";
  try {
    last = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
  } catch {
    last = url.pathname.split("/").filter(Boolean).pop() ?? "";
  }
  last = last.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().slice(0, 100);
  if (last && MEDIA_EXT.test(last)) return last;
  const type = (contentType ?? "").toLowerCase();
  const ext = type.includes("mpeg") ? "mp3" : type.includes("wav") ? "wav" : type.includes("webm") ? "webm" : type.startsWith("video/") ? "mp4" : "m4a";
  return `${last || url.hostname}.${ext}`;
}
