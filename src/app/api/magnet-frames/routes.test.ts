import { beforeEach, describe, expect, it, vi } from "vitest";

// The magnet frames API (several frames per account, 2026-10-22) against a recorded fake Supabase
// client: what each request writes, and what it refuses.

type Op = { table: string; op: "select" | "update" | "insert" | "delete"; payload?: Record<string, unknown>; filters: [string, unknown][] };
let ops: Op[] = [];
let respond: (op: Op) => { data: unknown; error: unknown } = () => ({ data: null, error: null });

function fakeSupabase() {
  return {
    from(table: string) {
      const op: Op = { table, op: "select", filters: [] };
      const run = () => {
        ops.push(op);
        return Promise.resolve(respond(op));
      };
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => (op.filters.push([k, v]), q),
        order: () => q,
        limit: () => q,
        returns: () => q,
        update: (p: Record<string, unknown>) => ((op.op = "update"), (op.payload = p), q),
        insert: (p: Record<string, unknown>) => ((op.op = "insert"), (op.payload = p), q),
        delete: () => ((op.op = "delete"), q),
        maybeSingle: run,
        single: run,
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej),
      };
      return q;
    },
  };
}

const auth = vi.hoisted(() => ({ value: null as null | { supabase: unknown; userId: string } }));
const removeObjects = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/designTools", () => ({ requireDesignToolsUser: async () => auth.value }));
vi.mock("@/lib/storage", () => ({ removeObjects }));
vi.mock("@/i18n/server", () => ({
  getT: async () => (key: string, vars?: Record<string, string>) => key.replace(/\{(\w+)\}/g, (m, n: string) => vars?.[n] ?? m),
}));

import { GET as listGET, POST } from "@/app/api/magnet-frames/route";
import { DELETE, GET, PATCH } from "@/app/api/magnet-frames/[id]/route";
import { POST as DUPLICATE } from "@/app/api/magnet-frames/[id]/duplicate/route";
import { DEFAULT_MAGNET_FRAME_SETTINGS } from "@/lib/magnetFrameShared";

const USER = "11111111-1111-4111-8111-111111111111";
const DESIGN = "22222222-2222-4222-8222-222222222222";
const EVENT = "33333333-3333-4333-8333-333333333333";
const OTHER_EVENT = "44444444-4444-4444-8444-444444444444";
const text = { id: "t1", type: "text", text: "רותם", xPct: 50, yPct: 90, fontKey: "heebo", fontSizePx: 72, color: "#000", bold: false, italic: false, underline: false, shadowEnabled: false, shadowBlurPx: 6, shadowDistancePx: 3 };

