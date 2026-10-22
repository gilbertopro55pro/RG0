import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FOLLOW_LOST_ERROR,
  cancelAlbumExport,
  exportPct,
  getAlbumExports,
  parseStoredExports,
  resetAlbumExportsForTests,
  runningAlbumExport,
  sendAlbumExportToBackground,
  startAlbumExport,
} from "@/lib/albumExports";

// Album exports that keep going in the background (owner, 2026-10-22). The store creates the job,
// follows it, and keeps the finished file for the card; no screen has to stay open for it.

type Reply = { status: number; body: unknown };
type Call = { url: string; method: string; keepalive?: boolean };

let calls: Call[] = [];
let createReplies: Reply[] = [];
let pollReplies: (Reply | "network")[] = [];

const job = (o: Partial<{ status: string; processedCount: number; totalCount: number; qualityStepIndex: number; errorMessage: string | null; downloadUrl: string | null; filename: string | null }> = {}) => ({
  status: 200,
  body: { status: "processing", processedCount: 0, totalCount: 10, qualityStepIndex: 0, errorMessage: null, downloadUrl: null, filename: null, ...o },
});

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  createReplies = [];
  pollReplies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit & { keepalive?: boolean }) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, keepalive: init?.keepalive });
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      let reply: Reply | "network" | undefined;
      if (method === "POST") reply = createReplies.shift();
      else if (method === "GET") reply = pollReplies.length > 1 ? pollReplies.shift() : pollReplies[0];
      else reply = { status: 200, body: { ok: true } };
      if (!reply) throw new Error(`no reply for ${method} ${url}`);
      if (reply === "network") throw new TypeError("network error");
      const r = reply;
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response;
    })
  );
});

