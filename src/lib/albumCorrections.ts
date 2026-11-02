// The client marks corrections on the album design (owner, 2026-10-27): in the gallery's album view,
// "צריך תיקונים" opens the design with a pencil and a rectangle (outline only), in 3 colours, and a
// note per page. "אישור ושליחת התיקונים" sends one submission (api/gallery/[token]/album/corrections,
// stored in gallery_album_corrections, migration 0201), and the photographer sees the marks over the
// pages on /album-corrections/<id>. Client-safe: no server imports.
//
// Every coordinate is a fraction (0–1) of the page box, so the marks land on the same spot whatever
// size the page is drawn at (the client's phone, the photographer's screen).

export const CORRECTION_COLORS = ["#e5322d", "#2563eb", "#16a34a"] as const;
export type CorrectionColor = (typeof CORRECTION_COLORS)[number];

export type CorrectionMark =
  | { kind: "pen"; color: CorrectionColor; points: [number, number][] }
  | { kind: "rect"; color: CorrectionColor; x: number; y: number; w: number; h: number };

export type CorrectionPage = { spreadId: string; note: string | null; marks: CorrectionMark[] };

export const CORRECTION_LIMITS = {
  pages: 60,
  marksPerPage: 200,
  pointsPerStroke: 1500,
  note: 1000,
} as const;

// A pencil stroke drawn on the page ends a little past the edge; anything further off is a bad request.
const EDGE_SLACK = 0.02;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

function coord(v: unknown): number | null {
  if (!isNum(v) || v < -EDGE_SLACK || v > 1 + EDGE_SLACK) return null;
  return round4(Math.min(1, Math.max(0, v)));
}

function parseColor(v: unknown): CorrectionColor | null {
  if (typeof v !== "string") return null;
  const lower = v.toLowerCase();
  return (CORRECTION_COLORS as readonly string[]).includes(lower) ? (lower as CorrectionColor) : null;
}

function parseMark(raw: unknown): CorrectionMark | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const color = parseColor(m.color);
  if (!color) return null;
  if (m.kind === "pen") {
    if (!Array.isArray(m.points) || m.points.length === 0 || m.points.length > CORRECTION_LIMITS.pointsPerStroke) return null;
    const points: [number, number][] = [];
    for (const p of m.points) {
      if (!Array.isArray(p) || p.length !== 2) return null;
      const x = coord(p[0]);
      const y = coord(p[1]);
      if (x === null || y === null) return null;
      points.push([x, y]);
    }
    return { kind: "pen", color, points };
  }
  if (m.kind === "rect") {
    const x = coord(m.x);
    const y = coord(m.y);
    if (x === null || y === null || !isNum(m.w) || !isNum(m.h) || m.w <= 0 || m.h <= 0) return null;
    const right = coord(x + m.w);
    const bottom = coord(y + m.h);
    if (right === null || bottom === null || right <= x || bottom <= y) return null;
    return { kind: "rect", color, x, y, w: round4(right - x), h: round4(bottom - y) };
  }
  return null;
}

// The client's submission, checked strictly: only the album's own pages (validSpreadIds), pencil or
// rectangle marks in the palette's colours, coordinates on the page, the caps above. Pages with
// neither a mark nor a note are dropped; null = not a valid submission (also when nothing is left).
export function parseCorrectionPages(body: unknown, validSpreadIds: Iterable<string>): CorrectionPage[] | null {
  const raw = body && typeof body === "object" ? (body as { pages?: unknown }).pages : undefined;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > CORRECTION_LIMITS.pages) return null;
  const valid = new Set(validSpreadIds);
  const seen = new Set<string>();
  const pages: CorrectionPage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const p = item as Record<string, unknown>;
    if (typeof p.spreadId !== "string" || !valid.has(p.spreadId) || seen.has(p.spreadId)) return null;
    seen.add(p.spreadId);
    let note: string | null = null;
    if (p.note !== undefined && p.note !== null) {
      if (typeof p.note !== "string") return null;
      const trimmed = p.note.trim();
      if (trimmed.length > CORRECTION_LIMITS.note) return null;
      note = trimmed || null;
    }
    const rawMarks = p.marks ?? [];
    if (!Array.isArray(rawMarks) || rawMarks.length > CORRECTION_LIMITS.marksPerPage) return null;
    const marks: CorrectionMark[] = [];
    for (const rm of rawMarks) {
      const mark = parseMark(rm);
      if (!mark) return null;
      marks.push(mark);
    }
    if (marks.length === 0 && !note) continue;
    pages.push({ spreadId: p.spreadId, note, marks });
  }
  return pages.length > 0 ? pages : null;
}