const json = (body: unknown, method = "POST") => new Request("http://x/api", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const writes = () => ops.filter((o) => o.op !== "select");

beforeEach(() => {
  ops = [];
  removeObjects.mockClear();
  auth.value = { supabase: fakeSupabase(), userId: USER };
  // The photographer owns EVENT and DESIGN; every write returns the row it wrote.
  respond = (op) => {
    if (op.table === "events") return { data: op.filters.some(([k, v]) => k === "id" && v === EVENT) ? { id: EVENT } : null, error: null };
    if (op.op === "insert" || op.op === "update") return { data: { id: DESIGN, ...op.payload, event: null }, error: null };
    if (op.op === "delete") return { data: op.filters.some(([k, v]) => k === "id" && v === DESIGN) ? { id: DESIGN } : null, error: null };
    if (op.filters.some(([k, v]) => k === "id" && v === DESIGN)) return { data: { id: DESIGN, name: "חתונה", event_id: EVENT, landscape_elements: [text], portrait_elements: [text], frame_settings: DEFAULT_MAGNET_FRAME_SETTINGS }, error: null };
    return { data: op.filters.some(([k]) => k === "id") ? null : [], error: null };
  };
});

describe("magnet frames API", () => {
  it("answers 403 without the design tools", async () => {
    auth.value = null;
    expect((await listGET()).status).toBe(403);
    expect((await POST(json({ elements: [] }))).status).toBe(403);
    expect((await PATCH(json({ name: "x" }, "PATCH"), params(DESIGN))).status).toBe(403);
    expect((await DELETE(new Request("http://x"), params(DESIGN))).status).toBe(403);
    expect((await DUPLICATE(new Request("http://x"), params(DESIGN))).status).toBe(403);
    expect(ops).toEqual([]);
  });

  it("lists the photographer's frames", async () => {
    const res = await listGET();
    expect(await res.json()).toEqual({ designs: [] });
    expect(ops[0].filters).toContainEqual(["photographer_id", USER]);
  });

  it("creates a frame: name trimmed to 80, the event checked, the portrait frame a copy, default settings", async () => {
    const res = await POST(json({ name: `  ${"א".repeat(100)}  `, eventId: EVENT, elements: [text] }));
    expect(res.status).toBe(200);
    const [insert] = writes();
    expect(insert.op).toBe("insert");
    expect(insert.payload).toMatchObject({ photographer_id: USER, name: "א".repeat(80), event_id: EVENT, landscape_elements: [text], portrait_elements: [text], frame_settings: DEFAULT_MAGNET_FRAME_SETTINGS });
    expect(insert.payload!.portrait_elements).not.toBe(insert.payload!.landscape_elements);
    expect(ops.find((o) => o.table === "events")!.filters).toContainEqual(["photographer_id", USER]);
  });

  it("refuses another photographer's event, and a bad body", async () => {
    expect((await POST(json({ eventId: OTHER_EVENT, elements: [] }))).status).toBe(404);
    expect((await POST(json({ eventId: "not-a-uuid", elements: [] }))).status).toBe(400);
    expect((await POST(json({ name: "x" }))).status).toBe(400);
    expect((await POST(new Request("http://x", { method: "POST", body: "{" }))).status).toBe(400);
    expect(writes()).toEqual([]);
  });

  it("saves the editor's frames without touching the name or the event unless they're sent", async () => {
    await POST(json({ id: DESIGN, elements: [text], portraitElements: [], frameSettings: { ...DEFAULT_MAGNET_FRAME_SETTINGS, sizeKey: "9x9" } }));
    const [save] = writes();
    expect(save.op).toBe("update");
    expect(save.filters).toEqual([
      ["id", DESIGN],
      ["photographer_id", USER],
    ]);
    expect(Object.keys(save.payload!).sort()).toEqual(["frame_settings", "landscape_elements", "portrait_elements", "updated_at"]);
    expect(save.payload!.portrait_elements).toEqual([]);

    ops = [];
    await POST(json({ id: DESIGN, name: "   ", eventId: null, elements: [] }));
    expect(writes()[0].payload).toMatchObject({ name: null, event_id: null });
    expect(ops.some((o) => o.table === "events")).toBe(false);
  });

  it("renames and links with PATCH, and refuses an empty or bad patch", async () => {
    const res = await PATCH(json({ name: " מגנטים לחתונה " }, "PATCH"), params(DESIGN));
    expect(res.status).toBe(200);
    expect(writes()[0].payload).toEqual({ name: "מגנטים לחתונה" });

    ops = [];
    await PATCH(json({ eventId: EVENT }, "PATCH"), params(DESIGN));
    expect(writes()[0].payload).toEqual({ event_id: EVENT });

    ops = [];
    await PATCH(json({ eventId: null, name: "" }, "PATCH"), params(DESIGN));
    expect(writes()[0].payload).toEqual({ name: null, event_id: null });

    ops = [];
    expect((await PATCH(json({}, "PATCH"), params(DESIGN))).status).toBe(400);
    expect((await PATCH(json({ eventId: OTHER_EVENT }, "PATCH"), params(DESIGN))).status).toBe(404);
    expect((await PATCH(json({ name: 5 }, "PATCH"), params(DESIGN))).status).toBe(400);
    expect((await PATCH(json({ name: "x" }, "PATCH"), params("nope"))).status).toBe(404);
    expect(writes()).toEqual([]);
  });

  it("reads one frame, 404 when it isn't the photographer's", async () => {
    expect((await GET(new Request("http://x"), params(DESIGN))).status).toBe(200);
    expect((await GET(new Request("http://x"), params("55555555-5555-4555-8555-555555555555"))).status).toBe(404);
  });

  it("deletes a frame and its PSD downloads, only under the photographer's own prefix", async () => {
    const res = await DELETE(new Request("http://x"), params(DESIGN));
    expect(await res.json()).toEqual({ ok: true });
    expect(removeObjects).toHaveBeenCalledWith("magnet-frame-exports", [`${USER}/${DESIGN}-landscape.psd`, `${USER}/${DESIGN}-portrait.psd`]);

    removeObjects.mockClear();
    expect((await DELETE(new Request("http://x"), params("55555555-5555-4555-8555-555555555555"))).status).toBe(404);
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it("duplicates a frame for the same event, named as a copy", async () => {
    const res = await DUPLICATE(new Request("http://x"), params(DESIGN));
    expect(res.status).toBe(200);
    const insert = writes()[0];
    expect(insert.payload).toMatchObject({ photographer_id: USER, name: "חתונה (עותק)", event_id: EVENT, landscape_elements: [text], frame_settings: DEFAULT_MAGNET_FRAME_SETTINGS });

    // A frame with no name.
    respond = ((base) => (op: Op) => (op.op === "select" && op.table === "magnet_frame_designs" ? { data: { id: DESIGN, name: null, event_id: null, landscape_elements: [], portrait_elements: [], frame_settings: DEFAULT_MAGNET_FRAME_SETTINGS }, error: null } : base(op)))(respond);
    ops = [];
    await DUPLICATE(new Request("http://x"), params(DESIGN));
    expect(writes()[0].payload).toMatchObject({ name: "מסגרת (עותק)", event_id: null });
  });
});