afterEach(() => {
  resetAlbumExportsForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const start = (o: Partial<Parameters<typeof startAlbumExport>[0]> = {}) =>
  startAlbumExport({ galleryId: "g1", galleryTitle: "עדן", format: "pdf", from: 1, to: 20, allowSaveDialog: true, ...o });

describe("startAlbumExport", () => {
  it("creates the job, follows its progress and keeps the finished file", async () => {
    createReplies = [{ status: 200, body: { jobId: "j1" } }];
    pollReplies = [job({ processedCount: 5, totalCount: 10 }), job({ status: "ready", processedCount: 10, downloadUrl: "https://r2/x.pdf", filename: "אלבום - עדן.pdf" })];
    const task = start();
    expect(calls[0]).toMatchObject({ url: "/api/galleries/g1/album/export-pdf", method: "POST" });
    await vi.advanceTimersByTimeAsync(0);
    expect(getAlbumExports()[0]).toMatchObject({ jobId: "j1", phase: "running", pct: 30 });
    await vi.advanceTimersByTimeAsync(1200);
    expect(getAlbumExports()[0]).toMatchObject({ id: task.id, phase: "ready", pct: 100, downloadUrl: "https://r2/x.pdf", filename: "אלבום - עדן.pdf", allowSaveDialog: true });
    expect(runningAlbumExport()).toBeUndefined();
  });

  it("waits for the PDF server after a deploy instead of failing", async () => {
    createReplies = [
      { status: 503, body: { error: "שרת הרינדור עדיין לא עודכן" } },
      { status: 200, body: { jobId: "j1" } },
    ];
    pollReplies = [job()];
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(getAlbumExports()[0]).toMatchObject({ waitingForServer: true, jobId: null, phase: "running" });
    await vi.advanceTimersByTimeAsync(4000);
    expect(getAlbumExports()[0]).toMatchObject({ waitingForServer: false, jobId: "j1" });
  });

  it("follows an export already running elsewhere as what it really is", async () => {
    createReplies = [{ status: 200, body: { jobId: "j9", alreadyActive: true, format: "jpg", galleryId: "g2" } }];
    pollReplies = [job()];
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(getAlbumExports()[0]).toMatchObject({ jobId: "j9", alreadyActive: true, format: "jpg", galleryId: "g2", galleryTitle: null, allowSaveDialog: false, mimeType: "application/zip" });
    expect(calls.at(-1)?.url).toBe("/api/galleries/g2/album/export-jobs/j9");
  });

  it("brings the running export back to the front instead of starting another", async () => {
    createReplies = [{ status: 200, body: { jobId: "j1" } }];
    pollReplies = [job()];
    const first = start();
    await vi.advanceTimersByTimeAsync(0);
    sendAlbumExportToBackground(first.id);
    expect(getAlbumExports()[0].background).toBe(true);
    const again = start({ format: "psd" });
    expect(again.id).toBe(first.id);
    expect(getAlbumExports()).toHaveLength(1);
    expect(getAlbumExports()[0].background).toBe(false);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("a new export replaces the card of a finished one", async () => {
    createReplies = [{ status: 400, body: { error: "אין עדיין עמודים באלבום" } }, { status: 200, body: { jobId: "j2" } }];
    pollReplies = [job()];
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(getAlbumExports()[0]).toMatchObject({ phase: "failed", error: "אין עדיין עמודים באלבום" });
    start({ format: "jpg" });
    await vi.advanceTimersByTimeAsync(0);
    expect(getAlbumExports()).toHaveLength(1);
    expect(getAlbumExports()[0]).toMatchObject({ format: "jpg", jobId: "j2" });
  });
});

describe("following the job", () => {
  it("cancel stops the job on the server and stops polling", async () => {
    createReplies = [{ status: 200, body: { jobId: "j1" } }];
    pollReplies = [job()];
    const task = start();
    await vi.advanceTimersByTimeAsync(0);
    cancelAlbumExport(task.id);
    expect(calls.at(-1)).toMatchObject({ url: "/api/galleries/g1/album/export-jobs/j1", method: "DELETE", keepalive: true });
    const before = calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls.length).toBe(before);
    expect(getAlbumExports()).toHaveLength(0);
  });

  it("shows the server's error when the render fails", async () => {
    createReplies = [{ status: 200, body: { jobId: "j1" } }];
    pollReplies = [job({ status: "failed", errorMessage: "רינדור עמוד 4 נכשל" })];
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(getAlbumExports()[0]).toMatchObject({ phase: "failed", error: "רינדור עמוד 4 נכשל" });
  });

  it("drops an export cancelled from another tab", async () => {
    createReplies = [{ status: 200, body: { jobId: "j1" } }];
    pollReplies = [job({ status: "cancelled" })];
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(getAlbumExports()).toHaveLength(0);
  });

  it("rides out a few failed polls, and gives up with the email fallback after many", async () => {
    createReplies = [{ status: 200, body: { jobId: "j1" } }];
    pollReplies = ["network", "network", job({ processedCount: 2 }), "network"];
    start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(getAlbumExports()[0]).toMatchObject({ phase: "running", pct: 12 });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(getAlbumExports()[0]).toMatchObject({ phase: "failed", error: FOLLOW_LOST_ERROR });
  });

  it("a ready job without a file is a failure, not an endless wait", async () => {
    createReplies = [{ status: 200, body: { jobId: "j1" } }];
    pollReplies = [job({ status: "ready", downloadUrl: null })];
    start();
    await vi.advanceTimersByTimeAsync(0);
    expect(getAlbumExports()[0].phase).toBe("failed");
  });
});

describe("exportPct", () => {
  it("never falls back to 0% on a PDF quality retry", () => {
    expect(exportPct("pdf", { qualityStepIndex: 0, processedCount: 10, totalCount: 10 })).toBe(60);
    expect(exportPct("pdf", { qualityStepIndex: 1, processedCount: 0, totalCount: 10 })).toBe(60);
    expect(exportPct("jpg", { qualityStepIndex: 0, processedCount: 3, totalCount: 12 })).toBe(25);
    expect(exportPct("psd", { qualityStepIndex: 0, processedCount: 0, totalCount: 0 })).toBe(0);
  });
});

describe("parseStoredExports", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  const ok = { id: "e1", jobId: "j1", galleryId: "g1", galleryTitle: "עדן", format: "pdf", allowSaveDialog: true, clientPhone: null, clientLang: "he", startedAt: now - 60_000 };

  it("picks running exports back up after a reload", () => {
    expect(parseStoredExports(JSON.stringify([ok]), now)).toHaveLength(1);
  });

  it("ignores broken, foreign or old entries", () => {
    expect(parseStoredExports(null, now)).toEqual([]);
    expect(parseStoredExports("{not json", now)).toEqual([]);
    expect(parseStoredExports(JSON.stringify({ a: 1 }), now)).toEqual([]);
    expect(parseStoredExports(JSON.stringify([{ ...ok, jobId: null }, { ...ok, format: "zip" }, { ...ok, startedAt: now - 7 * 3600_000 }]), now)).toEqual([]);
  });
});