// The page numbers (1-based, in the album's order) that have corrections — for the email and the log.
export function correctedPageNumbers(pages: readonly CorrectionPage[], spreadOrder: readonly string[]): number[] {
  const ids = new Set(pages.map((p) => p.spreadId));
  return spreadOrder.flatMap((id, i) => (ids.has(id) ? [i + 1] : []));
}

// The SVG drawing of the marks: a viewBox 1000 wide and as tall as the page's proportions, so the
// strokes scale with the page wherever it's drawn (the client's view and the photographer's page).
export const MARKS_VIEW_WIDTH = 1000;
export const MARK_STROKE = 5;

export function marksViewBox(pageAspect: number): { width: number; height: number } {
  const aspect = isNum(pageAspect) && pageAspect > 0 ? pageAspect : 1.5;
  return { width: MARKS_VIEW_WIDTH, height: Math.round((MARKS_VIEW_WIDTH / aspect) * 100) / 100 };
}

// A pencil stroke as an SVG polyline's points, in the view box above.
export function penPointsAttr(points: readonly [number, number][], view: { width: number; height: number }): string {
  const list = points.length === 1 ? [points[0], points[0]] : points;
  return list.map(([x, y]) => `${Math.round(x * view.width * 10) / 10},${Math.round(y * view.height * 10) / 10}`).join(" ");
}

// Adds a point to a stroke being drawn, skipping ones too close to the last (a finger trembles), and
// never past the cap.
export function appendStrokePoint(points: [number, number][], x: number, y: number, minStep = 0.002): [number, number][] {
  if (points.length >= CORRECTION_LIMITS.pointsPerStroke) return points;
  const p: [number, number] = [round4(Math.min(1, Math.max(0, x))), round4(Math.min(1, Math.max(0, y)))];
  const last = points[points.length - 1];
  if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < minStep) return points;
  return [...points, p];
}

// A rectangle from two corners in any order, on the page.
export function rectFromCorners(a: [number, number], b: [number, number]): { x: number; y: number; w: number; h: number } {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x0 = clamp(Math.min(a[0], b[0]));
  const y0 = clamp(Math.min(a[1], b[1]));
  const x1 = clamp(Math.max(a[0], b[0]));
  const y1 = clamp(Math.max(a[1], b[1]));
  return { x: round4(x0), y: round4(y0), w: round4(x1 - x0), h: round4(y1 - y0) };
}

// Big enough to be a rectangle the client meant (a tap isn't one).
export const MIN_RECT = 0.015;

// --- Several submissions, one list (owner, 2026-11-02, "תיקון") ------------------------------------
// The client sends corrections in parts: 4 pages, and a few minutes later one more page. Each
// submission is its own row, and the photographer's page used to show only the one in the link (the
// latest), so the earlier pages looked lost. A round is everything the client sent since the
// photographer last sent the design (gallery_albums.sent_at, and the earlier sends in the event's
// log); its pages are merged: every mark, and every note with its time.

export type CorrectionSubmission = { id: string; pages: CorrectionPage[]; created_at: string };
export type CorrectionNote = { text: string; at: string };
export type MergedCorrectionPage = { spreadId: string; notes: CorrectionNote[]; marks: CorrectionMark[] };

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const v = Date.parse(iso);
  return Number.isNaN(v) ? null : v;
};

const byTime = <T extends { created_at: string }>(list: readonly T[]): T[] => [...list].sort((a, b) => (ms(a.created_at) ?? 0) - (ms(b.created_at) ?? 0));

