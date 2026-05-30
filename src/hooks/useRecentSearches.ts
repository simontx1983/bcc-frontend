"use client";

/**
 * useRecentSearches — localStorage-backed last-N searches store.
 *
 * Key: `bcc-recent-searches` (kebab-case matches the existing
 * `bcc-sidebar-collapsed`, `bcc-theme`, `bcc-accent` keys in AppShell
 * and SiteHeader). FIFO with case-insensitive dedupe, capped at 5.
 *
 * SSR-safe: the initial render returns an empty list (so hydration
 * matches the server output) and a useEffect rehydrates from
 * localStorage on the client. The "deferred read" pattern is the same
 * one [AppShell](../components/layout/AppShell.tsx) uses for its
 * sidebar collapse preference.
 */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "bcc-recent-searches";
const MAX_RECENT = 5;
const MIN_LENGTH = 2;

function readFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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

function writeToStorage(list: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
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

  // Defer the localStorage read to a useEffect so server-rendered HTML
  // matches the first client render (empty list), then rehydrate.
  useEffect(() => {
    setRecent(readFromStorage());
  }, []);

  const push = useCallback((query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_LENGTH) return;
    setRecent((prev) => {
      const next = [
        trimmed,
        ...prev.filter((q) => q.toLowerCase() !== trimmed.toLowerCase()),
      ].slice(0, MAX_RECENT);
      writeToStorage(next);
      return next;
    });
  }, []);

  const remove = useCallback((query: string) => {
    setRecent((prev) => {
      const next = prev.filter((q) => q !== query);
      writeToStorage(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setRecent([]);
    writeToStorage([]);
  }, []);

  return { recent, push, remove, clear };
}
