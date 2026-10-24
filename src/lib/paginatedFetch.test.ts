import { describe, expect, it } from "vitest";
import { fetchAllRows, fetchAllRowsCounted } from "@/lib/paginatedFetch";

// A table of `total` rows read through range(from, to), counting the requests and how many were
// in flight at once. `countAs` is what the count says (it can lag behind the rows actually there).
function table(total: number, countAs: number | null = total) {
  const rows = Array.from({ length: total }, (_, i) => i);
  const calls: [number, number][] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const queryPage = async (from: number, to: number) => {
    calls.push([from, to]);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight--;
    return { data: rows.slice(from, to + 1), count: countAs };
  };
  return { rows, calls, queryPage, maxInFlight: () => maxInFlight };
}

describe("fetchAllRowsCounted", () => {
  it("reads a small table in one request", async () => {
    const t = table(40);
    expect(await fetchAllRowsCounted(t.queryPage, 10 * 10)).toEqual(t.rows);
    expect(t.calls).toHaveLength(1);
  });

  it("requests the pages after the first together, and returns every row in order", async () => {
    const t = table(3589);
    expect(await fetchAllRowsCounted(t.queryPage, 1000)).toEqual(t.rows);
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999], [3000, 3999]]);
    expect(t.maxInFlight()).toBe(3);
  });

  it("reads an exact multiple of the page size without an extra page", async () => {
    const t = table(2000);
    expect(await fetchAllRowsCounted(t.queryPage, 1000)).toEqual(t.rows);
    // The last page came back full, so one more request confirms there's nothing after it.
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("still reads rows added after the count", async () => {
    const t = table(2500, 1500);
    expect(await fetchAllRowsCounted(t.queryPage, 1000)).toEqual(t.rows);
  });

  it("falls back to one page at a time without a count", async () => {
    const t = table(2500, null);
    expect(await fetchAllRowsCounted(t.queryPage, 1000)).toEqual(t.rows);
    expect(t.maxInFlight()).toBe(1);
  });

  it("returns the same rows as fetchAllRows", async () => {
    for (const n of [0, 1, 999, 1000, 1001, 4321]) {
      const a = table(n);
      const b = table(n);
      expect(await fetchAllRowsCounted(a.queryPage, 1000)).toEqual(await fetchAllRows(b.queryPage, 1000));
    }
  });
});
