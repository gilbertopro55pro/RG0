import { describe, expect, it } from "vitest";
import {
  CORRECTION_LIMITS,
  appendStrokePoint,
  correctedPageNumbers,
  correctionRounds,
  mergeCorrectionPages,
  openCorrections,
  orderCorrectionPages,
  marksViewBox,
  parseCorrectionPages,
  penPointsAttr,
  rectFromCorners,
} from "@/lib/albumCorrections";

// The client's corrections on the album design (owner, 2026-10-27).
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const pen = (points: [number, number][], color = "#e5322d") => ({ kind: "pen", color, points });
const rect = (x: number, y: number, w: number, h: number, color = "#2563eb") => ({ kind: "rect", color, x, y, w, h });

describe("parseCorrectionPages", () => {
  it("keeps pencil strokes, rectangles and notes on the album's pages", () => {
    const out = parseCorrectionPages(
      { pages: [{ spreadId: A, note: "  להחליף את התמונה  ", marks: [pen([[0.1, 0.2], [0.3, 0.4]]), rect(0.5, 0.5, 0.2, 0.1)] }] },
      [A, B]
    );
    expect(out).toEqual([
      {
        spreadId: A,
        note: "להחליף את התמונה",
        marks: [
          { kind: "pen", color: "#e5322d", points: [[0.1, 0.2], [0.3, 0.4]] },
          { kind: "rect", color: "#2563eb", x: 0.5, y: 0.5, w: 0.2, h: 0.1 },
        ],
      },
    ]);
  });

  it("drops pages with neither a mark nor a note, and needs something overall", () => {
    expect(parseCorrectionPages({ pages: [{ spreadId: A, note: " ", marks: [] }, { spreadId: B, note: "שינוי" }] }, [A, B])).toEqual([
      { spreadId: B, note: "שינוי", marks: [] },
    ]);
    expect(parseCorrectionPages({ pages: [{ spreadId: A, note: "", marks: [] }] }, [A])).toBeNull();
    expect(parseCorrectionPages({ pages: [] }, [A])).toBeNull();
    expect(parseCorrectionPages(null, [A])).toBeNull();
  });

  it("refuses a page of another album, a page twice, a colour outside the palette or an unknown kind", () => {
    expect(parseCorrectionPages({ pages: [{ spreadId: "x", note: "a" }] }, [A])).toBeNull();
    expect(parseCorrectionPages({ pages: [{ spreadId: A, note: "a" }, { spreadId: A, note: "b" }] }, [A])).toBeNull();
    expect(parseCorrectionPages({ pages: [{ spreadId: A, marks: [pen([[0.1, 0.1]], "#000000")] }] }, [A])).toBeNull();
    expect(parseCorrectionPages({ pages: [{ spreadId: A, marks: [{ kind: "circle", color: "#e5322d" }] }] }, [A])).toBeNull();
  });

  it("accepts the palette in any case", () => {
    expect(parseCorrectionPages({ pages: [{ spreadId: A, marks: [pen([[0.1, 0.1]], "#16A34A")] }] }, [A])?.[0].marks[0].color).toBe("#16a34a");
  });

  it("clamps a stroke just past the edge, and refuses one far off the page", () => {
    const out = parseCorrectionPages({ pages: [{ spreadId: A, marks: [pen([[-0.01, 0.5], [1.01, 0.5]])] }] }, [A]);
    expect(out?.[0].marks[0]).toEqual({ kind: "pen", color: "#e5322d", points: [[0, 0.5], [1, 0.5]] });
    expect(parseCorrectionPages({ pages: [{ spreadId: A, marks: [pen([[0.5, 2]])] }] }, [A])).toBeNull();
    expect(parseCorrectionPages({ pages: [{ spreadId: A, marks: [pen([[0.5, Number.NaN]])] }] }, [A])).toBeNull();
  });

  it("keeps a rectangle on the page, and refuses an empty one or one far off it", () => {
    const out = parseCorrectionPages({ pages: [{ spreadId: A, marks: [rect(0.9, 0.9, 0.11, 0.11)] }] }, [A]);
    expect(out?.[0].marks[0]).toEqual({ kind: "rect", color: "#2563eb", x: 0.9, y: 0.9, w: 0.1, h: 0.1 });
    expect(parseCorrectionPages({ pages: [{ spreadId: A, marks: [rect(0.2, 0.2, 0, 0.1)] }] }, [A])).toBeNull();
    expect(parseCorrectionPages({ pages: [{ spreadId: A, marks: [rect(0.9, 0.9, 0.5, 0.1)] }] }, [A])).toBeNull();
  });

  it("enforces the caps", () => {
    const longStroke = pen(Array.from({ length: CORRECTION_LIMITS.pointsPerStroke + 1 }, (_, i) => [i / 2000, 0.5] as [number, number]));
    expect(parseCorrectionPages({ pages: [{ spreadId: A, marks: [longStroke] }] }, [A])).toBeNull();
    const manyMarks = Array.from({ length: CORRECTION_LIMITS.marksPerPage + 1 }, () => rect(0.1, 0.1, 0.1, 0.1));
    expect(parseCorrectionPages({ pages: [{ spreadId: A, marks: manyMarks }] }, [A])).toBeNull();
    expect(parseCorrectionPages({ pages: [{ spreadId: A, note: "א".repeat(CORRECTION_LIMITS.note + 1) }] }, [A])).toBeNull();
  });
});

