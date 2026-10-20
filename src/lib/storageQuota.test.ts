import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { SubscriptionPlan } from "@/lib/stages";
import { checkStorageQuota } from "@/lib/storageQuota";
import type { SubscriptionStatus } from "@/lib/types";

const GB = 1024 ** 3;

type Row = { plan: SubscriptionPlan; subscription_status: SubscriptionStatus; trial_ends_at: string | null };

// An in-memory stand-in for the two calls checkStorageQuota makes: the photographer row and the
// storage-usage RPC. No database involved.
function fakeClient(row: Row | null, usedBytes: number | string | null) {
  const rpc = vi.fn(async () => ({ data: usedBytes, error: null }));
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
    rpc,
  };
  return { client: client as unknown as SupabaseClient, rpc };
}

const check = async (row: Row | null, used: number | string | null) => {
  const { client, rpc } = fakeClient(row, used);
  return { result: await checkStorageQuota(client, "ph-1"), rpc };
};

const active = (plan: SubscriptionPlan): Row => ({ plan, subscription_status: "active", trial_ends_at: null });

describe("checkStorageQuota", () => {
  it("lets an unknown photographer through (the caller reports not-found)", async () => {
    const { result, rpc } = await check(null, 0);
    expect(result).toEqual({ ok: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never caps Pro+, and doesn't even measure its usage", async () => {
    for (const plan of ["studio_pro_monthly", "studio_pro_annual"] as const) {
      const { result, rpc } = await check(active(plan), 5000 * GB);
      expect(result, plan).toEqual({ ok: true });
      expect(rpc, plan).not.toHaveBeenCalled();
    }
  });

  it("caps Pro Start at 100GB, blocking at the cap itself", async () => {
    expect((await check(active("basic_monthly"), 100 * GB - 1)).result).toEqual({ ok: true });
    const atCap = (await check(active("basic_annual"), 100 * GB)).result;
    expect(atCap.ok).toBe(false);
    expect(!atCap.ok && atCap.error).toContain("(100GB)");
    expect((await check(active("basic_monthly"), 120 * GB)).result.ok).toBe(false);
  });

  it("caps Pro at 750GB", async () => {
    expect((await check(active("monthly"), 750 * GB - 1)).result).toEqual({ ok: true });
    const atCap = (await check(active("annual"), 750 * GB)).result;
    expect(atCap.ok).toBe(false);
    expect(!atCap.ok && atCap.error).toContain("(750GB)");
  });

  it("caps a trial at 5GB even though it runs on Pro+", async () => {
    const trial: Row = { plan: "studio_pro_monthly", subscription_status: "trialing", trial_ends_at: "2026-11-01T00:00:00Z" };
    expect((await check(trial, 5 * GB - 1)).result).toEqual({ ok: true });
    const atCap = (await check(trial, 5 * GB)).result;
    expect(atCap.ok).toBe(false);
    expect(!atCap.ok && atCap.error).toContain("(5GB)");
  });

  it("uses the plan's cap for a legacy trialing row without a trial end date", async () => {
    const legacy: Row = { plan: "basic_monthly", subscription_status: "trialing", trial_ends_at: null };
    expect((await check(legacy, 50 * GB)).result).toEqual({ ok: true });
    expect((await check(legacy, 100 * GB)).result.ok).toBe(false);
  });

  it("reads usage that comes back as a string (Postgres bigint)", async () => {
    expect((await check(active("basic_monthly"), String(100 * GB))).result.ok).toBe(false);
    expect((await check(active("basic_monthly"), String(10 * GB))).result.ok).toBe(true);
  });

  it("treats missing usage as nothing used", async () => {
    expect((await check(active("basic_monthly"), null)).result).toEqual({ ok: true });
  });

  it("asks for the photographer's own usage", async () => {
    const { rpc } = await check(active("monthly"), 0);
    expect(rpc).toHaveBeenCalledWith("photographer_storage_bytes", { p_photographer_id: "ph-1" });
  });
});
