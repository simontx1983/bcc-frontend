"use client";

/**
 * useRecentSearches — localStorage-backed last-N searches store.
 *
 * Key: `bcc-recent-searches::<viewer>` — the family base is kebab-case to
 * match the existing `bcc-sidebar-collapsed`, `bcc-theme`, `bcc-accent`
 * keys in AppShell and SiteHeader, and the suffix is the viewer scope,
 * because search terms are content and were otherwise rendered verbatim to
 * whoever used the browser next. FIFO with case-insensitive dedupe, capped
 * at 5.
 *
 * SSR-safe: the initial render returns an empty list (so hydration
 * matches the server output) and a useEffect rehydrates from
 * localStorage on the client. The "deferred read" pattern is the same
 * one [AppShell](../components/layout/AppShell.tsx) uses for its
 * sidebar collapse preference — with the addition that the effect is keyed
 * on the scope, so it also re-reads when the viewer becomes known or
 * changes.
 */

import { useCallback, useEffect, useState } from "react";

import { useViewerScope } from "@/hooks/useViewerScope";
import { scopedKey, type ViewerScope } from "@/lib/auth/viewer-scope";

const STORAGE_KEY = "bcc-recent-searches";
const MAX_RECENT = 5;
const MIN_LENGTH = 2;

function readFromStorage(scope: ViewerScope): string[] {
  if (typeof window === "undefined") return [];
  const key = scopedKey(STORAGE_KEY, scope);
  if (key === null) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is string => typeof v === "string" && v.length >= MIN_LENGTH
    );
  } catch {
    return [];
  }
}

function writeToStorage(scope: ViewerScope, list: string[]): void {
  if (typeof window === "undefined") return;
  const key = scopedKey(STORAGE_KEY, scope);
  if (key === null) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // localStorage may be disabled (Safari private mode, locked storage
    // partitions, etc.) — silently skip; recents are best-effort UX.
  }
}

export interface UseRecentSearchesResult {
  recent: string[];
  push: (query: string) => void;
  remove: (query: string) => void;
  clear: () => void;
}

export function useRecentSearches(): UseRecentSearchesResult {
  const [recent, setRecent] = useState<string[]>([]);
  // Recents belong to whoever is searching — including a signed-out
  // visitor, who gets the anonymous scope rather than any account's.
  const scope = useViewerScope();

  // Defer the localStorage read to a useEffect so server-rendered HTML
  // matches the first client render (empty list), then rehydrate. Re-runs
  // when the scope resolves or changes, so a sign-in swaps one viewer's
  // recents for the other's rather than carrying them across.
  useEffect(() => {
    setRecent(readFromStorage(scope));
  }, [scope]);

  const push = useCallback((query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_LENGTH) return;
    setRecent((prev) => {
      const next = [
        trimmed,
        ...prev.filter((q) => q.toLowerCase() !== trimmed.toLowerCase()),
      ].slice(0, MAX_RECENT);
      writeToStorage(scope, next);
      return next;
    });
  }, [scope]);

  const remove = useCallback((query: string) => {
    setRecent((prev) => {
      const next = prev.filter((q) => q !== query);
      writeToStorage(scope, next);
      return next;
    });
  }, [scope]);

  const clear = useCallback(() => {
    setRecent([]);
    writeToStorage(scope, []);
  }, [scope]);

  return { recent, push, remove, clear };
}