describe("drawing helpers", () => {
  it("skips points too close to the last one, and stops at the cap", () => {
    let pts: [number, number][] = [];
    pts = appendStrokePoint(pts, 0.1, 0.1);
    pts = appendStrokePoint(pts, 0.1005, 0.1);
    pts = appendStrokePoint(pts, 0.2, 0.1);
    expect(pts).toEqual([[0.1, 0.1], [0.2, 0.1]]);
    const full = Array.from({ length: CORRECTION_LIMITS.pointsPerStroke }, (_, i) => [i / 3000, 0] as [number, number]);
    expect(appendStrokePoint(full, 0.9, 0.9)).toBe(full);
  });

  it("makes a rectangle from corners in any order, on the page", () => {
    expect(rectFromCorners([0.6, 0.7], [0.2, 0.1])).toEqual({ x: 0.2, y: 0.1, w: 0.4, h: 0.6 });
    expect(rectFromCorners([0.9, 0.9], [1.3, 1.2])).toEqual({ x: 0.9, y: 0.9, w: 0.1, h: 0.1 });
  });

  it("draws in a view box with the page's proportions", () => {
    expect(marksViewBox(2)).toEqual({ width: 1000, height: 500 });
    expect(marksViewBox(0)).toEqual({ width: 1000, height: 666.67 });
    expect(penPointsAttr([[0.5, 0.5]], { width: 1000, height: 500 })).toBe("500,250 500,250");
  });

  it("numbers the corrected pages in the album's order", () => {
    expect(correctedPageNumbers([{ spreadId: B, note: "x", marks: [] }], [A, B])).toEqual([2]);
  });
});

