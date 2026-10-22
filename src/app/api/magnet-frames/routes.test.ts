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
import { GET as CLIENT } from "@/app/api/magnet-frames/[id]/client/route";
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

    // Unlinking (or moving to another event) also ends the sharing with the old event's client.
    ops = [];
    await PATCH(json({ eventId: null, name: "" }, "PATCH"), params(DESIGN));
    expect(writes()[0].payload).toEqual({ name: null, event_id: null, client_shared_at: null, client_approved_at: null, client_comment: null, client_comment_at: null });

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
  it("shares the frame with the client, and stops", async () => {
    const res = await PATCH(json({ shareWithClient: true }, "PATCH"), params(DESIGN));
    expect(res.status).toBe(200);
    const [share] = writes();
    expect(Object.keys(share.payload!)).toEqual(["client_shared_at"]);
    expect(Date.parse(share.payload!.client_shared_at as string)).toBeGreaterThan(Date.now() - 5000);
    expect(share.filters).toEqual([
      ["id", DESIGN],
      ["photographer_id", USER],
    ]);

    ops = [];
    await PATCH(json({ shareWithClient: false }, "PATCH"), params(DESIGN));
    expect(writes()[0].payload).toEqual({ client_shared_at: null });
  });

  it("asks for a new approval when a frame changed after the client approved it is sent again", async () => {
    respond = ((base) => (op: Op) =>
      op.op === "select" && op.table === "magnet_frame_designs"
        ? { data: { event_id: EVENT, updated_at: "2026-10-21T13:00:00Z", client_shared_at: "2026-10-21T09:00:00Z", client_approved_at: "2026-10-21T12:00:00Z", client_comment: null, client_comment_at: null }, error: null }
        : base(op))(respond);
    await PATCH(json({ shareWithClient: true }, "PATCH"), params(DESIGN));
    expect(writes()[0].payload).toMatchObject({ client_approved_at: null });
  });

  it("won't share a frame with no event, or a bad value", async () => {
    respond = ((base) => (op: Op) => (op.op === "select" && op.table === "magnet_frame_designs" && op.filters.some(([k, v]) => k === "id" && v === DESIGN) ? { data: { event_id: null, updated_at: "2026-10-21T13:00:00Z", client_shared_at: null, client_approved_at: null, client_comment: null, client_comment_at: null }, error: null } : base(op)))(respond);
    expect((await PATCH(json({ shareWithClient: true }, "PATCH"), params(DESIGN))).status).toBe(400);
    expect((await PATCH(json({ shareWithClient: "yes" }, "PATCH"), params(DESIGN))).status).toBe(400);
    // Unlinking and sharing in one request: no event to share with.
    expect((await PATCH(json({ eventId: null, shareWithClient: true }, "PATCH"), params(DESIGN))).status).toBe(400);
    expect(writes()).toEqual([]);
    // Another photographer's frame.
    expect((await PATCH(json({ shareWithClient: true }, "PATCH"), params("55555555-5555-4555-8555-555555555555"))).status).toBe(404);
  });

  it("gives the editor the client's status, contact and a ready message", async () => {
    const TOKEN = "0f1e2d3c-4b5a-4968-8776-655443322110";
    respond = ((base) => (op: Op) => {
      if (op.table === "magnet_frame_designs")
        return op.filters.some(([k, v]) => k === "id" && v === DESIGN)
          ? { data: { id: DESIGN, event_id: EVENT, updated_at: "2026-10-20T10:00:00Z", client_shared_at: "2026-10-21T09:00:00Z", client_approved_at: null, client_comment: "להגדיל את השם", client_comment_at: "2026-10-21T11:00:00Z" }, error: null }
          : { data: null, error: null };
      if (op.table === "events") return { data: { id: EVENT, client_name: "דנה כהן", client_phone: "050-1234567", client_email: " ", client_lang: "he", client_access_token: TOKEN }, error: null };
      if (op.table === "photographers") return { data: { name: "אור", email: "or@example.com", whatsapp_signature: null }, error: null };
      return base(op);
    })(respond);
    const res = await CLIENT(new Request("http://x"), params(DESIGN));
    expect(res.status).toBe(200);
    const info = await res.json();
    expect(info).toMatchObject({
      status: "comment",
      comment: "להגדיל את השם",
      client: { eventId: EVENT, name: "דנה כהן", firstName: "דנה", phone: "050-1234567", email: null, lang: "he" },
      subject: "עיצוב המגנטים לאירוע",
    });
    expect(info.portalUrl).toMatch(/^https?:\/\/[^/]+\/s\/p[0-9A-Za-z]{11}#magnets$/);
    expect(info.message).toBe(`שלום דנה,\nעיצוב המגנטים לאירוע מוכן. אפשר לראות ולאשר אותו כאן:\n${info.portalUrl}\n\nאור`);
    // Only the photographer's own frame and event.
    expect(ops.find((o) => o.table === "magnet_frame_designs")!.filters).toContainEqual(["photographer_id", USER]);
    expect(ops.find((o) => o.table === "events")!.filters).toContainEqual(["photographer_id", USER]);

    expect((await CLIENT(new Request("http://x"), params("55555555-5555-4555-8555-555555555555"))).status).toBe(404);
    auth.value = null;
    expect((await CLIENT(new Request("http://x"), params(DESIGN))).status).toBe(403);
  });

  it("has no client and no message for a frame with no event", async () => {
    respond = ((base) => (op: Op) =>
      op.table === "magnet_frame_designs"
        ? { data: { id: DESIGN, event_id: null, updated_at: "2026-10-20T10:00:00Z", client_shared_at: null, client_approved_at: null, client_comment: null, client_comment_at: null }, error: null }
        : op.table === "photographers"
          ? { data: { name: "אור", email: null, whatsapp_signature: null }, error: null }
          : base(op))(respond);
    const info = await (await CLIENT(new Request("http://x"), params(DESIGN))).json();
    expect(info).toMatchObject({ status: "not_shared", client: null, portalUrl: null, message: null });
    expect(ops.some((o) => o.table === "events")).toBe(false);
  });
});
