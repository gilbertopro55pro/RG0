import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentTasksSummary,
  loadTasksSummary,
  publishTasksSummary,
  refreshTasksSummaryIfStale,
  resetTasksSummaryForTests,
  updateTasksSummary,
} from "@/components/tasks/tasksSummary";

// The tasks entries' shared summary: the home screen's button and the top nav (owner, 2026-11-01).

const photographer = { photographer: true as const, photographerId: "u1", openCount: 2, morningDigest: { enabled: true, minutes: 480 } };

function jsonResponse(body: unknown, init: { status?: number; redirected?: boolean } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    redirected: init.redirected ?? false,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetTasksSummaryForTests();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("loadTasksSummary", () => {
  it("keeps the server's answer", async () => {
    fetchMock.mockResolvedValue(jsonResponse(photographer));
    await expect(loadTasksSummary()).resolves.toEqual(photographer);
    expect(currentTasksSummary()).toEqual(photographer);
    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/summary", { cache: "no-store" });
  });

  it("one request at a time", async () => {
    fetchMock.mockResolvedValue(jsonResponse(photographer));
    await Promise.all([loadTasksSummary(), loadTasksSummary()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("signed out (sent to the login page) is not a photographer", async () => {
    fetchMock.mockResolvedValue(jsonResponse(null, { redirected: true }));
    await loadTasksSummary();
    expect(currentTasksSummary()).toEqual({ photographer: false });
  });

  it("an error or no network keeps what was known", async () => {
    publishTasksSummary(photographer);
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "x" }, { status: 500 }));
    await expect(loadTasksSummary()).resolves.toBeNull();
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await expect(loadTasksSummary()).resolves.toBeNull();
    expect(currentTasksSummary()).toEqual(photographer);
  });

  it("a panel's change while the request was out wins over the older answer", async () => {
    publishTasksSummary(photographer);
    let answer: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
    const pending = loadTasksSummary();
    updateTasksSummary({ openCount: 5 });
    answer(jsonResponse({ ...photographer, openCount: 2 }));
    await pending;
    expect(currentTasksSummary()).toMatchObject({ openCount: 5 });
  });
});

describe("updateTasksSummary", () => {
  it("changes the count and the reminder's settings of a photographer only", () => {
    updateTasksSummary({ openCount: 4 });
    expect(currentTasksSummary()).toBeNull();
    publishTasksSummary(photographer);
    updateTasksSummary({ openCount: 4, morningDigest: { enabled: false, minutes: 480 } });
    expect(currentTasksSummary()).toEqual({ ...photographer, openCount: 4, morningDigest: { enabled: false, minutes: 480 } });
  });

  it("the same values change nothing (no new object, no re-render)", () => {
    publishTasksSummary(photographer);
    const before = currentTasksSummary();
    updateTasksSummary({ openCount: 2, morningDigest: { enabled: true, minutes: 480 } });
    expect(currentTasksSummary()).toBe(before);
  });
});

describe("refreshTasksSummaryIfStale", () => {
  it("asks when nothing is known, then not again within a minute", async () => {
    fetchMock.mockResolvedValue(jsonResponse(photographer));
    refreshTasksSummaryIfStale();
    await vi.waitFor(() => expect(currentTasksSummary()).toEqual(photographer));
    refreshTasksSummaryIfStale(Date.now() + 59_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    refreshTasksSummaryIfStale(Date.now() + 61_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("what the home screen published counts as fresh", () => {
    publishTasksSummary(photographer);
    refreshTasksSummaryIfStale();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an account known not to be a photographer isn't asked again", () => {
    publishTasksSummary({ photographer: false });
    refreshTasksSummaryIfStale(Date.now() + 10 * 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