// Every page of the submissions, oldest submission first: the marks added up, the notes in the order
// they were written (the same note sent twice counts once).
export function mergeCorrectionPages(submissions: readonly CorrectionSubmission[]): MergedCorrectionPage[] {
  const out = new Map<string, MergedCorrectionPage>();
  for (const sub of byTime(submissions)) {
    for (const page of Array.isArray(sub.pages) ? sub.pages : []) {
      if (!page || typeof page.spreadId !== "string") continue;
      const merged = out.get(page.spreadId) ?? { spreadId: page.spreadId, notes: [], marks: [] };
      const text = typeof page.note === "string" ? page.note.trim() : "";
      if (text && !merged.notes.some((n) => n.text === text)) merged.notes.push({ text, at: sub.created_at });
      if (Array.isArray(page.marks)) merged.marks.push(...page.marks);
      out.set(page.spreadId, merged);
    }
  }
  return [...out.values()].filter((p) => p.notes.length > 0 || p.marks.length > 0);
}

// The merged pages in the album's order, with their page number (1-based). A page deleted since is
// left out: there's nothing to draw it on.
export function orderCorrectionPages(pages: readonly MergedCorrectionPage[], spreadOrder: readonly string[]): (MergedCorrectionPage & { number: number })[] {
  const index = new Map(spreadOrder.map((id, i) => [id, i]));
  return pages
    .flatMap((p) => {
      const i = index.get(p.spreadId);
      return i === undefined ? [] : [{ ...p, number: i + 1 }];
    })
    .sort((a, b) => a.number - b.number);
}

// sent_at is outside GalleryAlbumRow (lib/types.ts is part of the PDF worker's build): the pages select `*`.
type AlbumRound = { status: string; sent_at?: string | null };

// The corrections still waiting for the photographer: the album asks for changes, and they came after
// the design was last sent (all of them for an album sent before sent_at was kept).
export function openCorrections<T extends { created_at: string }>(submissions: readonly T[], album: AlbumRound): T[] {
  if (album.status !== "changes_requested") return [];
  const since = ms(album.sent_at);
  return byTime(submissions).filter((s) => since === null || (ms(s.created_at) ?? 0) >= since);
}

export type CorrectionRound<T> = {
  // The send this round answers (null: before any send that was recorded).
  sentAt: string | null;
  submissions: T[];
  open: boolean;
};

// Every submission grouped by the send it answers, newest round first. `sendTimes` are when the
// photographer sent the design to the client: the album's sent_at and the event log's earlier sends.
export function correctionRounds<T extends { created_at: string }>(
  submissions: readonly T[],
  sendTimes: readonly (string | null | undefined)[],
  album: AlbumRound
): CorrectionRound<T>[] {
  // The album's sent_at and the log line of the same send are a moment apart: one send.
  const sends: string[] = [];
  for (const s of [...sendTimes, album.sent_at].filter((v): v is string => ms(v) !== null).sort((a, b) => ms(a)! - ms(b)!)) {
    if (!sends.length || ms(s)! - ms(sends[sends.length - 1])! > 10_000) sends.push(s);
  }
  const open = new Set(openCorrections(submissions, album));
  const rounds = new Map<string, CorrectionRound<T>>();
  for (const sub of byTime(submissions)) {
    // Everything still open is one round, the one the editor's panel shows, whatever the log says.
    if (open.has(sub)) {
      const round = rounds.get("open") ?? { sentAt: album.sent_at ?? null, submissions: [], open: true };
      round.submissions.push(sub);
      rounds.set("open", round);
      continue;
    }
    const at = ms(sub.created_at) ?? 0;
    let sentAt: string | null = null;
    for (const s of sends) if (ms(s)! <= at) sentAt = s;
    const key = sentAt ?? "";
    const round = rounds.get(key) ?? { sentAt, submissions: [], open: false };
    round.submissions.push(sub);
    rounds.set(key, round);
  }
  return [...rounds.values()].sort((a, b) => {
    const la = ms(a.submissions[a.submissions.length - 1].created_at) ?? 0;
    const lb = ms(b.submissions[b.submissions.length - 1].created_at) ?? 0;
    return lb - la;
  });
}
