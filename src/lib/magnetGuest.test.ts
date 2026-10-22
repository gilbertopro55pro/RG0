import { describe, expect, it } from "vitest";
import { hasGalleryQr, magnetGuestShareToken, magnetGuestState } from "@/lib/magnetGuest";
import { magnetGuestCode } from "@/lib/magnetQr";

// A fake service-role client: records every call's filters and answers per table.
type Op = [string, ...unknown[]];
type Call = { table: string; ops: Op[] };
function fakeDb(answer: (table: string, ops: Op[]) => { data: unknown; error?: unknown }) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const chain: object = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "then") return (resolve: (v: unknown) => void) => resolve({ error: null, ...answer(table, call.ops) });
            return (...args: unknown[]) => {
              call.ops.push([prop, ...args]);
              return chain;
            };
          },
        },
      );
      return chain;
    },
  };
  return { db: db as never, calls };
}

const EVENT = "3f2a9c1e-7b4d-4e8f-9a01-23456789abcd";
const CODE = magnetGuestCode(EVENT)!;
const OWNER = "p-1";
const STUDIO = { name: " סטודיו אור ", email: "or@example.com", logo_storage_path: "or/logo.png", portfolio_slug: "or", portfolio_enabled: true };
const qr = (target: string) => ({ id: "q", type: "qr", target, xPct: 10, yPct: 90, sizePct: 20, color: "#111111", bgColor: "#ffffff" });
const gallery = (id: string, over: Record<string, unknown> = {}) => ({ id, published: true, archived_at: null, created_at: "2026-10-01", ...over });

function world(over: { events?: unknown[]; designs?: unknown[]; galleries?: unknown[]; studio?: unknown; clientLang?: string | null } = {}) {
  return fakeDb((table) => {
    if (table === "events") return { data: over.events ?? [{ id: EVENT, photographer_id: OWNER, client_lang: over.clientLang ?? null }] };
    if (table === "magnet_frame_designs") return { data: over.designs ?? [{ landscape_elements: [qr("gallery")], portrait_elements: [] }] };
    if (table === "galleries") return { data: over.galleries ?? [] };
    if (table === "photographers") return { data: over.studio === undefined ? STUDIO : over.studio };
    return { data: null };
  });
}

const opsOf = (calls: Call[], table: string) => calls.find((c) => c.table === table)?.ops ?? [];

