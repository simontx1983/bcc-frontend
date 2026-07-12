"use client";

/**
 * RightRail slot — lets a page swap the right sidebar's contents without
 * touching the route tree (the Reddit pattern: left rail fixed, right rail
 * follows the content). AppShell renders `<RightRailOutlet>`, which shows
 * the default `<RightSidebar>` until a page registers post-specific data
 * via `useRegisterRightRail`, then shows `<PostRightRail>` instead.
 *
 * Chosen over a parallel/intercepting `@rightbar` route on purpose:
 * this is a plain client context (no route surgery), which sidesteps the
 * Next 15 parallel-route breakage we already hit — and it's cheaper: no
 * extra RSC payload, the swap is a local state flip.
 *
 * We store DATA (author + feedId), not JSX, so the outlet owns rendering
 * and a child can't smuggle a foreign hook tree into the sidebar.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { FeedAuthor } from "@/lib/api/types";

export interface RightRailData {
  author: FeedAuthor;
  feedId: string;
}

interface RightRailContextValue {
  data: RightRailData | null;
  register: (data: RightRailData) => void;
  clear: () => void;
}

const RightRailContext = createContext<RightRailContextValue | null>(null);

export function RightRailProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<RightRailData | null>(null);
  const register = useCallback((next: RightRailData) => setData(next), []);
  const clear = useCallback(() => setData(null), []);
  // Memoized so consumers only re-render when `data` actually changes.
  const value = useMemo(() => ({ data, register, clear }), [data, register, clear]);
  return (
    <RightRailContext.Provider value={value}>{children}</RightRailContext.Provider>
  );
}

export function useRightRail(): RightRailData | null {
  return useContext(RightRailContext)?.data ?? null;
}

/**
 * Register post-context for the right rail. Keyed on `feedId` so it fires
 * once per post (the latest author is read from a ref to avoid a
 * register→setState→rerender loop). Clears on unmount / navigation away.
 */
export function useRegisterRightRail(data: RightRailData): void {
  const ctx = useContext(RightRailContext);
  const register = ctx?.register;
  const clear = ctx?.clear;
  // Latest data read via ref so re-registering never depends on the
  // (per-render) object identity — only `feedId` drives re-runs.
  const dataRef = useRef(data);
  dataRef.current = data;
  const feedId = data.feedId;

  useEffect(() => {
    if (register === undefined || clear === undefined) return undefined;
    register(dataRef.current);
    return () => clear();
  }, [register, clear, feedId]);
}
