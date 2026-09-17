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
