import { beforeEach, describe, expect, it, vi } from "vitest";
import { shortClientUrl } from "@/lib/shortLinks";

// The service-role client is replaced by a fake that records the filters and answers per table.
type Op = [string, ...unknown[]];
type Call = { table: string; ops: Op[] };
let tables: Record<string, unknown[]> = {};
let calls: Call[] = [];
const fakeDb = {
  from(table: string) {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const chain: object = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") return (resolve: (v: unknown) => void) => resolve({ data: tables[table] ?? [], error: null });
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
const createServiceRoleClient = vi.fn(() => fakeDb);
vi.mock("@/lib/supabase/serviceRole", () => ({ createServiceRoleClient: () => createServiceRoleClient() }));

import { resolveShortLink } from "@/lib/shortLinkTarget";

const TOKEN = "3f2a9c1e-7b4d-4e8f-9a01-23456789abcd";
const FROM = "3f2a9c1e-7b4d-4e8f-0000-000000000000";
const TO = "3f2a9c1e-7b4d-4e8f-ffff-ffffffffffff";
const STUDIO = { name: "סטודיו אור", email: "or@example.com", logo_storage_path: "logos/or.png" };
const code = (kind: "portal" | "gallery" | "quote" | "contract") => shortClientUrl("", kind, TOKEN).slice("/s/".length);

beforeEach(() => {
  tables = {};
  calls = [];
  createServiceRoleClient.mockClear();
});

describe("resolveShortLink", () => {
  it("doesn't touch the database for a code it never made", async () => {
    expect(await resolveShortLink("nonsense")).toBeNull();
    expect(await resolveShortLink("x00000000001")).toBeNull();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("finds a portal by the token range, with the studio and the client's language", async () => {
    tables.events = [{ client_access_token: TOKEN, client_lang: "en", photographers: STUDIO }];
    expect(await resolveShortLink(code("portal"))).toEqual({
      kind: "portal",
      path: `/portal/${TOKEN}`,
      studio: { name: "סטודיו אור", logoPath: "logos/or.png" },
      lang: "en",
    });
    expect(calls[0].table).toBe("events");
    expect(calls[0].ops).toContainEqual(["gte", "client_access_token", FROM]);
    expect(calls[0].ops).toContainEqual(["lte", "client_access_token", TO]);
    expect(calls[0].ops).toContainEqual(["limit", 2]);
  });

  it("falls back to Hebrew and an empty studio when they're missing", async () => {
    tables.events = [{ client_access_token: TOKEN, client_lang: "fr", photographers: null }];
    expect(await resolveShortLink(code("portal"))).toEqual({
      kind: "portal",
      path: `/portal/${TOKEN}`,
      studio: { name: "", logoPath: null },
      lang: "he",
    });
  });

  it("gives no link when two tokens share the prefix, or none matches", async () => {
    tables.events = [
      { client_access_token: TOKEN, client_lang: null, photographers: STUDIO },
      { client_access_token: "3f2a9c1e-7b4d-4e8f-0000-000000000001", client_lang: null, photographers: STUDIO },
    ];
    expect(await resolveShortLink(code("portal"))).toBeNull();
    tables.events = [];
    expect(await resolveShortLink(code("portal"))).toBeNull();
  });

  it("finds a quote on the leads", async () => {
    tables.leads = [{ quote_token: TOKEN, client_lang: "ru", photographers: STUDIO }];
    expect(await resolveShortLink(code("quote"))).toMatchObject({ kind: "quote", path: `/quotes/${TOKEN}`, lang: "ru" });
    expect(calls[0].table).toBe("leads");
    expect(calls[0].ops).toContainEqual(["gte", "quote_token", FROM]);
  });

  it("finds a contract through its event", async () => {
    tables.event_contracts = [{ sign_token: TOKEN, events: { client_lang: "en", photographers: STUDIO } }];
    expect(await resolveShortLink(code("contract"))).toEqual({
      kind: "contract",
      path: `/contracts/${TOKEN}`,
      studio: { name: "סטודיו אור", logoPath: "logos/or.png" },
      lang: "en",
    });
    tables.event_contracts = [{ sign_token: TOKEN, events: null }];
    expect(await resolveShortLink(code("contract"))).toMatchObject({ studio: { name: "", logoPath: null }, lang: "he" });
  });

  it("finds the client's gallery, in Hebrew", async () => {
    tables.galleries = [{ access_token: TOKEN, photographers: STUDIO }];
    expect(await resolveShortLink(code("gallery"))).toEqual({
      kind: "gallery",
      path: `/gallery/${TOKEN}`,
      studio: { name: "סטודיו אור", logoPath: "logos/or.png" },
      lang: "he",
    });
    expect(calls.map((c) => c.table)).toEqual(["galleries"]);
  });

  it("falls back to a read-only share link of a gallery", async () => {
    tables.galleries = [];
    tables.gallery_share_links = [{ token: TOKEN }];
    expect(await resolveShortLink(code("gallery"))).toEqual({
      kind: "gallery",
      path: `/gallery/${TOKEN}`,
      studio: { name: "", logoPath: null },
      lang: "he",
    });
    expect(calls.map((c) => c.table)).toEqual(["galleries", "gallery_share_links"]);
    expect(calls[1].ops).toContainEqual(["gte", "token", FROM]);
    expect(calls[1].ops).toContainEqual(["lte", "token", TO]);
  });

  it("gives no gallery link when neither table has it", async () => {
    expect(await resolveShortLink(code("gallery"))).toBeNull();
  });
});
