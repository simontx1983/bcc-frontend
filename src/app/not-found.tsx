/**
 * Root not-found — Next's global 404 fallback for any unmatched route
 * (or an explicit `notFound()` call) anywhere in the app. Thin server
 * wrapper only so this can carry real `<title>` metadata; the actual
 * page is NotFoundContent (client — animation, search, router.back()).
 */

import type { Metadata } from "next";

import { NotFoundContent } from "@/components/errors/NotFoundContent";

export const metadata: Metadata = {
  title: "Page not found · Blue Collar Crypto",
};

export default function NotFound() {
  return <NotFoundContent />;
}
