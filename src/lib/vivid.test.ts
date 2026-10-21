import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { vividForEmail, vividForRequest } from "@/lib/vivid";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";

const withClaims = (claims: Record<string, unknown> | null) =>
  vi.mocked(createClient).mockResolvedValue({ auth: { getClaims: async () => ({ data: claims ? { claims } : null }) } } as never);

describe("vivid look: admin only", () => {
  it("is on for the admin account only", () => {
    expect(vividForEmail(ADMIN_EMAIL)).toBe(true);
    expect(vividForEmail(ADMIN_EMAIL.toUpperCase())).toBe(true);
    expect(vividForEmail("someone@example.com")).toBe(false);
    expect(vividForEmail(null)).toBe(false);
  });

  it("reads the session, and never turns on for a page a client sees", async () => {
    withClaims({ email: ADMIN_EMAIL });
    expect(await vividForRequest("/")).toBe(true);
    expect(await vividForRequest("/events/1")).toBe(true);
    expect(await vividForRequest("/gallery/abc")).toBe(false);
    expect(await vividForRequest("/portal/abc")).toBe(false);
    withClaims({ email: "someone@example.com" });
    expect(await vividForRequest("/")).toBe(false);
    withClaims(null);
    expect(await vividForRequest("/")).toBe(false);
  });
});
