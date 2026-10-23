import { beforeEach, describe, expect, it, vi } from "vitest";

// The client's side of the magnet frame approval (stage 3): the portal route that approves or
// comments, and the loader that gives the portal page the shared frames, against a recorded fake
// Supabase client. What matters most: only a shared frame of the token's own event is touched.

type Op = { table: string; op: "select" | "update" | "insert"; payload?: Record<string, unknown>; filters: [string, string, unknown][] };
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
        eq: (k: string, v: unknown) => (op.filters.push(["eq", k, v]), q),
        in: (k: string, v: unknown) => (op.filters.push(["in", k, v]), q),
        not: (k: string, o: string, v: unknown) => (op.filters.push([`not.${o}`, k, v]), q),
        order: () => q,
        returns: () => q,
        update: (p: Record<string, unknown>) => ((op.op = "update"), (op.payload = p), q),
        insert: (p: Record<string, unknown>) => ((op.op = "insert"), (op.payload = p), q),
        maybeSingle: run,
        single: run,
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej),
      };
      return q;
    },
  };
}

const mocks = vi.hoisted(() => ({
  rateAllowed: true,
  mailAllowed: true,
  sendEmail: vi.fn<(m: { to: string; subject: string; text: string }) => Promise<void>>(async () => {}),
  sendPush: vi.fn<(id: string, p: { title: string; body: string; url: string; tag: string }) => Promise<number>>(async () => 1),
  shortPageUrl: vi.fn(async (path: string) => `https://myframeflow.com/l/abcdefghij?to=${path}`),
  getSignedDownloadUrls: vi.fn(async (bucket: string, paths: string[]) => paths.map((path) => ({ path, signedUrl: `https://r2/${bucket}/${path}?sig` }))),
}));
vi.mock("@/lib/supabase/serviceRole", () => ({ createServiceRoleClient: () => fakeSupabase() }));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: async (key: string) => ({ allowed: key.startsWith("magnet-approval-mail:") ? mocks.mailAllowed : mocks.rateAllowed }),
  clientIpFrom: () => "1.2.3.4",
}));
vi.mock("@/lib/resend", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/push", () => ({ sendPushToPhotographer: mocks.sendPush }));
vi.mock("@/lib/notificationEmail", () => ({ notificationEmailFor: (e: string) => e }));
vi.mock("@/lib/shortFileLinks", () => ({ shortPageUrl: mocks.shortPageUrl, PAGE_LINK_TTL: 1 }));
vi.mock("@/lib/storage", () => ({ getSignedDownloadUrls: mocks.getSignedDownloadUrls }));

import { POST } from "@/app/api/portal/[token]/magnet-frames/[id]/route";
import { loadPortalMagnetFrames } from "@/lib/portalMagnetFrames";
import { DEFAULT_MAGNET_FRAME_SETTINGS } from "@/lib/magnetFrameShared";

const TOKEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVENT = "33333333-3333-4333-8333-333333333333";
const PHOTOGRAPHER = "11111111-1111-4111-8111-111111111111";
const DESIGN = "22222222-2222-4222-8222-222222222222";
const OTHER = "55555555-5555-4555-8555-555555555555";

const shared = {
  id: DESIGN,
  name: "מגנטים לחתונה",
  event_id: EVENT,
  updated_at: "2026-10-20T10:00:00Z",
  client_shared_at: "2026-10-21T09:00:00Z",
  client_approved_at: null as string | null,
  client_comment: null as string | null,
  client_comment_at: null as string | null,
};
let design: typeof shared | null = shared;

const post = (body: unknown, id = DESIGN, token = TOKEN) =>
  POST(new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }), {
    params: Promise.resolve({ token, id }),
  });
const writes = () => ops.filter((o) => o.op !== "select");
const has = (op: Op, k: string, v: unknown) => op.filters.some(([o, key, val]) => o === "eq" && key === k && val === v);

beforeEach(() => {
  ops = [];
  mocks.rateAllowed = true;
  mocks.mailAllowed = true;
  mocks.sendEmail.mockClear();
  mocks.sendPush.mockClear();
  mocks.shortPageUrl.mockClear();
  mocks.getSignedDownloadUrls.mockClear();
  design = { ...shared };
  respond = (op) => {
    if (op.table === "events")
      return { data: has(op, "client_access_token", TOKEN) ? { id: EVENT, client_name: "דנה ויוסי", photographer_id: PHOTOGRAPHER, photographers: { name: "אור", email: "or@example.com", ui_lang: null } } : null, error: null };
    if (op.table === "magnet_frame_designs" && op.op === "select")
      return { data: design && has(op, "id", design.id) && has(op, "event_id", EVENT) && has(op, "photographer_id", PHOTOGRAPHER) ? design : null, error: null };
    return { data: null, error: null };
  };
});

