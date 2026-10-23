import { beforeEach, describe, expect, it, vi } from "vitest";

// Admin dashboard › "מחיקת חשבון" (2026-10-23) against a recorded fake Supabase client: who may
// call it, which accounts it refuses, and what a delete removes.

type Op = { table: string; op: "select" | "insert"; payload?: Record<string, unknown>; filters: [string, unknown][]; head: boolean };
let ops: Op[] = [];
let deletedUsers: string[] = [];
let account: Record<string, unknown> | null;
let charges = 0;
let members: { id: string }[] = [];

const ADMIN = "admin@example.test";
const ID = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";

function respond(op: Op): { data: unknown; error: null; count?: number } {
  if (op.table === "photographers") return { data: account, error: null };
  if (op.table === "payplus_webhook_events") return { data: null, error: null, count: charges };
  if (op.table === "team_members") return op.head ? { data: null, error: null, count: members.length } : { data: members, error: null };
  if (op.head) return { data: null, error: null, count: 3 };
  if (op.table === "galleries") return { data: [{ id: "g1" }], error: null };
  return { data: [], error: null };
}

function fakeDb() {
  return {
    from(table: string) {
      const op: Op = { table, op: "select", filters: [], head: false };
      const run = () => {
        ops.push(op);
        return Promise.resolve(respond(op));
      };
      const q = {
        select: (_cols?: string, opts?: { head?: boolean }) => ((op.head = !!opts?.head), q),
        eq: (k: string, v: unknown) => (op.filters.push([k, v]), q),
        in: (k: string, v: unknown) => (op.filters.push([k, v]), q),
        not: () => q,
        returns: () => q,
        insert: (p: Record<string, unknown>) => ((op.op = "insert"), (op.payload = p), q),
        maybeSingle: run,
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej),
      };
      return q;
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          deletedUsers.push(id);
          return { error: null };
        },
      },
    },
  };
}

const session = vi.hoisted(() => ({ email: null as string | null }));
const removeAllObjectsOfOwner = vi.hoisted(() => vi.fn(async () => 5));
const removePreviewPrefixes = vi.hoisted(() => vi.fn(async () => 2));
vi.mock("@/lib/admin", () => ({ ADMIN_EMAIL: "admin@example.test" }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: session.email ? { email: session.email } : null } }) } }),
}));
vi.mock("@/lib/supabase/serviceRole", () => ({ createServiceRoleClient: () => fakeDb() }));
vi.mock("@/lib/storage", () => ({ removeAllObjectsOfOwner, removePreviewPrefixes }));

import { DELETE, GET } from "@/app/api/admin/accounts/[id]/route";

const params = (id = ID) => ({ params: Promise.resolve({ id }) });
const del = (body: unknown) => new Request("http://x/api", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  ops = [];
  deletedUsers = [];
  charges = 0;
  members = [];
  session.email = ADMIN;
  removeAllObjectsOfOwner.mockClear();
  removePreviewPrefixes.mockClear();
  account = {
    id: ID,
    name: "דני דני",
    email: "Trial.User@example.test",
    plan: "pro",
    subscription_status: "trialing",
    trial_ends_at: "2026-10-01T00:00:00Z",
    created_at: "2026-09-17T00:00:00Z",
    keep_account: false,
    payplus_recurring_uid: null,
  };
});

describe("admin account deletion", () => {
  it("is for the admin only", async () => {
    session.email = "someone@example.test";
    expect((await GET(new Request("http://x"), params())).status).toBe(403);
    expect((await DELETE(del({ confirmEmail: "trial.user@example.test" }), params())).status).toBe(403);
    session.email = null;
    expect((await DELETE(del({ confirmEmail: "trial.user@example.test" }), params())).status).toBe(403);
    expect(deletedUsers).toEqual([]);
  });

  it("shows what the account holds, and that it may be deleted", async () => {
    members = [{ id: MEMBER }];
    const res = await GET(new Request("http://x"), params());
    const { account: preview } = await res.json();
    expect(preview).toMatchObject({ email: "Trial.User@example.test", charges: 0, blocker: null });
    expect(preview.counts).toMatchObject({ galleries: 1, events: 3, photos: 3, teamMembers: 1 });
  });

  it("refuses an account that paid, has a recurring, is kept for QA, or is the admin", async () => {
    const cases: [() => void, string][] = [
      [() => (charges = 1), "paid"],
      [() => (account!.payplus_recurring_uid = "rec-1"), "recurring"],
      [() => (account!.keep_account = true), "keep_account"],
      [() => (account!.email = ADMIN), "admin"],
    ];
    for (const [setup, blocker] of cases) {
      beforeEachReset();
      setup();
      const preview = await (await GET(new Request("http://x"), params())).json();
      expect(preview.account.blocker).toBe(blocker);
      const res = await DELETE(del({ confirmEmail: account!.email }), params());
      expect(res.status).toBe(409);
      expect((await res.json()).blocker).toBe(blocker);
    }
    expect(deletedUsers).toEqual([]);
    expect(removeAllObjectsOfOwner).not.toHaveBeenCalled();
  });

  it("needs the account's email typed back", async () => {
    for (const confirmEmail of [undefined, "", "other@example.test", 42]) {
      expect((await DELETE(del({ confirmEmail }), params())).status).toBe(400);
    }
    expect(deletedUsers).toEqual([]);
    expect(removeAllObjectsOfOwner).not.toHaveBeenCalled();
  });

  it("deletes the files, the team members' logins, then the account, and logs it", async () => {
    members = [{ id: MEMBER }];
    const res = await DELETE(del({ confirmEmail: "  trial.user@EXAMPLE.test " }), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, objects: 7 });
    expect(removeAllObjectsOfOwner).toHaveBeenCalledWith(ID, expect.any(Array));
    expect(removePreviewPrefixes).toHaveBeenCalledWith(["previews/g1/"]);
    expect(deletedUsers).toEqual([MEMBER, ID]);
    const log = ops.find((o) => o.table === "deleted_accounts_log");
    expect(log?.payload).toEqual({ photographer_id: ID, reason: "admin_deleted", trial_ended_at: "2026-10-01T00:00:00Z", storage_objects_removed: 7 });
  });

  it("404s an unknown or malformed id", async () => {
    expect((await GET(new Request("http://x"), params("not-a-uuid"))).status).toBe(404);
    account = null;
    expect((await DELETE(del({ confirmEmail: "x" }), params())).status).toBe(404);
  });
});

// The "refuses" case runs several setups in one test; each starts from a clean, deletable account.
function beforeEachReset() {
  charges = 0;
  account = { ...account!, email: "Trial.User@example.test", keep_account: false, payplus_recurring_uid: null };
}
