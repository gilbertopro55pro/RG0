// Dependency-free reader for a JPEG's shooting time (EXIF DateTimeOriginal). Callers pass only the
// first ~128KB of the file — EXIF lives in the APP1 segment right after SOI, so that's enough and
// saves downloading 10-30MB originals. Every read is bounds-checked; anything malformed (or a
// buffer cut off before the tag) yields null, never a throw, since one odd file must not break a
// batch over a whole gallery.

const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME = 0x0132;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME_DIGITIZED = 0x9004;
const TAG_SUBSEC_ORIGINAL = 0x9291;
const TYPE_ASCII = 2;
const TYPE_LONG = 4;

type Tiff = { buf: Uint8Array; start: number; end: number; le: boolean };

function u16(t: Tiff, off: number): number | null {
  const p = t.start + off;
  if (off < 0 || p + 2 > t.end) return null;
  return t.le ? t.buf[p] | (t.buf[p + 1] << 8) : (t.buf[p] << 8) | t.buf[p + 1];
}

function u32(t: Tiff, off: number): number | null {
  const p = t.start + off;
  if (off < 0 || p + 4 > t.end) return null;
  const b = t.buf;
  const v = t.le
    ? b[p] + b[p + 1] * 0x100 + b[p + 2] * 0x10000 + b[p + 3] * 0x1000000
    : b[p] * 0x1000000 + b[p + 1] * 0x10000 + b[p + 2] * 0x100 + b[p + 3];
  return v;
}

type Entry = { type: number; count: number; entryOff: number };

// Reads an IFD's entries into a tag → entry map (offsets relative to the TIFF header).
function readIfd(t: Tiff, ifdOff: number): Map<number, Entry> | null {
  const n = u16(t, ifdOff);
  if (n === null || n > 1000) return null;
  const out = new Map<number, Entry>();
  for (let i = 0; i < n; i++) {
    const e = ifdOff + 2 + i * 12;
    const tag = u16(t, e);
    const type = u16(t, e + 2);
    const count = u32(t, e + 4);
    if (tag === null || type === null || count === null) return out.size ? out : null;
    out.set(tag, { type, count, entryOff: e });
  }
  return out;
}

function readAscii(t: Tiff, entry: Entry | undefined): string | null {
  if (!entry || entry.type !== TYPE_ASCII || entry.count === 0 || entry.count > 256) return null;
  // ≤4 bytes are stored inline in the entry's value field, longer ones at an offset.
  const valOff = entry.count <= 4 ? entry.entryOff + 8 : u32(t, entry.entryOff + 8);
  if (valOff === null) return null;
  const p = t.start + valOff;
  if (p + entry.count > t.end) return null;
  let s = "";
  for (let i = 0; i < entry.count; i++) {
    const c = t.buf[p + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

// "YYYY:MM:DD HH:MM:SS" → Date. Built as if UTC: EXIF has no time zone (camera local time), and the
// album designer only needs photos of one event in relative order, so the wall-clock fields are
// kept as-is rather than guessing a zone.
function parseExifDate(s: string | null, subSec: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 60) return null;
  let ms = 0;
  // Sub-seconds separate burst shots taken within the same second.
  const sub = subSec ? /^\s*(\d+)/.exec(subSec) : null;
  if (sub) ms = Math.floor(Number(`0.${sub[1]}`) * 1000);
  const time = Date.UTC(y, mo - 1, d, h, mi, se, ms);
  return Number.isFinite(time) ? new Date(time) : null;
}

function fromTiff(t: Tiff): Date | null {
  const magic = u16(t, 2);
  const ifd0Off = u32(t, 4);
  if (magic !== 42 || ifd0Off === null) return null;
  const ifd0 = readIfd(t, ifd0Off);
  if (!ifd0) return null;

  const exifPtr = ifd0.get(TAG_EXIF_IFD);
  if (exifPtr && (exifPtr.type === TYPE_LONG || exifPtr.type === 13)) {
    const exifOff = u32(t, exifPtr.entryOff + 8);
    const exif = exifOff !== null ? readIfd(t, exifOff) : null;
    if (exif) {
      const subSec = readAscii(t, exif.get(TAG_SUBSEC_ORIGINAL));
      const original = parseExifDate(readAscii(t, exif.get(TAG_DATETIME_ORIGINAL)), subSec);
      if (original) return original;
      const digitized = parseExifDate(readAscii(t, exif.get(TAG_DATETIME_DIGITIZED)), null);
      if (digitized) return digitized;
    }
  }
  return parseExifDate(readAscii(t, ifd0.get(TAG_DATETIME)), null);
}

export function exifDateTimeOriginal(buf: Uint8Array): Date | null {
  try {
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let p = 2;
    while (p + 4 <= buf.length) {
      if (buf[p] !== 0xff) return null;
      const marker = buf[p + 1];
      // Fill bytes before a marker.
      if (marker === 0xff) {
        p++;
        continue;
      }
      // Standalone markers without a length field.
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        p += 2;
        continue;
      }
      // Start of scan / end of image: metadata segments are all before this.
      if (marker === 0xda || marker === 0xd9) return null;
      const len = (buf[p + 2] << 8) | buf[p + 3];
      if (len < 2) return null;
      const segStart = p + 4;
      const segEnd = Math.min(p + 2 + len, buf.length);
      if (
        marker === 0xe1 &&
        segEnd - segStart >= 14 &&
        buf[segStart] === 0x45 && // E
        buf[segStart + 1] === 0x78 && // x
        buf[segStart + 2] === 0x69 && // i
        buf[segStart + 3] === 0x66 && // f
        buf[segStart + 4] === 0 &&
        buf[segStart + 5] === 0
      ) {
        const start = segStart + 6;
        const bo = (buf[start] << 8) | buf[start + 1];
        if (bo !== 0x4949 && bo !== 0x4d4d) return null;
        return fromTiff({ buf, start, end: segEnd, le: bo === 0x4949 });
      }
      p += 2 + len;
    }
    return null;
  } catch {
    return null;
  }
}