describe("POST /api/portal/<token>/magnet-frames/<id>", () => {
  it("approves a shared frame of the token's event, logs it and emails the photographer", async () => {
    const res = await post({ action: "approve" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, status: "approved" });
    const [update, log] = writes();
    expect(update.table).toBe("magnet_frame_designs");
    expect(Object.keys(update.payload!)).toEqual(["client_approved_at"]);
    expect(has(update, "id", DESIGN) && has(update, "event_id", EVENT) && has(update, "photographer_id", PHOTOGRAPHER)).toBe(true);
    expect(log.table).toBe("event_notifications");
    expect(log.payload).toMatchObject({ event_id: EVENT, is_client_action: true, text: 'דנה ויוסי אישרו את עיצוב המגנטים "מגנטים לחתונה"' });
    expect(mocks.shortPageUrl).toHaveBeenCalledWith(`/magnet-frames/${DESIGN}`, expect.objectContaining({ photographerId: PHOTOGRAPHER }));
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const mail = mocks.sendEmail.mock.calls[0][0];
    expect(mail.to).toBe("or@example.com");
    expect(mail.subject).toBe("דנה ויוסי אישרו את עיצוב המגנטים");
    expect(mail.text).toContain(`/magnet-frames/${DESIGN}`);
    expect(mocks.sendPush).toHaveBeenCalledWith(PHOTOGRAPHER, { title: "דנה ויוסי אישרו את עיצוב המגנטים", body: "מגנטים לחתונה", url: `/magnet-frames/${DESIGN}`, tag: `magnet-${DESIGN}` });
  });

  it("sends the phone notification in the photographer's language, the comment shortened", async () => {
    respond = ((orig) => (op: Op) =>
      op.table === "events" ? { data: { id: EVENT, client_name: "Dana & Yossi", photographer_id: PHOTOGRAPHER, photographers: { name: "Or", email: "or@example.com", ui_lang: "en" } }, error: null } : orig(op))(respond);
    design = { ...shared, name: "  " };
    await post({ action: "comment", text: "א".repeat(200) });
    const [, push] = mocks.sendPush.mock.calls[0];
    expect(push.title).toBe("Comment on the magnet design | Dana & Yossi");
    expect(push.body).toBe(`${"א".repeat(140)}…`);
    expect(push.tag).toBe(`magnet-${DESIGN}`);
    mocks.sendPush.mockClear();
    design = { ...shared, name: null as unknown as string };
    await post({ action: "approve" });
    expect(mocks.sendPush.mock.calls[0][1]).toMatchObject({ title: "Dana & Yossi approved the magnet design", body: "Untitled frame" });
  });

  it("notifies the phone on every answer, past the email limit too", async () => {
    mocks.mailAllowed = false;
    await post({ action: "comment", text: "להגדיל" });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
  });

  it("does nothing on a second approval of the same design", async () => {
    design = { ...shared, client_approved_at: "2026-10-21T12:00:00Z" };
    const res = await post({ action: "approve" });
    expect(await res.json()).toMatchObject({ ok: true, status: "approved", approvedAt: "2026-10-21T12:00:00Z" });
    expect(writes()).toEqual([]);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("approves again a design changed after the approval", async () => {
    design = { ...shared, client_approved_at: "2026-10-21T12:00:00Z", updated_at: "2026-10-21T13:00:00Z" };
    expect(await (await post({ action: "approve" })).json()).toMatchObject({ status: "approved" });
    expect(writes()[0].payload).toHaveProperty("client_approved_at");
  });

  it("saves a comment, which drops the approval", async () => {
    design = { ...shared, client_approved_at: "2026-10-21T12:00:00Z" };
    const res = await post({ action: "comment", text: "  להגדיל את השמות  " });
    expect(await res.json()).toMatchObject({ ok: true, status: "comment", comment: "להגדיל את השמות", approvedAt: null });
    const [update, log] = writes();
    expect(update.payload).toMatchObject({ client_approved_at: null, client_comment: "להגדיל את השמות" });
    expect(typeof update.payload!.client_comment_at).toBe("string");
    expect(log.payload!.text).toBe('דנה ויוסי השאירו הערה על עיצוב המגנטים "מגנטים לחתונה": להגדיל את השמות');
    const mail = mocks.sendEmail.mock.calls[0][0];
    expect(mail.subject).toBe("הערה על עיצוב המגנטים | דנה ויוסי");
    expect(mail.text).toContain("להגדיל את השמות");
  });

  it("refuses a bad request, another event's frame, an unshared frame and a wrong token", async () => {
    expect((await post({ action: "comment", text: "  " })).status).toBe(400);
    expect((await post({ action: "comment", text: "א".repeat(1001) })).status).toBe(400);
    expect((await post({ action: "delete" })).status).toBe(400);
    expect((await post("{")).status).toBe(400);
    expect((await post({ action: "approve" }, "not-a-uuid")).status).toBe(404);
    expect((await post({ action: "approve" }, OTHER)).status).toBe(404);
    expect((await post({ action: "approve" }, DESIGN, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).status).toBe(404);
    design = { ...shared, client_shared_at: null as unknown as string };
    expect((await post({ action: "approve" })).status).toBe(404);
    design = { ...shared, event_id: "66666666-6666-4666-8666-666666666666" };
    expect((await post({ action: "approve" })).status).toBe(404);
    expect(writes()).toEqual([]);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("answers 429 past the rate limit", async () => {
    mocks.rateAllowed = false;
    expect((await post({ action: "approve" })).status).toBe(429);
    expect(ops).toEqual([]);
  });
});

describe("loadPortalMagnetFrames", () => {
  const text = { id: "t1", type: "text", text: "דנה ויוסי", xPct: 50, yPct: 90, fontKey: "heebo", fontSizePx: 72, color: "#000", shadowEnabled: false, shadowBlurPx: 6, shadowDistancePx: 3 };
  const custom = { id: "d1", type: "decoration", customElementAssetId: "el-1", xPct: 10, yPct: 10, sizePct: 10, color: "#000" };

  it("gives the shared frames of the event, with the uploads they use signed, and no frame name", async () => {
    respond = (op) => {
      if (op.table === "magnet_frame_designs")
        return {
          data: [
            {
              id: DESIGN,
              landscape_elements: [text, custom],
              portrait_elements: [text],
              frame_settings: { customTextureAssetId: "tx-1", sizeKey: "9x9" },
              updated_at: "2026-10-20T10:00:00Z",
              client_shared_at: "2026-10-21T09:00:00Z",
              client_approved_at: null,
              client_comment: null,
              client_comment_at: null,
            },
          ],
          error: null,
        };
      if (op.table === "magnet_frame_custom_textures") return { data: [{ id: "tx-1", storage_path: `${PHOTOGRAPHER}/tx.png` }], error: null };
      if (op.table === "magnet_frame_custom_elements") return { data: [{ id: "el-1", storage_path: `${PHOTOGRAPHER}/el.png` }], error: null };
      if (op.table === "photographers") return { data: { portfolio_slug: "or-studio", portfolio_enabled: true }, error: null };
      return { data: null, error: null };
    };
    const { frames, qrContext } = await loadPortalMagnetFrames(fakeSupabase() as never, { id: EVENT, photographer_id: PHOTOGRAPHER });
    expect(qrContext).toEqual({ eventId: EVENT, portfolioSlug: "or-studio" });
    expect(frames).toHaveLength(1);
    const [f] = frames;
    expect(f).not.toHaveProperty("name");
    expect(f.status).toBe("waiting");
    expect(f.frameSettings).toEqual({ ...DEFAULT_MAGNET_FRAME_SETTINGS, customTextureAssetId: "tx-1", sizeKey: "9x9" });
    // An older text without the bold field is bold, as the editor reads it.
    expect(f.landscapeElements[0]).toMatchObject({ bold: true, italic: false, underline: false });
    expect(f.customTextureUrl).toBe(`https://r2/magnet-frame-textures/${PHOTOGRAPHER}/tx.png?sig`);
    expect(f.customElementUrls).toEqual({ "el-1": `https://r2/magnet-frame-elements/${PHOTOGRAPHER}/el.png?sig` });

    const designsQuery = ops.find((o) => o.table === "magnet_frame_designs")!;
    expect(designsQuery.filters).toEqual(
      expect.arrayContaining([
        ["eq", "event_id", EVENT],
        ["eq", "photographer_id", PHOTOGRAPHER],
        ["not.is", "client_shared_at", null],
      ])
    );
    // The uploads only of this photographer.
    for (const table of ["magnet_frame_custom_textures", "magnet_frame_custom_elements"]) expect(ops.find((o) => o.table === table)!.filters).toContainEqual(["eq", "photographer_id", PHOTOGRAPHER]);
  });

  it("is empty without shared frames, and never fails the portal", async () => {
    respond = () => ({ data: [], error: null });
    expect((await loadPortalMagnetFrames(fakeSupabase() as never, { id: EVENT, photographer_id: PHOTOGRAPHER })).frames).toEqual([]);
    expect(mocks.getSignedDownloadUrls).not.toHaveBeenCalled();
    respond = () => {
      throw new Error("db down");
    };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await loadPortalMagnetFrames(fakeSupabase() as never, { id: EVENT, photographer_id: PHOTOGRAPHER })).frames).toEqual([]);
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });
});