describe("magnetGuestState", () => {
  it("doesn't touch the database for a code it never made", async () => {
    const { db, calls } = world();
    for (const code of ["", "short", "x".repeat(12), "ZZZZZZZZZZZ", "abc/def+123"]) {
      expect(await magnetGuestState(db, code)).toEqual({ kind: "inactive", lang: "he" });
    }
    expect(calls).toEqual([]);
  });

  it("finds the event by the range of ids the code stands for", async () => {
    const { db, calls } = world({ galleries: [gallery("g1")] });
    await magnetGuestState(db, CODE);
    expect(opsOf(calls, "events")).toEqual(
      expect.arrayContaining([
        ["gte", "id", "3f2a9c1e-7b4d-4e8f-0000-000000000000"],
        ["lte", "id", "3f2a9c1e-7b4d-4e8f-ffff-ffffffffffff"],
        ["limit", 2],
      ]),
    );
  });

  it("no event, or two (a collision): not active", async () => {
    expect(await magnetGuestState(world({ events: [] }).db, CODE)).toEqual({ kind: "inactive", lang: "he" });
    const two = [{ id: EVENT, photographer_id: OWNER, client_lang: null }, { id: EVENT.replace("abcd", "abce"), photographer_id: "x", client_lang: null }];
    expect(await magnetGuestState(world({ events: two }).db, CODE)).toEqual({ kind: "inactive", lang: "he" });
  });

  it("works only while one of the event's frames has a QR that opens the gallery", async () => {
    const off = world({ designs: [{ landscape_elements: [qr("portfolio"), qr("url")], portrait_elements: [] }], galleries: [gallery("g1")], clientLang: "ru" });
    expect(await magnetGuestState(off.db, CODE)).toEqual({ kind: "inactive", lang: "ru" });
    expect(await magnetGuestState(world({ designs: [], galleries: [gallery("g1")] }).db, CODE)).toMatchObject({ kind: "inactive" });
    // A QR in the portrait frame only counts too.
    const portrait = world({ designs: [{ landscape_elements: [], portrait_elements: [qr("gallery")] }], galleries: [gallery("g1")] });
    expect(await magnetGuestState(portrait.db, CODE)).toEqual({ kind: "gallery", lang: "he", galleryId: "g1" });
  });

  it("reads only the event's own photographer's frames and galleries, never the portfolio gallery", async () => {
    const { db, calls } = world({ galleries: [gallery("g1")] });
    await magnetGuestState(db, CODE);
    expect(opsOf(calls, "magnet_frame_designs")).toEqual(expect.arrayContaining([["eq", "event_id", EVENT], ["eq", "photographer_id", OWNER]]));
    expect(opsOf(calls, "galleries")).toEqual(
      expect.arrayContaining([["eq", "event_id", EVENT], ["eq", "photographer_id", OWNER], ["eq", "is_portfolio_only", false], ["order", "created_at", { ascending: false }]]),
    );
    expect(opsOf(calls, "photographers")).toEqual(expect.arrayContaining([["eq", "id", OWNER]]));
  });

  it("opens the newest published gallery that isn't archived, in the client's language", async () => {
    const galleries = [gallery("new-draft", { published: false }), gallery("live"), gallery("old-archived", { archived_at: "2026-01-01" })];
    expect(await magnetGuestState(world({ galleries, clientLang: "en" }).db, CODE)).toEqual({ kind: "gallery", lang: "en", galleryId: "live" });
  });

  it("no gallery yet, or not published: the photos are coming, with the studio and its portfolio", async () => {
    const expected = { kind: "soon", lang: "he", studio: { name: "סטודיו אור", logoPath: "or/logo.png", portfolioSlug: "or" } };
    expect(await magnetGuestState(world({ galleries: [] }).db, CODE)).toEqual(expected);
    expect(await magnetGuestState(world({ galleries: [gallery("d", { published: false })] }).db, CODE)).toEqual(expected);
    const noPortfolio = await magnetGuestState(world({ studio: { ...STUDIO, portfolio_enabled: false } }).db, CODE);
    expect(noPortfolio).toMatchObject({ kind: "soon", studio: { portfolioSlug: null } });
    expect(await magnetGuestState(world({ studio: null }).db, CODE)).toMatchObject({ kind: "soon", studio: { name: "", logoPath: null, portfolioSlug: null } });
  });

  it("only archived galleries: no longer available", async () => {
    expect(await magnetGuestState(world({ galleries: [gallery("a", { archived_at: "2026-09-01" })] }).db, CODE)).toMatchObject({ kind: "unavailable" });
    // A new gallery being prepared after an archived one: coming.
    const both = [gallery("draft", { published: false }), gallery("a", { archived_at: "2026-09-01" })];
    expect(await magnetGuestState(world({ galleries: both }).db, CODE)).toMatchObject({ kind: "soon" });
  });
});

describe("hasGalleryQr", () => {
  it("ignores malformed element lists", () => {
    expect(hasGalleryQr(null)).toBe(false);
    expect(hasGalleryQr([{ landscape_elements: null, portrait_elements: null }])).toBe(false);
    expect(hasGalleryQr([{ landscape_elements: "x" as never, portrait_elements: [null as never, qr("gallery") as never] }])).toBe(true);
  });
});

describe("magnetGuestShareToken", () => {
  it("reuses the gallery's guests link", async () => {
    const { db, calls } = fakeDb((table, ops) => (ops.some((o) => o[0] === "insert") ? { data: null } : { data: { token: "tok-1" } }));
    expect(await magnetGuestShareToken(db, "g1")).toBe("tok-1");
    expect(calls).toHaveLength(1);
    expect(calls[0].ops).toEqual(expect.arrayContaining([["eq", "gallery_id", "g1"], ["eq", "purpose", "magnet_guests"]]));
  });

  it("makes it on the first scan: every tab, every photo, web quality, read-only", async () => {
    const { db, calls } = fakeDb((_table, ops) => (ops.some((o) => o[0] === "insert") ? { data: { token: "tok-new" } } : { data: null }));
    expect(await magnetGuestShareToken(db, "g1")).toBe("tok-new");
    const insert = calls[1].ops.find((o) => o[0] === "insert");
    expect(calls[1].table).toBe("gallery_share_links");
    expect(insert?.[1]).toEqual({ gallery_id: "g1", folder_keys: null, photo_ids: null, quality: "web", purpose: "magnet_guests" });
  });

  it("two first scans at once: the one that lost the race reads the winner's link", async () => {
    let reads = 0;
    const { db } = fakeDb((_table, ops) => {
      if (ops.some((o) => o[0] === "insert")) return { data: null, error: { code: "23505", message: "duplicate key" } };
      reads += 1;
      return { data: reads === 1 ? null : { token: "tok-winner" } };
    });
    expect(await magnetGuestShareToken(db, "g1")).toBe("tok-winner");
  });
});
