/**
 * Tour persistence — the LOCAL layer of the two-tier store.
 *
 * Two distinct concerns, two stores:
 *
 *   - "seen" (localStorage `bcc-tour-seen`) — an append-only, monotonic
 *     set of tour ids the user has finished (or explicitly skipped). Once
 *     a tour is seen it is never un-seen. This is the durable, offline-safe
 *     mirror of the server's `bcc_tours_seen` user-meta; because both
 *     stores only ever ADD, and the effective answer is their UNION, the
 *     two can never conflict (see useToursSeen for the merge).
 *
 *   - "progress" (sessionStorage `bcc-tour-progress`) — the in-flight
 *     `{ tourId, step }` for the tour currently running. Session-scoped
 *     and NEVER synced to the server: mid-tour position is a per-tab
 *     concern, so there's no cross-device half-finished state to reconcile.
 *     It exists only so a cross-page (route-changing) step can resume
 *     after navigation.
 *
 * Every accessor is SSR-safe (typeof window guard) and defensive against
 * private-mode / quota errors (try/catch → sane fallback).
 *
 * ## Viewer scope
 *
 * Every key is scoped by viewer, and the scope is passed in rather than
 * read from a module global, so each call site shows whose tour state it
 * touches. A `null` scope means "we do not know who this is yet": reads
 * return the default and writes are dropped, because the alternative is
 * either reading another account's position or misfiling this one's.
 *
 * Scoping prevents one viewer's tour state being shown to another. It is
 * not a privacy boundary — see `lib/auth/viewer-scope`.
 */

import { scopedKey, type ViewerScope } from "@/lib/auth/viewer-scope";

const SEEN_KEY = "bcc-tour-seen";
const PROGRESS_KEY = "bcc-tour-progress";
const DISMISSED_KEY = "bcc-tour-dismissed";

export interface TourProgress {
  tourId: string;
  step: number;
}

// ── seen (localStorage) ──────────────────────────────────────────────

export function getLocalSeen(scope: ViewerScope): string[] {
  if (typeof window === "undefined") return [];
  const key = scopedKey(SEEN_KEY, scope);
  if (key === null) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function addLocalSeen(scope: ViewerScope, id: string): void {
  if (typeof window === "undefined") return;
  const key = scopedKey(SEEN_KEY, scope);
  if (key === null) return;
  try {
    const current = new Set(getLocalSeen(scope));
    if (current.has(id)) return;
    current.add(id);
    window.localStorage.setItem(key, JSON.stringify([...current]));
  } catch {
    // Ignore — worst case the tour can re-show; harmless.
  }
}

export function clearLocalSeen(scope: ViewerScope): void {
  if (typeof window === "undefined") return;
  const key = scopedKey(SEEN_KEY, scope);
  if (key === null) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ── progress (sessionStorage) ────────────────────────────────────────

export function getProgress(scope: ViewerScope): TourProgress | null {
  if (typeof window === "undefined") return null;
  const key = scopedKey(PROGRESS_KEY, scope);
  if (key === null) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as TourProgress).tourId === "string" &&
      typeof (parsed as TourProgress).step === "number"
    ) {
      return parsed as TourProgress;
    }
    return null;
  } catch {
    return null;
  }
}

export function setProgress(scope: ViewerScope, progress: TourProgress): void {
  if (typeof window === "undefined") return;
  const key = scopedKey(PROGRESS_KEY, scope);
  if (key === null) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(progress));
  } catch {
    // ignore
  }
}

export function clearProgress(scope: ViewerScope): void {
  if (typeof window === "undefined") return;
  const key = scopedKey(PROGRESS_KEY, scope);
  if (key === null) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ── session dismissal (sessionStorage) ───────────────────────────────
// A tour dismissed WITHOUT "don't show again" checked: suppressed for the
// rest of this browser session, then eligible to auto-start again next
// session. Distinct from the permanent, cross-device "seen" set.

export function isSessionDismissed(scope: ViewerScope, id: string): boolean {
  if (typeof window === "undefined") return false;
  const key = scopedKey(DISMISSED_KEY, scope);
  if (key === null) return false;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return false;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.includes(id);
  } catch {
    return false;
  }
}

export function addSessionDismissed(scope: ViewerScope, id: string): void {
  if (typeof window === "undefined") return;
  const key = scopedKey(DISMISSED_KEY, scope);
  if (key === null) return;
  try {
    const raw = window.sessionStorage.getItem(key);
    const current = new Set<string>(
      raw !== null && Array.isArray(JSON.parse(raw) as unknown)
        ? (JSON.parse(raw) as string[])
        : [],
    );
    current.add(id);
    window.sessionStorage.setItem(key, JSON.stringify([...current]));
  } catch {
    // ignore
  }
}
