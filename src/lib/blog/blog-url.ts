import type { Route } from "next";

/**
 * The author's blog tab URL. Every blog-tab navigation routes through
 * here so the `?tab=blog` outer key (read by ProfileTabs) is never
 * dropped: BlogPanel's sub-tab switches and edits, and the status
 * composer's long-form handoff.
 */
export function blogUrl(
  handle: string,
  opts: { create?: boolean; editId?: number },
): Route {
  const editing = opts.editId !== undefined && opts.editId > 0;
  let url = `/u/${encodeURIComponent(handle)}?tab=blog`;
  if (opts.create || editing) url += "&blogsub=create";
  if (editing) url += `&edit=${opts.editId}`;
  return url as Route;
}
