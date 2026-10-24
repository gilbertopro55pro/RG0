// Supabase/PostgREST caps every request to the project's "Max Rows" API setting (Dashboard →
// Settings → API), regardless of any `.limit()` call in code — a single unbounded `.select()` on
// a gallery with more rows than that cap silently comes back truncated, with no error. A
// photographer uploading thousands of photos into one gallery is a real, common case here, so any
// query that could plausibly return more rows than that cap must paginate explicitly rather than
// rely on the project setting alone (which is itself now raised, but pagination is the fix that
// stays correct regardless of that setting).
export async function fetchAllRows<T>(
  // PromiseLike, not Promise — a Supabase query builder is thenable but isn't an actual Promise
  // instance, so passing one straight through (e.g. `(from, to) => supabase.from(...).range(from, to)`)
  // needs the wider type here to typecheck without an extra `await`/wrapper at every call site.
  queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data } = await queryPage(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

// fetchAllRows, but the pages after the first are requested together instead of one after another:
// the first page's count (the query selects with { count: "exact" }) says how many there are. A
// gallery of 3,600 photos took four round trips in a row; now two, however large it is. The query
// must have a stable order (a unique tiebreaker such as id), or rows can repeat or go missing
// between pages. Rows added after the count are still read: a full last page goes on one page at a
// time, as fetchAllRows does. Without a count it falls back to fetchAllRows.
export async function fetchAllRowsCounted<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; count?: number | null }>,
  pageSize = 1000
): Promise<T[]> {
  const first = await queryPage(0, pageSize - 1);
  const firstRows = first.data ?? [];
  if (firstRows.length < pageSize) return firstRows;
  if (first.count == null) {
    return [...firstRows, ...(await fetchAllRows((from, to) => queryPage(from + pageSize, to + pageSize), pageSize))];
  }
  const pages = Math.max(1, Math.ceil(first.count / pageSize));
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) => queryPage((i + 1) * pageSize, (i + 2) * pageSize - 1))
  );
  const rows = [...firstRows, ...rest.flatMap((r) => r.data ?? [])];
  const last = rest.length ? (rest[rest.length - 1].data ?? []) : firstRows;
  if (last.length === pageSize) {
    const offset = pages * pageSize;
    rows.push(...(await fetchAllRows((from, to) => queryPage(from + offset, to + offset), pageSize)));
  }
  return rows;
}
