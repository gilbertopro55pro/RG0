import { beforeEach, describe, expect, it, vi } from "vitest";

// The session user from the JWT's claims (getClaims), never the Auth server (getUser).
const getClaims = vi.fn();
const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims, getUser } }),
}));

describe("getSessionUser", () => {
  beforeEach(() => {
    vi.resetModules();
    getClaims.mockReset();
    getUser.mockReset();
  });

  it("returns the id and email from the verified claims, without calling the Auth server", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "u-1", email: "a@b.co", role: "authenticated" } }, error: null });
    const { getSessionUser } = await import("@/lib/supabase/sessionUser");
    expect(await getSessionUser()).toEqual({ id: "u-1", email: "a@b.co" });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns null with no session", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    const { getSessionUser } = await import("@/lib/supabase/sessionUser");
    expect(await getSessionUser()).toBeNull();
  });

  it("returns a null email when the claims have none", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "u-2" } }, error: null });
    const { getSessionUser } = await import("@/lib/supabase/sessionUser");
    expect(await getSessionUser()).toEqual({ id: "u-2", email: null });
  });
});
