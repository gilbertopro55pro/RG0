import { afterEach, describe, expect, it, vi } from "vitest";
import { INTAKE_ALERT_RATIO, INTAKE_PACKS, INTAKE_PACK_TAG, canBuyIntakePacks, intakePack, monthKeyIsrael } from "@/lib/intakeCredits";

describe("INTAKE_PACKS", () => {
  it("sells the owner's packs at the owner's prices (VAT included)", () => {
    expect(INTAKE_PACKS).toEqual([
      { conversations: 10, price: 10 },
      { conversations: 20, price: 18 },
      { conversations: 30, price: 25 },
      { conversations: 40, price: 33 },
      { conversations: 50, price: 40 },
    ]);
  });

  it("gets cheaper per conversation the bigger the pack", () => {
    const perConversation = INTAKE_PACKS.map((p) => p.price / p.conversations);
    for (let i = 1; i < perConversation.length; i++) expect(perConversation[i]).toBeLessThan(perConversation[i - 1]);
  });
});

describe("intakePack", () => {
  it("finds a pack by its size", () => {
    expect(intakePack(10)).toEqual({ conversations: 10, price: 10 });
    expect(intakePack(40)).toEqual({ conversations: 40, price: 33 });
    expect(intakePack(50)?.price).toBe(40);
  });

  it("is null for a size that isn't sold (a tampered checkout)", () => {
    expect(intakePack(0)).toBeNull();
    expect(intakePack(15)).toBeNull();
    expect(intakePack(100)).toBeNull();
    expect(intakePack(-10)).toBeNull();
  });
});

describe("constants", () => {
  it("tags a pack checkout so the webhook keeps it apart from the subscription", () => {
    expect(INTAKE_PACK_TAG).toBe("intake_pack:");
  });

  it("alerts at 90% of the monthly cap", () => {
    expect(INTAKE_ALERT_RATIO).toBe(0.9);
  });

  it("is open to every account", () => {
    expect(canBuyIntakePacks("someone@example.com")).toBe(true);
    expect(canBuyIntakePacks(null)).toBe(true);
    expect(canBuyIntakePacks()).toBe(true);
  });
});

describe("monthKeyIsrael", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("buckets by the month in Israel, not UTC", () => {
    expect(monthKeyIsrael(new Date("2026-09-30T21:30:00Z"))).toBe("2026-10");
    expect(monthKeyIsrael(new Date("2026-09-30T20:30:00Z"))).toBe("2026-09");
    expect(monthKeyIsrael(new Date("2026-12-31T22:30:00Z"))).toBe("2027-01");
  });

  it("defaults to now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-02-28T22:30:00Z")); // 00:30 on March 1 in Israel
    expect(monthKeyIsrael()).toBe("2027-03");
  });
});
