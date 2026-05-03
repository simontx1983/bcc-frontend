/**
 * /validators — server-side redirect to the Directory pre-filtered by
 * kind=validator. The Directory's existing filter logic is the source
 * of truth for "what is a validator"; this route is purely a nav-level
 * shortcut so the SiteHeader link goes somewhere meaningful.
 *
 * 307 (temporary) rather than 308 (permanent) — if a real /validators
 * surface ships later, we don't want browsers caching the redirect.
 */

import { redirect } from "next/navigation";

export default function ValidatorsPage() {
  redirect("/directory?kind=validator");
}