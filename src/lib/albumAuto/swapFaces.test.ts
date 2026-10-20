import { afterEach, describe, expect, it, vi } from "vitest";
import { createFaceCache, createSerialQueue, refitAfterFaces } from "@/lib/albumAuto/swapFaces";
import type { FaceRect } from "@/lib/albumAuto/swapPhotos";
import type { AlbumElement, AlbumPhotoElement } from "@/lib/types";

// The admin's instant photo swap (GalleryManageView, owner 2026-10-20: "זה צריך להיות מהיר מאוד").

const face: FaceRect = { x: 0.4, y: 0.2, width: 0.1, height: 0.15 };

afterEach(() => {
  vi.useRealTimers();
});

describe("createFaceCache", () => {
  it("finds a photo's faces once, however many callers ask", async () => {
    const detect = vi.fn(async () => [face]);
    const cache = createFaceCache(detect);
    const [a, b] = await Promise.all([cache.facesOf("p1"), cache.facesOf("p1")]);
    expect(a).toEqual([face]);
    expect(b).toEqual([face]);
    expect(await cache.facesOf("p1")).toEqual([face]);
    expect(detect).toHaveBeenCalledTimes(1);
    expect(cache.known("p1")).toEqual([face]);
  });

  it("remembers a photo without faces as having none", async () => {
    const detect = vi.fn(async () => []);
    const cache = createFaceCache(detect);
    expect(await cache.facesOf("p1")).toEqual([]);
    await cache.facesOf("p1");
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it("doesn't remember a failure, so the next swap tries again", async () => {
    const detect = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([face]);
    const cache = createFaceCache(detect);
    expect(await cache.facesOf("p1")).toBeNull();
    expect(cache.known("p1")).toBeUndefined();
    expect(await cache.facesOf("p1")).toEqual([face]);
    expect(detect).toHaveBeenCalledTimes(2);
  });

  it("uses the stored detection without detecting, and never overrides what's known", async () => {
    const detect = vi.fn(async () => [face]);
    const cache = createFaceCache(detect);
    const stored = [{ ...face, x: 0.1 }];
    cache.seed("p1", stored);
    expect(await cache.facesOf("p1")).toBe(stored);
    cache.seed("p1", []);
    expect(cache.known("p1")).toBe(stored);
    expect(detect).not.toHaveBeenCalled();
  });

  it("waits only a moment for faces still being found, and the search carries on", async () => {
    vi.useFakeTimers();
    let finish: (f: FaceRect[]) => void = () => {};
    const cache = createFaceCache(() => new Promise((resolve) => (finish = resolve)));
    const waited = cache.within("p1", 250);
    await vi.advanceTimersByTimeAsync(250);
    expect(await waited).toBeNull();
    finish([face]);
    expect(await cache.facesOf("p1")).toEqual([face]);
  });

  it("returns at once when the faces are already in", async () => {
    vi.useFakeTimers();
    const cache = createFaceCache(async () => [face]);
    await cache.facesOf("p1");
    const got = cache.within("p1", 250);
    await vi.advanceTimersByTimeAsync(0);
    expect(await got).toEqual([face]);
  });
});

const photo = (id: string, photoId: string): AlbumPhotoElement => ({ id, type: "photo", photoId, xPct: 10, yPct: 10, widthPct: 30, heightPct: 40, focalX: 50, focalY: 40 });

describe("refitAfterFaces", () => {
  const fit = () => ({ focalX: 20, focalY: 10 });

  it("refits the photo the swap placed, leaving the rest of the page alone", () => {
    const placed = photo("e1", "pA");
    const other: AlbumElement = photo("e2", "pB");
    const spreads = [{ id: "s1", elements: [placed, other] }];
    const out = refitAfterFaces(spreads, { spreadId: "s1", elId: "e1" }, "pA", placed, fit)!;
    expect(out[0]).toMatchObject({ id: "e1", photoId: "pA", focalX: 20, focalY: 10 });
    expect(out[1]).toBe(other);
  });

  it("does nothing once the frame changed since the swap (another swap or an edit)", () => {
    const placed = photo("e1", "pA");
    const edited = { ...placed, focalX: 70 };
    expect(refitAfterFaces([{ id: "s1", elements: [edited] }], { spreadId: "s1", elId: "e1" }, "pA", placed, fit)).toBeNull();
  });

  it("does nothing when the frame holds another photo now, or is gone", () => {
    const placed = photo("e1", "pA");
    expect(refitAfterFaces([{ id: "s1", elements: [placed] }], { spreadId: "s1", elId: "e1" }, "pB", placed, fit)).toBeNull();
    expect(refitAfterFaces([{ id: "s1", elements: [] }], { spreadId: "s1", elId: "e1" }, "pA", placed, fit)).toBeNull();
    expect(refitAfterFaces([], { spreadId: "s1", elId: "e1" }, "pA", placed, fit)).toBeNull();
  });
});

describe("createSerialQueue", () => {
  it("runs saves one after another, in order, even when an earlier one is slower", async () => {
    vi.useFakeTimers();
    const enqueue = createSerialQueue();
    const order: string[] = [];
    void enqueue(async () => {
      await new Promise((r) => setTimeout(r, 300));
      order.push("first");
    });
    void enqueue(async () => {
      order.push("second");
    });
    await vi.advanceTimersByTimeAsync(299);
    expect(order).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(order).toEqual(["first", "second"]);
  });

  it("keeps going after a failed save", async () => {
    const enqueue = createSerialQueue();
    const order: string[] = [];
    await expect(
      enqueue(async () => {
        throw new Error("save failed");
      })
    ).rejects.toThrow("save failed");
    await enqueue(async () => {
      order.push("next");
    });
    expect(order).toEqual(["next"]);
  });
});