describe("corrections sent in parts (owner, 2026-11-02)", () => {
  const C = "33333333-3333-4333-8333-333333333333";
  const red = { kind: "pen" as const, color: "#e5322d" as const, points: [[0.1, 0.1]] as [number, number][] };
  const blue = { kind: "rect" as const, color: "#2563eb" as const, x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
  // The real case: 4 pages, and 3 minutes later one more page on its own.
  const first = { id: "s1", created_at: "2026-11-02T17:34:48Z", pages: [
    { spreadId: A, note: "להחליף בין התמונות", marks: [] },
    { spreadId: B, note: "התמונה חתוכה", marks: [red] },
  ] };
  const second = { id: "s2", created_at: "2026-11-02T17:37:56Z", pages: [
    { spreadId: C, note: "להזיז את הטקסט", marks: [blue] },
    { spreadId: B, note: "גם להבהיר", marks: [blue] },
  ] };

  it("merges every page of every submission, the notes in order and the marks added up", () => {
    const merged = mergeCorrectionPages([second, first]);
    expect(merged.map((p) => p.spreadId)).toEqual([A, B, C]);
    const b = merged.find((p) => p.spreadId === B)!;
    expect(b.notes).toEqual([
      { text: "התמונה חתוכה", at: first.created_at },
      { text: "גם להבהיר", at: second.created_at },
    ]);
    expect(b.marks).toEqual([red, blue]);
  });

  it("counts the same note sent twice once, and drops a page left with nothing", () => {
    const again = { id: "s3", created_at: "2026-11-02T18:00:00Z", pages: [{ spreadId: A, note: " להחליף בין התמונות ", marks: [] }] };
    expect(mergeCorrectionPages([first, again]).find((p) => p.spreadId === A)!.notes).toHaveLength(1);
    expect(mergeCorrectionPages([{ id: "x", created_at: "2026-11-02T18:00:00Z", pages: [{ spreadId: A, note: null, marks: [] }] }])).toEqual([]);
  });

  it("orders the pages as in the album, with their numbers, and leaves out a deleted page", () => {
    const ordered = orderCorrectionPages(mergeCorrectionPages([first, second]), [C, "other", A]);
    expect(ordered.map((p) => [p.spreadId, p.number])).toEqual([
      [C, 1],
      [A, 3],
    ]);
  });

  it("keeps open only what came after the design was last sent, while the album asks for changes", () => {
    const old = { id: "s0", created_at: "2026-11-01T19:14:26Z", pages: [] };
    const album = { status: "changes_requested", sent_at: "2026-11-02T15:53:28Z" };
    expect(openCorrections([second, old, first], album).map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(openCorrections([old, first], { status: "changes_requested", sent_at: null }).map((s) => s.id)).toEqual(["s0", "s1"]);
    expect(openCorrections([first], { status: "sent", sent_at: "2026-11-02T15:53:28Z" })).toEqual([]);
    expect(openCorrections([first], { status: "approved", sent_at: null })).toEqual([]);
  });

  it("groups every submission by the send it answers, newest round first", () => {
    const a = { id: "a", created_at: "2026-10-30T10:00:00Z", pages: [] };
    const b = { id: "b", created_at: "2026-11-01T19:14:26Z", pages: [] };
    const c = { id: "c", created_at: "2026-11-01T19:15:55Z", pages: [] };
    const album = { status: "changes_requested", sent_at: "2026-11-02T15:53:28Z" };
    const rounds = correctionRounds([a, b, c, first, second], ["2026-11-01T10:00:00Z", "2026-11-02T15:53:28.600Z"], album);
    expect(rounds.map((r) => [r.sentAt, r.submissions.map((s) => s.id), r.open])).toEqual([
      ["2026-11-02T15:53:28Z", ["s1", "s2"], true],
      ["2026-11-01T10:00:00Z", ["b", "c"], false],
      [null, ["a"], false],
    ]);
  });

  it("keeps everything still open in one round, even across a send the log has after it", () => {
    const rounds = correctionRounds([first, second], ["2026-11-02T17:35:00Z"], { status: "changes_requested", sent_at: "2026-11-02T15:53:28Z" });
    expect(rounds.map((r) => [r.submissions.map((s) => s.id), r.open])).toEqual([[["s1", "s2"], true]]);
  });

  it("has one open round for an album sent before the send times were kept", () => {
    const rounds = correctionRounds([first, second], [], { status: "changes_requested", sent_at: null });
    expect(rounds).toHaveLength(1);
    expect(rounds[0].open).toBe(true);
  });
});
