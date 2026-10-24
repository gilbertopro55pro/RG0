import { describe, expect, it, vi } from "vitest";
import { fetchRequestOf, isDataChangingRequest, markDataChanged, refreshIfDataChanged, takeDataChanged } from "@/lib/dataChanges";

const ORIGIN = "https://myframeflow.com";

describe("isDataChangingRequest", () => {
  it("counts writes to our own API", () => {
    expect(isDataChangingRequest("/api/events/1/stages", "PATCH", ORIGIN)).toBe(true);
    expect(isDataChangingRequest("/api/leads", "post", ORIGIN)).toBe(true);
    expect(isDataChangingRequest(`${ORIGIN}/api/galleries/1`, "DELETE", ORIGIN)).toBe(true);
  });

  it("counts supabase-js writes from the browser", () => {
    expect(isDataChangingRequest("https://abc.supabase.co/rest/v1/galleries?id=eq.1", "PATCH", ORIGIN)).toBe(true);
    expect(isDataChangingRequest("https://abc.supabase.co/rest/v1/rpc/claim", "POST", ORIGIN)).toBe(true);
  });

  it("ignores reads", () => {
    expect(isDataChangingRequest("/api/notifications/summary", "GET", ORIGIN)).toBe(false);
    expect(isDataChangingRequest("https://abc.supabase.co/rest/v1/galleries", "GET", ORIGIN)).toBe(false);
    expect(isDataChangingRequest("/api/x", "HEAD", ORIGIN)).toBe(false);
  });

  it("ignores what isn't our data: pages, auth, storage uploads, other sites", () => {
    expect(isDataChangingRequest("/galleries/1", "POST", ORIGIN)).toBe(false);
    expect(isDataChangingRequest("https://abc.supabase.co/auth/v1/token?grant_type=refresh_token", "POST", ORIGIN)).toBe(false);
    expect(isDataChangingRequest("https://bucket.r2.cloudflarestorage.com/galleries/a.jpg?X-Amz=1", "PUT", ORIGIN)).toBe(false);
    expect(isDataChangingRequest("https://evil.supabase.co.example.com/rest/v1/x", "POST", ORIGIN)).toBe(false);
    expect(isDataChangingRequest("https://other.com/api/x", "POST", ORIGIN)).toBe(false);
  });
});

describe("fetchRequestOf", () => {
  it("reads every form fetch() takes", () => {
    expect(fetchRequestOf("/api/a")).toEqual({ url: "/api/a", method: "GET" });
    expect(fetchRequestOf("/api/a", { method: "POST" })).toEqual({ url: "/api/a", method: "POST" });
    expect(fetchRequestOf(new URL(`${ORIGIN}/api/b`), { method: "PATCH" })).toEqual({ url: `${ORIGIN}/api/b`, method: "PATCH" });
    expect(fetchRequestOf(new Request(`${ORIGIN}/api/c`, { method: "DELETE" }))).toEqual({ url: `${ORIGIN}/api/c`, method: "DELETE" });
  });
});

describe("takeDataChanged", () => {
  it("answers true once per change", () => {
    takeDataChanged();
    expect(takeDataChanged()).toBe(false);
    markDataChanged();
    markDataChanged();
    expect(takeDataChanged()).toBe(true);
    expect(takeDataChanged()).toBe(false);
  });

  it("refreshes the router only after a change", () => {
    takeDataChanged();
    const router = { refresh: vi.fn() };
    refreshIfDataChanged(router);
    expect(router.refresh).not.toHaveBeenCalled();
    markDataChanged();
    refreshIfDataChanged(router);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});
