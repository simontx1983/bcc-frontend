import type { Route } from "next";

/**
 * Communities ▸ Halls, the home of the former /halls directory (Site
 * Structure A). The one place this URL is spelled; /halls forwards here
 * (src/lib/route-moves.ts). Plain module, so client components can import
 * it without pulling in the server-rendered HallsTabPanel.
 */
export const HALLS_TAB_HREF = "/communities?tab=halls" as Route;

/** Communities ▸ Halls, with an optional chain and page. */
export function hallsTabHref({ chain, page }: { chain: string | null; page?: number }): Route {
  const parts = ["tab=halls"];
  if (chain !== null) parts.push(`chain=${encodeURIComponent(chain)}`);
  if (page !== undefined) parts.push(`page=${page}`);
  return `/communities?${parts.join("&")}` as Route;
}
