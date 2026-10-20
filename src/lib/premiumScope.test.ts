import { describe, expect, it } from "vitest";
import { PREMIUM_CLASS, isClientFacingPath } from "@/lib/premiumScope";

describe("isClientFacingPath", () => {
  it("keeps the pages clients see in their own design", () => {
    for (const p of [
      "/gallery/abc123",
      "/quotes/tok",
      "/r/tok",
      "/contracts/tok",
      "/portal/tok",
      "/chat/key",
      "/p/studio-or",
      "/print/job",
    ]) {
      expect(isClientFacingPath(p), p).toBe(true);
    }
  });

  it("keeps the marketing and legal pages in their own design", () => {
    for (const p of [
      "/landing",
      "/en",
      "/ru",
      "/waitlist",
      "/terms",
      "/privacy",
      "/accessibility",
      "/cookies",
      "/cancellation-policy",
      "/business-info",
    ]) {
      expect(isClientFacingPath(p), p).toBe(true);
    }
  });

  it("matches a prefix and anything under it, with or without its trailing slash", () => {
    expect(isClientFacingPath("/gallery")).toBe(true);
    expect(isClientFacingPath("/portal/tok/stage")).toBe(true);
    expect(isClientFacingPath("/terms/section")).toBe(true);
  });

  it("gives the photographer's own pages the premium look", () => {
    for (const p of ["/events", "/events/123", "/galleries", "/galleries/abc", "/settings", "/leads", "/leads/campaigns", "/billing", "/analytics"]) {
      expect(isClientFacingPath(p), p).toBe(false);
    }
  });

  it("doesn't match a page that only starts with the same letters", () => {
    for (const p of ["/events", "/english", "/runs", "/reels", "/pricing", "/printers", "/chatter", "/terms-old", "/portfolio"]) {
      expect(isClientFacingPath(p), p).toBe(false);
    }
  });

  it("is a class name the stylesheet uses", () => {
    expect(PREMIUM_CLASS).toBe("gf-premium");
  });
});
