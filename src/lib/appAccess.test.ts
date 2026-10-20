import { describe, expect, it } from "vitest";
import { ADMIN_EMAIL } from "@/lib/admin";
import { ACCESS_COLUMNS, LOCKED_ALLOWED_API, isLockedOut, isWriteMethod, lockedOutResponse, type AccessRow } from "@/lib/appAccess";
import type { SubscriptionStatus } from "@/lib/types";

const NOW = new Date("2026-10-20T09:00:00Z");
const DAY = 86_400_000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();
const row = (subscription_status: SubscriptionStatus, trial_ends_at: string | null = null, email = "studio@example.com"): AccessRow => ({
  email,
  subscription_status,
  trial_ends_at,
});

// The proxy's matching rule for LOCKED_ALLOWED_API (src/lib/supabase/middleware.ts).
const allowedWhileLocked = (pathname: string) => LOCKED_ALLOWED_API.some((p) => pathname === p || pathname.startsWith(`${p}/`));

describe("isLockedOut", () => {
  it("never locks a request without a photographer row (a team member)", () => {
    expect(isLockedOut(null, NOW)).toBe(false);
    expect(isLockedOut(undefined, NOW)).toBe(false);
  });

  it("doesn't lock a paid account", () => {
    expect(isLockedOut(row("active"), NOW)).toBe(false);
    expect(isLockedOut(row("active", at(-90 * DAY)), NOW)).toBe(false);
  });

  it("doesn't lock a running trial", () => {
    expect(isLockedOut(row("trialing", at(1)), NOW)).toBe(false);
  });

  it("locks a trial from the moment it ends", () => {
    expect(isLockedOut(row("trialing", at(0)), NOW)).toBe(true);
    expect(isLockedOut(row("trialing", at(-DAY)), NOW)).toBe(true);
  });

  it("doesn't lock a legacy trialing row without an end date", () => {
    expect(isLockedOut(row("trialing", null), NOW)).toBe(false);
  });

  it("locks unpaid, canceled and incomplete accounts", () => {
    expect(isLockedOut(row("past_due"), NOW)).toBe(true);
    expect(isLockedOut(row("canceled"), NOW)).toBe(true);
    expect(isLockedOut(row("incomplete"), NOW)).toBe(true);
    expect(isLockedOut(row("canceled", at(5 * DAY)), NOW)).toBe(true);
  });

  it("never locks the admin", () => {
    for (const s of ["past_due", "canceled", "incomplete"] as const) {
      expect(isLockedOut(row(s, null, ADMIN_EMAIL), NOW), s).toBe(false);
    }
    expect(isLockedOut(row("trialing", at(-DAY), ADMIN_EMAIL), NOW)).toBe(false);
  });
});

describe("ACCESS_COLUMNS", () => {
  it("selects exactly the fields isLockedOut reads", () => {
    // A missing trial_ends_at would read as a legacy trial and let an ended trial write.
    expect(ACCESS_COLUMNS.split(",").map((c) => c.trim()).sort()).toEqual(["email", "subscription_status", "trial_ends_at"]);
  });
});

describe("LOCKED_ALLOWED_API", () => {
  it("leaves payment, language, push devices and feedback open", () => {
    expect([...LOCKED_ALLOWED_API].sort()).toEqual(["/api/feedback", "/api/payplus", "/api/push", "/api/ui-language"]);
    expect(allowedWhileLocked("/api/payplus/checkout")).toBe(true);
    expect(allowedWhileLocked("/api/payplus/cancel")).toBe(true);
    expect(allowedWhileLocked("/api/ui-language")).toBe(true);
    expect(allowedWhileLocked("/api/push/subscribe")).toBe(true);
    expect(allowedWhileLocked("/api/feedback")).toBe(true);
  });

  it("keeps the write routes that cost money closed", () => {
    for (const p of ["/api/events", "/api/galleries/123/photos", "/api/leads", "/api/intake-credits/checkout", "/api/payplusx", "/api/pushy"]) {
      expect(allowedWhileLocked(p), p).toBe(false);
    }
  });
});

describe("isWriteMethod", () => {
  it("leaves reads open", () => {
    expect(isWriteMethod("GET")).toBe(false);
    expect(isWriteMethod("HEAD")).toBe(false);
    expect(isWriteMethod("OPTIONS")).toBe(false);
  });

  it("treats every other method as a write", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) expect(isWriteMethod(m), m).toBe(true);
  });
});

describe("lockedOutResponse", () => {
  it("answers 402 with the subscription_inactive code, in Hebrew by default", async () => {
    const res = lockedOutResponse();
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("subscription_inactive");
    expect(body.error).toContain("המנוי לא פעיל");
  });

  it("answers in English or Russian when asked", async () => {
    expect((await lockedOutResponse("en").json()).error).toContain("subscription isn't active");
    expect((await lockedOutResponse("ru").json()).error).toContain("Подписка не активна");
  });

  it("falls back to Hebrew for any other language", async () => {
    expect((await lockedOutResponse("fr").json()).error).toContain("המנוי לא פעיל");
    expect((await lockedOutResponse(null).json()).error).toContain("המנוי לא פעיל");
  });
});
