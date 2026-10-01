/**
 * Pagination helpers for paged list surfaces.
 *
 * ## Why de-duplication is needed at all
 *
 * Offset and page-number pagination both address a MOVING list. Between the
 * request for page 1 and the request for page 2, a row can be inserted or
 * removed server-side, which shifts the window — so consecutive pages can
 * legitimately overlap, returning the same record twice. Nothing is wrong with
 * the server when this happens; it is inherent to offset pagination over live
 * data, and it is exactly what happens when someone gains a watcher while a
 * visitor is reading the roster.
 *
 * The accumulators this replaced did NOT handle it. They guarded against
 * applying the same PAGE twice (`seenPage` / `seenOffset`) and then
 * concatenated: `[...previous, ...page.items]`. A record present in two pages
 * was appended twice, and because both lists key their rows on the record id,
 * React then warned "Encountered two children with the same key" — measured, on
 * both panels, before this helper existed.
 *
 * `useInfiniteQuery` does not close that gap either: it owns the page LIST, not
 * the records inside it. So the guarantee is made here, once, at the point the
 * pages are flattened.
 *
 * ## First occurrence wins
 *
 * The earlier page is authoritative, which keeps the rendered order identical
 * to the order the server sent and stops a row jumping down the list when a
 * later page repeats it.
 *
 * ## This does not touch the cursor
 *
 * De-duplication is a RENDER concern. The next page param is still computed
 * from the server's own pagination block (`page` / `total_pages`, or `offset` /
 * `has_more`) on the raw page, never from the de-duplicated row count — walking
 * the cursor by what survived de-duplication would skip records every time an
 * overlap occurred.
 */

/**
 * Flattened pages with each record kept once, in first-seen order.
 *
 * @param items Rows in server order, typically `pages.flatMap((p) => p.items)`.
 */
export function dedupeById<T extends { id: number | string }>(
  items: readonly T[],
): T[] {
  const seen = new Set<T["id"]>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
