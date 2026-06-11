"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { SessionProvider } from "next-auth/react";
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";

import { FingerprintReporter } from "@/components/system/FingerprintReporter";
import { BadgesProvider } from "@/hooks/useBadges";

// Code-split — the modal renders null for most sessions (only fires on
// the post-auth eligible-communities activation moment), so its chunk
// stays out of the shared first-load bundle and streams in after
// hydration instead.
const EligibleCommunitiesModal = dynamic(
  () =>
    import("@/components/auth/EligibleCommunitiesModal").then(
      (m) => m.EligibleCommunitiesModal
    ),
  { ssr: false }
);

/**
 * Client-side providers — wrap every page.
 *
 * - QueryClientProvider gives every component access to React Query.
 *   The `useState` keeps a stable QueryClient across re-renders and
 *   ensures it's created in the browser (not on the server, which
 *   would cause data leaks across requests).
 * - SessionProvider exposes useSession() everywhere; reads NEXT_AUTH
 *   cookies to know who's logged in.
 *
 * Default React Query config:
 *   - staleTime: 30s — view-models from the BCC API are cheap to
 *     re-fetch but stable for a few seconds. Server returns Cache-Control
 *     `private, max-age=60` on most read endpoints; 30s here aligns.
 *   - retry: once, then surface the error to the UI so the user sees
 *     a real error state instead of a hung spinner.
 *   - refetchOnWindowFocus: false — too aggressive for the kind of
 *     content we render (cards, profiles). Re-enable per-query when
 *     it actually matters (live signals).
 *   - gcTime: 2min — unmounted query data is garbage-collected after
 *     two minutes instead of React Query's 5-minute default. Tab-heavy
 *     surfaces (profile panels, card tabs) churn through a lot of
 *     one-off queries; the shorter window keeps the cache footprint
 *     bounded without hurting back-navigation within a session.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 2 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <BadgesProvider>
          {children}
          <FingerprintReporter />
          <EligibleCommunitiesModal />
          <ReactQueryDevtools initialIsOpen={false} />
        </BadgesProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
