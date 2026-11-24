/**
 * Permanent route moves, applied by `redirects()` in next.config.ts.
 *
 * Kept at the routing layer rather than as redirecting pages, so the hop
 * happens before anything renders and the old route folders can go.
 * Every entry is `permanent: true` (308). Browsers and crawlers CACHE a
 * 308, so a wrong destination here is hard to take back: only add a move
 * once the destination is its durable home.
 *
 * Next passes the request's query string through to a destination that
 * has none of its own, so filters in old links (`?chain=`, `?q=`,
 * `?page=`) survive the hop.
 *
 * Order matters: Next takes the FIRST match, so a `has` entry must sit
 * above the bare entry for the same source. `has.value` is matched as an
 * anchored regex (`^value$`), so `kind=project` never matches
 * `kind=projects`.
 *
 * Site Structure A (Explore = pages, Members = people):
 *   - /directory    → /explore (its Projects and Creators views go to
 *                     their own tabs; the old mixed "all kinds" view
 *                     lands on Validators, Explore's first tab)
 *   - /validators   → /explore (Explore ▸ Validators is that page, moved)
 *   - /mentors      → /members/mentors
 *
 * …and Communities = places you join, Halls included:
 *   - /halls        → /communities?tab=halls (Communities ▸ Halls; a
 *                     `?chain=` / `?page=` on the old link is kept, and
 *                     the destination's own `tab=halls` wins)
 *   - /halls/:slug  → /communities/:slug (a Hall's slug IS its group
 *                     slug, so this is 1:1; one Hall page)
 *
 * The server still emits some of these old paths in links (notification
 * fallbacks, search results), which is why they forward rather than 404.
 */

export interface RouteMove {
  source: string;
  destination: string;
  permanent: true;
  has?: { type: "query"; key: string; value: string }[];
}

/** The /settings/* route space is retired: every editor is an owner-only
 *  tab of /u/[handle], and `/u/me` resolves to the signed-in member. The
 *  catch-all also covers paths that were linked in-app but never existed
 *  (/settings/connections, /settings/wallets). */
const SETTINGS_MOVES: RouteMove[] = [
  { source: "/settings/profile", destination: "/u/me?tab=profile", permanent: true },
  { source: "/settings/identity", destination: "/u/me?tab=profile", permanent: true },
  { source: "/settings/account", destination: "/u/me?tab=account", permanent: true },
  { source: "/settings/privacy", destination: "/u/me?tab=privacy", permanent: true },
  { source: "/settings/notifications", destination: "/u/me?tab=notifications", permanent: true },
  { source: "/settings/messages", destination: "/u/me?tab=messages", permanent: true },
  { source: "/settings/communities", destination: "/u/me?tab=communities", permanent: true },
  { source: "/settings/nft-showcase", destination: "/u/me?tab=showcase", permanent: true },
  { source: "/settings/blocks", destination: "/u/me?tab=blocks", permanent: true },
  { source: "/settings", destination: "/u/me?tab=profile", permanent: true },
  { source: "/settings/:path*", destination: "/u/me?tab=profile", permanent: true },
];

const STRUCTURE_A_MOVES: RouteMove[] = [
  {
    source: "/directory",
    has: [{ type: "query", key: "kind", value: "project" }],
    destination: "/explore/projects",
    permanent: true,
  },
  {
    source: "/directory",
    has: [{ type: "query", key: "kind", value: "creator" }],
    destination: "/explore/creators",
    permanent: true,
  },
  { source: "/directory", destination: "/explore", permanent: true },
  { source: "/validators", destination: "/explore", permanent: true },
  { source: "/mentors", destination: "/members/mentors", permanent: true },
  { source: "/halls", destination: "/communities?tab=halls", permanent: true },
  { source: "/halls/:slug", destination: "/communities/:slug", permanent: true },
];

export const ROUTE_MOVES: readonly RouteMove[] = [...SETTINGS_MOVES, ...STRUCTURE_A_MOVES];
