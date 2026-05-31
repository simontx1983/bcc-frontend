/**
 * /binder — legacy redirect stub.
 *
 * The watchlist surface moved to /watching on 2026-05-13 per the
 * §1.1.1 additive-deprecation runway. This stub permanently redirects
 * bookmarks / external links to the canonical path. It is removed in
 * release N+1 alongside the deprecated /me/binder/* API routes.
 */

import { permanentRedirect } from "next/navigation";

export default function LegacyBinderRedirect() {
  permanentRedirect("/watching");
}
